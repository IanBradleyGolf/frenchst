import { circuitColor, circuitLinks, circuitsOf, wireGeom } from './circuits';
import { isVisible } from './layers';
import * as XLSX from 'xlsx';
import { PDFDocument, StandardFonts, rgb, degrees, type PDFPage, type PDFFont } from 'pdf-lib';
import { planBytes } from './pdf';
import { pdfSafe } from './marks';
import { byRoom, copiesOf, libraryMap, placedItems, totals, unknownComponent } from './schedule';
import { SYMBOLS } from './symbols';
import type { Component, Floor, Project } from './types';

function download(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

const stamp = () => new Date().toISOString().slice(0, 10);
const safeName = (s: string) => s.replace(/[^\w\- ]+/g, '').trim() || 'project';

/* ---------------- Excel ---------------- */

export function exportExcel(project: Project) {
  const data = project.data;
  const all = placedItems(data);
  const wb = XLSX.utils.book_new();

  const tot = totals(data, all);
  const n = copiesOf(data);
  const sumRows: Record<string, string | number>[] = tot.map((l) => ({
    Code: l.component.code,
    Component: l.component.name,
    Category: l.component.category,
    Control: l.component.control,
    Supplier: l.component.supplier,
    'Qty per dwelling': l.qty,
    [`Qty ×${n}`]: l.qty * n,
    'Supply rate': l.component.supplyRate,
    'Install rate': l.component.installRate,
    [`Supply $ ×${n}`]: l.supply * n,
    [`Install $ ×${n}`]: l.install * n,
    [`Total $ ×${n}`]: l.total * n,
  }));
  const S = (k: 'qty' | 'supply' | 'install' | 'total') => tot.reduce((a, l) => a + l[k], 0);
  sumRows.push({ Code: '', Component: 'Total', Category: '', Control: '', Supplier: '', 'Qty per dwelling': S('qty'), [`Qty ×${n}`]: S('qty') * n, 'Supply rate': '', 'Install rate': '', [`Supply $ ×${n}`]: S('supply') * n, [`Install $ ×${n}`]: S('install') * n, [`Total $ ×${n}`]: S('total') * n });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sumRows), 'Totals');

  // Code × dwelling
  const dwellings = [...new Set(all.map((p) => p.dwelling))];
  const byDw = tot.map((l) => {
    const row: Record<string, string | number> = { Code: l.component.code, Component: l.component.name };
    for (const d of dwellings) row[d] = all.filter((p) => p.code === l.component.code && p.dwelling === d).length;
    row.Total = l.qty;
    return row;
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(byDw), 'By dwelling');

  // Room × code matrix
  const codes = tot.map((l) => l.component.code);
  const rooms = byRoom(all).map((r) => {
    const row: Record<string, string | number> = { Floor: r.floor, Dwelling: r.dwelling, Room: r.room };
    for (const c of codes) row[c] = r.counts.get(c) ?? 0;
    row.Total = r.qty;
    return row;
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rooms), 'By room');

  // Every item
  const lib = libraryMap(data);
  const items = all.map((p) => {
    const it = p.floor.items.find((x) => x.id === p.itemId)!;
    const c = lib.get(p.code) ?? unknownComponent(p.code);
    return { Floor: p.floor.name, Dwelling: p.dwelling, Room: p.room, Code: p.code, Component: c.name, Circuit: p.circuit, Note: it.note ?? '', X: +it.x.toFixed(1), Y: +it.y.toFixed(1) };
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(items), 'Items');

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(data.library.map((c) => ({ Code: c.code, Name: c.name, Category: c.category, Control: c.control, Supplier: c.supplier, 'Supply rate': c.supplyRate, 'Install rate': c.installRate, Notes: c.notes ?? '' }))),
    'Library',
  );

  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  download(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${safeName(project.name)} schedule ${stamp()}.xlsx`);
}

/* ---------------- PDF ---------------- */

function hex(c: string) {
  const n = parseInt(c.replace('#', ''), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/** Draw one symbol at page point (x, y) measured from the top-left, as in the editor. */
function drawSymbol(page: PDFPage, font: PDFFont, comp: Component, x: number, y: number, rot: number, size: number, pageH: number) {
  const color = hex(comp.color);
  const white = rgb(1, 1, 1);
  const r = (-rot * Math.PI) / 180;
  const cos = Math.cos(r), sin = Math.sin(r);
  // unit (u,v; v down) -> PDF coords (y up)
  const P = (u: number, v: number) => {
    const ux = u * size, vy = -v * size;
    return { x: x + ux * cos - vy * sin, y: pageH - y + ux * sin + vy * cos };
  };
  for (const p of SYMBOLS[comp.symbol]) {
    if (p.t === 'circle') {
      const c = P(p.cx, p.cy);
      page.drawCircle({ x: c.x, y: c.y, size: p.r * size, color: p.fill ? color : white, opacity: p.fill ? 1 : 0.85, borderColor: p.fill ? undefined : color, borderWidth: p.fill ? 0 : (p.w ?? 0.18) * size });
    } else if (p.t === 'rect' || p.t === 'poly') {
      const pts = p.t === 'rect' ? [p.x, p.y, p.x + p.w, p.y, p.x + p.w, p.y + p.h, p.x, p.y + p.h] : p.pts;
      const closed = p.t === 'rect' || p.closed || p.fill;
      const fill = p.fill;
      const sw = p.t === 'rect' ? (p.sw ?? 0.18) : (p.w ?? 0.18);
      const tp = [];
      for (let i = 0; i < pts.length; i += 2) tp.push(P(pts[i], pts[i + 1]));
      // drawSvgPath takes SVG coordinates (y down) relative to (x, y) of the call.
      const d = tp.map((q, i) => `${i ? 'L' : 'M'}${q.x.toFixed(3)} ${(-q.y).toFixed(3)}`).join(' ') + (closed ? ' Z' : '');
      page.drawSvgPath(d, {
        x: 0,
        y: 0,
        color: fill ? color : closed ? white : undefined,
        opacity: fill ? 1 : 0.85,
        borderColor: fill ? undefined : color,
        borderWidth: fill ? 0 : sw * size,
      });
    } else if (p.t === 'text') {
      const fs = p.size * size;
      const w = font.widthOfTextAtSize(p.s, fs);
      const c = P(p.x, p.y);
      page.drawText(p.s, { x: c.x - (w / 2) * cos, y: c.y - fs * 0.35 + (w / 2) * sin, size: fs, font, color, rotate: degrees(-rot) });
    }
  }
}

export async function exportPdf(project: Project, opts: { labels: boolean; rooms: boolean } = { labels: true, rooms: false }) {
  const data = project.data;
  const lib = libraryMap(data);
  const out = await PDFDocument.create();
  const font = await out.embedFont(StandardFonts.Helvetica);
  const bold = await out.embedFont(StandardFonts.HelveticaBold);
  const sources = new Map<string, PDFDocument>();

  for (const floor of data.floors) {
    let src = sources.get(floor.planId);
    if (!src) {
      src = await PDFDocument.load(await planBytes(floor.planId));
      sources.set(floor.planId, src);
    }
    const [copied] = await out.copyPages(src, [floor.page - 1]);
    const page = out.addPage(copied);
    const { width: W, height: H } = page.getSize();
    const sx = W / floor.width, sy = H / floor.height;
    const s = (Math.abs(sx - 1) < 0.01 && Math.abs(sy - 1) < 0.01) ? 1 : Math.min(sx, sy);

    for (const r of floor.erase ?? []) page.drawRectangle({ x: r.x * s, y: H - (r.y + r.h) * s, width: r.w * s, height: r.h * s, color: rgb(1, 1, 1) });

    if (opts.rooms) {
      for (const r of floor.rooms) {
        const d = [];
        for (let i = 0; i < r.points.length; i += 2) d.push(`${i ? 'L' : 'M'}${(r.points[i] * s).toFixed(2)} ${(r.points[i + 1] * s - H).toFixed(2)}`);
        page.drawSvgPath(d.join(' ') + ' Z', { x: 0, y: 0, borderColor: rgb(0.15, 0.39, 0.92), borderWidth: 0.6, borderDashArray: [3, 2] });
      }
    }
    if (floor.crop) {
      const c = floor.crop;
      page.setCropBox(c.x1 * s, H - c.y2 * s, (c.x2 - c.x1) * s, (c.y2 - c.y1) * s);
      page.setMediaBox(c.x1 * s, H - c.y2 * s, (c.x2 - c.x1) * s, (c.y2 - c.y1) * s);
    }
    const visible = floor.items.filter((x) => isVisible(data, x));
    for (const [name, list] of circuitsOf({ ...floor, items: visible })) {
      const col = hex(circuitColor(name));
      for (const [p, q] of circuitLinks(list, floor.links)) {
        const { a, b, ctrl } = wireGeom(floor, p, q);
        const cx = ctrl.x, cy = ctrl.y;
        page.drawSvgPath(`M${(a.x * s).toFixed(2)} ${(a.y * s - H).toFixed(2)} Q${(cx * s).toFixed(2)} ${(cy * s - H).toFixed(2)} ${(b.x * s).toFixed(2)} ${(b.y * s - H).toFixed(2)}`, { x: 0, y: 0, borderColor: col, borderWidth: 0.6, borderDashArray: [3, 2] });
      }
    }
    for (const it of visible) {
      const c = lib.get(it.code) ?? unknownComponent(it.code);
      drawSymbol(page, bold, c, it.x * s, it.y * s, it.rot, data.symbolSize * s, H);
      if (opts.labels) {
        const ext = data.symbolSize * s * 1.15;
        page.drawText(it.circuit ? `${it.code}·${it.circuit}`.replace('·', ' ') : it.code, { x: it.x * s + ext, y: H - it.y * s + data.symbolSize * s * 0.2, size: data.symbolSize * s * 0.95, font, color: hex(c.color) });
      }
    }
    for (const t of floor.texts ?? []) {
      const th = ((t.rot ?? 0) * Math.PI) / 180, sin = Math.sin(th), cos = Math.cos(th);
      const f = t.bold ? bold : font;
      pdfSafe(t.text).split('\n').forEach((line, i) => {
        const d = t.size * (0.85 + i * 1.15);
        const px = t.x - d * sin, py = t.y + d * cos;
        if (line) page.drawText(line, { x: px * s, y: H - py * s, size: t.size * s, font: f, color: hex(t.color), rotate: degrees(-(t.rot ?? 0)) });
      });
    }
    // Title block strip
    const ox = floor.crop ? floor.crop.x1 * s : 0, oy = floor.crop ? H - floor.crop.y2 * s : 0;
    page.drawRectangle({ x: ox + 8, y: oy + 8, width: 260, height: 22, color: rgb(1, 1, 1), opacity: 0.9, borderColor: rgb(0.1, 0.1, 0.1), borderWidth: 0.5 });
    page.drawText(`${project.name} – ${floor.name}`, { x: ox + 14, y: oy + 20, size: 7.5, font: bold });
    page.drawText(`Component layout · ${stamp()} · ${floor.items.length} items`, { x: ox + 14, y: oy + 12, size: 6, font });
  }

  // Legend + schedule pages
  await scheduleSheets(out, project, font, bold);

  const bytes = await out.save();
  download(new Blob([bytes], { type: 'application/pdf' }), `${safeName(project.name)} layout ${stamp()}.pdf`);
}

async function scheduleSheets(out: PDFDocument, project: Project, font: PDFFont, bold: PDFFont) {
  const data = project.data;
  const W = 1191, H = 842; // A3 landscape
  let page = out.addPage([W, H]);
  let y = H - 50;
  const line = (cols: { t: string; x: number; w?: number; right?: boolean; f?: PDFFont }[], size = 8) => {
    for (const c of cols) {
      const f = c.f ?? font;
      const tw = f.widthOfTextAtSize(c.t, size);
      page.drawText(c.t, { x: c.right && c.w ? c.x + c.w - tw : c.x, y, size, font: f });
    }
    y -= size + 5;
  };
  const newPage = () => {
    page = out.addPage([W, H]);
    y = H - 50;
  };
  page.drawText(`${project.name} – component schedule`, { x: 40, y, size: 16, font: bold });
  y -= 28;

  const n = copiesOf(data);
  const sections: { title: string; floors: Floor[] }[] = [{ title: `Component schedule – one dwelling, quantities and costs for ${n} identical dwellings`, floors: data.floors }];
  for (const f of data.floors) sections.push({ title: f.name, floors: [f] });

  for (const sec of sections) {
    const items = placedItems(data, sec.floors);
    if (!items.length) continue;
    const tot = totals(data, items);
    if (y < 120 + tot.length * 13) newPage();
    page.drawText(sec.title, { x: 40, y, size: 11, font: bold });
    y -= 18;
    line([
      { t: 'Symbol', x: 40, f: bold }, { t: 'Code', x: 80, f: bold }, { t: 'Component', x: 130, f: bold }, { t: 'Control', x: 470, f: bold }, { t: 'Supplier', x: 560, f: bold },
      { t: 'Per dwelling', x: 640, w: 60, right: true, f: bold }, { t: `Qty ×${n}`, x: 710, w: 50, right: true, f: bold },
      { t: 'Supply $', x: 770, w: 70, right: true, f: bold }, { t: 'Install $', x: 850, w: 70, right: true, f: bold }, { t: 'Total $', x: 930, w: 80, right: true, f: bold },
    ]);
    for (const l of tot) {
      drawSymbol(page, bold, l.component, 52, H - y - 3, 0, 4, H);
      line([
        { t: l.component.code, x: 80 }, { t: l.component.name.slice(0, 60), x: 130 }, { t: l.component.control, x: 470 }, { t: l.component.supplier, x: 560 },
        { t: String(l.qty), x: 640, w: 60, right: true }, { t: String(l.qty * n), x: 710, w: 50, right: true },
        { t: fmt(l.supply * n), x: 770, w: 70, right: true }, { t: fmt(l.install * n), x: 850, w: 70, right: true }, { t: fmt(l.total * n), x: 930, w: 80, right: true },
      ]);
      if (y < 50) newPage();
    }
    const S = (k: 'qty' | 'supply' | 'install' | 'total') => tot.reduce((a, l) => a + l[k], 0);
    line([
      { t: 'Total', x: 130, f: bold }, { t: String(S('qty')), x: 640, w: 60, right: true, f: bold }, { t: String(S('qty') * n), x: 710, w: 50, right: true, f: bold },
      { t: fmt(S('supply') * n), x: 770, w: 70, right: true, f: bold }, { t: fmt(S('install') * n), x: 850, w: 70, right: true, f: bold }, { t: fmt(S('total') * n), x: 930, w: 80, right: true, f: bold },
    ]);
    y -= 14;
  }
  page.drawText('Rates are ex GST. Supply rates for light fittings from the LA Lounge schedule unless edited; install rates are indicative.', { x: 40, y: 30, size: 7, font });
}

const fmt = (n: number) => (n ? n.toLocaleString('en-AU', { maximumFractionDigits: 0 }) : '–');
