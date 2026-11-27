import { circuitColor, circuitLinks, circuitsOf, wireGeom } from './circuits';
import { inCrop, isVisible } from './layers';
import * as XLSX from 'xlsx';
import { PDFDocument, StandardFonts, rgb, degrees, type PDFPage, type PDFFont } from 'pdf-lib';
import { planBytes } from './pdf';
import { pdfSafe } from './marks';
import { copiesOf, libraryMap, NO_ROOM, placedItems, totals, unknownComponent } from './schedule';
import { halfUnits, isStretchy, lenOf, primsFor, widOf } from './symbols';
import { compareComponents } from './library';
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
  const anySingle = all.some((p) => p.oneSide);
  // Quantities only. "As drawn" is the one modelled duplex; the total is ×n except rooms marked 1 duplex only, counted once.
  const sumRows: Record<string, string | number>[] = tot.map((l) => ({
    Code: l.component.code,
    Component: l.component.name,
    Category: l.component.category,
    Control: l.component.control,
    Unit: unitOf(l.component),
    'Qty as drawn (1 duplex)': l.qty,
    ...(anySingle ? { 'Of which for 1 duplex only': l.qtySingle } : {}),
    [`Total qty (${n} duplexes)`]: l.qtyAll,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sumRows), 'Totals');

  // Room × code matrix, one row per room name, quantities for all duplexes
  const codes = tot.map((l) => l.component.code);
  const roomNames = [...new Set(all.map((p) => p.room))].sort((x, y) => (x === NO_ROOM ? 1 : y === NO_ROOM ? -1 : x.localeCompare(y, 'en', { numeric: true })));
  const rooms = roomNames.map((room) => {
    const mine = all.filter((p) => p.room === room);
    const lines = new Map(totals(data, mine).map((l) => [l.component.code, l]));
    const row: Record<string, string | number> = { Room: room === NO_ROOM ? 'Not in a room' : room, 'Built in': (data.singleRooms ?? []).includes(room) ? '1 duplex' : `${n} duplexes` };
    for (const c of codes) row[c] = lines.get(c)?.qtyAll ?? 0;
    row['Total items'] = [...lines.values()].reduce((t, l) => t + (unitOf(l.component) === 'each' ? l.qtyAll : 0), 0);
    return row;
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rooms), 'By room');

  // Every item as drawn
  const lib = libraryMap(data);
  const items = all.map((p) => {
    const it = p.floor.items.find((x) => x.id === p.itemId)!;
    const c = lib.get(p.code) ?? unknownComponent(p.code);
    return { Floor: p.floor.name, Room: p.room === NO_ROOM ? 'Not in a room' : p.room, Code: p.code, Component: c.name, Circuit: p.circuit, 'Built in': p.mult, Override: it.built === 'all' ? `All ${n} duplexes` : it.built === 'one' ? '1 duplex only' : '', Note: it.note ?? '' };
  });
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(items), 'Items');

  const notes = data.floors.flatMap((f) => f.rooms.flatMap((r) => (r.notes ?? []).map((n) => ({ Floor: f.name, Room: r.name, Type: n.kind === 'question' ? 'Question' : 'Comment', For: n.for ?? '', Status: n.kind === 'question' ? (n.status === 'open' ? 'Open' : 'Answered') : '', Text: n.text, Answer: n.answer ?? '', By: n.by ?? '', Date: n.at.slice(0, 10) }))));
  if (notes.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(notes), 'Questions & comments');

  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet([...data.library].sort(compareComponents).map((c) => ({ Code: c.code, Name: c.name, Category: c.category, Control: c.control, Notes: c.notes ?? '' }))),
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
function drawSymbol(page: PDFPage, font: PDFFont, comp: Component, x: number, y: number, rot: number, size: number, pageH: number, half?: number, halfW?: number) {
  const color = hex(comp.color);
  const white = rgb(1, 1, 1);
  const r = (-rot * Math.PI) / 180;
  const cos = Math.cos(r), sin = Math.sin(r);
  // unit (u,v; v down) -> PDF coords (y up)
  const P = (u: number, v: number) => {
    const ux = u * size, vy = -v * size;
    return { x: x + ux * cos - vy * sin, y: pageH - y + ux * sin + vy * cos };
  };
  for (const p of primsFor(comp.symbol, half, halfW)) {
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
        color: fill ? color : closed && !(p.t === 'poly' && p.hollow) ? white : undefined,
        opacity: fill ? 1 : 0.85,
        borderColor: fill ? undefined : color,
        borderWidth: fill ? 0 : sw * size,
        borderDashArray: p.t === 'poly' && p.dash ? p.dash.map((d) => d * size) : undefined,
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
    for (const w of floor.walls ?? []) page.drawLine({ start: { x: w.x1 * s, y: H - w.y1 * s }, end: { x: w.x2 * s, y: H - w.y2 * s }, thickness: Math.max(0.5, (w.t / (floor.mmPerPt || 35.28)) * s), color: rgb(0.2, 0.25, 0.33), lineCap: 2 as any });

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
    const visible = floor.items.filter((x) => isVisible(data, x) && inCrop(floor, x));
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
      drawSymbol(page, bold, c, it.x * s, it.y * s, it.rot, data.symbolSize * s, H, isStretchy(c.symbol) ? halfUnits(lenOf(it, c, data.symbolSize, floor.mmPerPt), floor.mmPerPt, data.symbolSize) : undefined, c.symbol === 'loop' ? halfUnits(widOf(it, c), floor.mmPerPt, data.symbolSize) : undefined);
      if (opts.labels && c.symbol === 'profile') {
        const txt = `${it.code}${it.circuit ? ' ' + it.circuit : ''}`;
        const fs = data.symbolSize * s * 0.95;
        page.drawText(txt, { x: it.x * s - font.widthOfTextAtSize(txt, fs) / 2, y: H - it.y * s + data.symbolSize * s * 0.75, size: fs, font, color: hex(c.color) });
      } else if (opts.labels) {
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
    page.drawText(`Component layout · ${stamp()} · ${visible.length} items`, { x: ox + 14, y: oy + 12, size: 6, font });
  }

  // Legend + schedule pages
  await scheduleSheets(out, project, font, bold);
  notesSheets(out, project, font, bold);

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
  const anySingle = placedItems(data).some((p) => p.oneSide);
  const sections: { title: string; floors: Floor[] }[] = [{ title: `Component quantities – all ${n} duplexes${anySingle ? ' (rooms marked 1 duplex only are counted once)' : ''}`, floors: data.floors }];
  for (const f of data.floors) sections.push({ title: f.name, floors: [f] });

  for (const sec of sections) {
    const items = placedItems(data, sec.floors);
    if (!items.length) continue;
    const tot = totals(data, items);
    if (y < 120 + tot.length * 13) newPage();
    page.drawText(sec.title, { x: 40, y, size: 11, font: bold });
    y -= 18;
    line([
      { t: 'Symbol', x: 40, f: bold }, { t: 'Code', x: 80, f: bold }, { t: 'Component', x: 130, f: bold }, { t: 'Control', x: 560, f: bold }, { t: 'Unit', x: 650, f: bold },
      { t: 'As drawn (1 duplex)', x: 690, w: 100, right: true, f: bold },
      ...(anySingle ? [{ t: 'For 1 duplex only', x: 800, w: 100, right: true, f: bold }] : []),
      { t: `Total (${n} duplexes)`, x: 910, w: 110, right: true, f: bold },
    ]);
    for (const l of tot) {
      drawSymbol(page, bold, l.component, 52, H - y - 3, 0, 4, H);
      line([
        { t: l.component.code, x: 80 }, { t: l.component.name.slice(0, 85), x: 130 }, { t: l.component.control, x: 560 }, { t: unitOf(l.component), x: 650 },
        { t: String(l.qty), x: 690, w: 100, right: true },
        ...(anySingle ? [{ t: l.qtySingle ? String(l.qtySingle) : '–', x: 800, w: 100, right: true }] : []),
        { t: String(l.qtyAll), x: 910, w: 110, right: true, f: bold },
      ]);
      if (y < 50) newPage();
    }
    y -= 14;
  }
  if (anySingle) page.drawText(`Rooms counted for 1 duplex only: ${(data.singleRooms ?? []).join(', ') || 'none'}. Individual components can override their room in Properties.`.slice(0, 300), { x: 40, y: 30, size: 7, font });
}

const unitOf = (c: Component) => (c.symbol === 'profile' || c.symbol === 'loop' ? 'm' : 'each');

function wrap(text: string, f: PDFFont, size: number, width: number) {
  const out: string[] = [];
  for (const para of pdfSafe(text).split('\n')) {
    let line = '';
    for (const w of para.split(/\s+/)) {
      const t = line ? line + ' ' + w : w;
      if (f.widthOfTextAtSize(t, size) > width && line) {
        out.push(line);
        line = w;
      } else line = t;
    }
    out.push(line);
  }
  return out;
}

function notesSheets(out: PDFDocument, project: Project, font: PDFFont, bold: PDFFont) {
  const groups = project.data.floors.flatMap((f) => f.rooms.filter((r) => (r.notes ?? []).length).map((r) => ({ f, r })));
  if (!groups.length) return;
  const W = 842, H = 1191; // A3 portrait
  let page = out.addPage([W, H]);
  let y = H - 50;
  const need = (h: number) => {
    if (y - h < 40) {
      page = out.addPage([W, H]);
      y = H - 50;
    }
  };
  page.drawText(`${project.name} – questions & comments`, { x: 40, y, size: 16, font: bold });
  y -= 26;
  for (const { f, r } of groups) {
    need(40);
    page.drawText(`${f.name} · ${r.name}`, { x: 40, y, size: 11, font: bold });
    y -= 16;
    const ns = [...(r.notes ?? [])].sort((a, b) => (a.status === b.status ? a.at.localeCompare(b.at) : a.status === 'open' ? -1 : 1));
    for (const n of ns) {
      const head = `${n.kind === 'question' ? (n.status === 'open' ? 'QUESTION (open)' : 'QUESTION (answered)') : 'COMMENT'}${n.for ? ' · for ' + n.for : ''}${n.by ? ' · ' + n.by : ''} · ${n.at.slice(0, 10)}`;
      const body = wrap(n.text, font, 9, W - 110);
      const ans = n.answer ? wrap('Answer: ' + n.answer, font, 9, W - 110) : [];
      need(14 + (body.length + ans.length) * 12);
      page.drawText(pdfSafe(head), { x: 50, y, size: 7.5, font: bold, color: n.kind === 'question' && n.status === 'open' ? rgb(0.85, 0.35, 0.05) : rgb(0.35, 0.35, 0.35) });
      y -= 12;
      for (const l of body) { page.drawText(l, { x: 60, y, size: 9, font }); y -= 12; }
      for (const l of ans) { page.drawText(l, { x: 60, y, size: 9, font, color: rgb(0.1, 0.4, 0.2) }); y -= 12; }
      y -= 4;
    }
    y -= 8;
  }
}

