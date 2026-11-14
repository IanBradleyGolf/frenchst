import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { pageCount, pageSize } from '../pdf';
import { pageLabels, type Label } from '../pdftext';
import { classify, defaultMapping, similarity, type Pt } from '../importer';
import { uid } from '../geometry';
import { useStore } from '../store';
import { DEFAULT_LIBRARY } from '../library';
import type { Floor, PlanFile } from '../types';
import { AlignPane } from './AlignPane';
import { Thumb } from './FloorDialog';

export function ImportDialog({ floor, onClose }: { floor: Floor; onClose: () => void }) {
  const project = useStore((s) => s.project!);
  const library = project.data.library;
  const { mutate, select } = useStore.getState();

  const [plans, setPlans] = useState<PlanFile[]>([]);
  const [planId, setPlanId] = useState<string | null>(null);
  const [pages, setPages] = useState(0);
  const [page, setPage] = useState<number | null>(null);
  const [src, setSrc] = useState<{ width: number; height: number } | null>(null);
  const [labels, setLabels] = useState<Label[] | null>(null);
  const [srcPts, setSrcPts] = useState<Pt[]>([]);
  const [dstPts, setDstPts] = useState<Pt[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [replace, setReplace] = useState(false);
  const [area, setArea] = useState(floor.importArea ?? null);
  const [areaMode, setAreaMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.listPlans(project.id).then((p) => {
      setPlans(p);
      const other = p.filter((x) => x.id !== floor.planId);
      if (other.length) setPlanId(other[other.length - 1].id);
    });
  }, [project.id, floor.planId]);

  useEffect(() => {
    if (!planId) return;
    setPages(0);
    setPage(null);
    pageCount(planId).then(setPages).catch((e) => setError(e.message));
  }, [planId]);

  useEffect(() => {
    if (!planId || !page) return;
    setLabels(null);
    setSrcPts([]);
    Promise.all([pageSize(planId, page), pageLabels(planId, page)]).then(([s, l]) => {
      setSrc(s);
      setLabels(l);
    });
  }, [planId, page]);

  const groups = useMemo(() => (labels ? classify(labels) : new Map<string, Label[]>()), [labels]);
  useEffect(() => {
    const m: Record<string, string> = {};
    for (const k of groups.keys()) m[k] = defaultMapping(k, library);
    setMapping(m);
  }, [groups, library]);

  const xf = srcPts.length === 2 && dstPts.length === 2 ? similarity(srcPts[0], srcPts[1], dstPts[0], dstPts[1]) : null;
  const lib = new Map(library.map((c) => [c.code, c]));

  const planned = useMemo(() => {
    if (!xf) return [];
    const out: { code: string; x: number; y: number; color: string }[] = [];
    for (const [k, list] of groups) {
      const code = mapping[k];
      if (!code) continue;
      for (const l of list) {
        if (src && (l.x < 0 || l.y < 0 || l.x > src.width || l.y > src.height)) continue; // text outside the visible page
        const p = xf.apply(l);
        if (p.x < 0 || p.y < 0 || p.x > floor.width || p.y > floor.height) continue;
        if (area && (p.x < area.x1 || p.x > area.x2 || p.y < area.y1 || p.y > area.y2)) continue;
        out.push({ code, x: p.x, y: p.y, color: lib.get(code)?.color ?? '#64748b' });
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [xf?.scale, xf?.rotationDeg, srcPts, dstPts, groups, mapping, floor.width, floor.height, area]);

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setBusy(true);
    try {
      const p = await api.uploadPlan(project.id, f);
      setPlans((x) => [...x, p]);
      setPlanId(p.id);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  }

  const missingStd = DEFAULT_LIBRARY.filter((c) => !lib.has(c.code));

  function doImport() {
    const codes = new Set(planned.map((p) => p.code));
    const items = planned.map((p) => ({ id: uid(), code: p.code, x: p.x, y: p.y, rot: 0 }));
    mutate((d) => {
      const f = d.floors.find((x) => x.id === floor.id)!;
      if (area) f.importArea = area;
      if (replace) f.items = f.items.filter((i) => !codes.has(i.code) || (area && (i.x < area.x1 || i.x > area.x2 || i.y < area.y1 || i.y > area.y2)));
      f.items.push(...items);
    });
    select({ kind: 'items', ids: items.map((i) => i.id) });
    onClose();
  }

  const keys = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
  const step = !page ? 1 : !xf ? 2 : 3;

  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal xwide" role="dialog" aria-label="Import from PDF">
        <div className="row between">
          <h2>Import components into {floor.name}</h2>
          <button className="icon" onClick={onClose} aria-label="Close">×</button>
        </div>
        <ol className="steps">
          <li className={step === 1 ? 'on' : 'done'}>Choose the source page</li>
          <li className={step === 2 ? 'on' : step > 2 ? 'done' : ''}>Line it up: click A then B on both plans</li>
          <li className={step === 3 ? 'on' : ''}>Check the mapping and import</li>
        </ol>
        {error && <p className="error">{error}</p>}

        {!page && (
          <>
            <div className="row gap">
              <label className="file-btn">
                <input type="file" accept="application/pdf" onChange={onUpload} disabled={busy} />
                {busy ? 'Uploading…' : 'Upload PDF'}
              </label>
              {plans.length > 0 && (
                <select value={planId ?? ''} onChange={(e) => setPlanId(e.target.value)} aria-label="Source file">
                  {plans.map((p) => (
                    <option key={p.id} value={p.id}>{p.fileName}</option>
                  ))}
                </select>
              )}
              <span className="muted small">e.g. the LA Lounge lighting plans or the Switch plans</span>
            </div>
            {planId && (
              <div className="thumbs">
                {pages === 0 && <p className="muted">Reading pages…</p>}
                {Array.from({ length: pages }, (_, i) => (
                  <Thumb key={i} planId={planId} page={i + 1} selected={false} onClick={() => setPage(i + 1)} />
                ))}
              </div>
            )}
          </>
        )}

        {page && planId && src && (
          <div className="import-grid">
            <div className="import-panes">
              <AlignPane planId={planId} page={page} width={src.width} height={src.height} points={srcPts} onPick={(p) => setSrcPts((x) => (x.length >= 2 ? [p] : [...x, p]))} title={`Source · page ${page}`} />
              <AlignPane planId={floor.planId} page={floor.page} width={floor.width} height={floor.height} points={dstPts} onPick={(p) => setDstPts((x) => (x.length >= 2 ? [p] : [...x, p]))} preview={planned} title={`Your plan · ${floor.name}`} areaMode={areaMode} area={area} onArea={(a) => { setArea(a); setAreaMode(false); }} />
            </div>
            <div className="import-side stack">
              <p className="small">
                Click the <b style={{ color: '#dc2626' }}>same corner</b> (A) on both plans, then a <b style={{ color: '#2563eb' }}>second corner</b> (B) far from it — e.g. opposite ends of the building.
                Scroll to zoom, drag to pan. Coloured dots on your plan preview where items will land.
              </p>
              <div className="row gap">
                <button onClick={() => { setSrcPts([]); setDstPts([]); }}>Reset points</button>
                <button onClick={() => { setPage(null); setSrcPts([]); }}>Other page</button>
              </div>
              <div className="card-inset stack">
                <b className="small">Dwelling to model</b>
                <p className="muted small">Both dwellings are identical, so only one is modelled. Draw a box around it on your plan; anything outside is left out.</p>
                <div className="row gap">
                  <button className={areaMode ? 'primary' : ''} onClick={() => setAreaMode((m) => !m)}>{areaMode ? 'Drag a box on your plan…' : area ? 'Redraw area' : 'Draw import area'}</button>
                  {area && <button onClick={() => setArea(null)}>Clear</button>}
                </div>
                {!area && <p className="warn small">No area set: items for both dwellings will be imported.</p>}
              </div>
              {xf && <p className="muted small">Scale {xf.scale.toFixed(3)} · rotation {xf.rotationDeg.toFixed(1)}°</p>}
              {labels && keys.length === 0 && <p className="warn small">No component labels found on this page.</p>}
              {keys.length > 0 && (
                <table className="tbl">
                  <thead>
                    <tr><th>Label</th><th className="num">Found</th><th>Import as</th></tr>
                  </thead>
                  <tbody>
                    {keys.map(([k, list]) => (
                      <tr key={k}>
                        <td className="mono">{k}</td>
                        <td className="num">{list.length}</td>
                        <td>
                          <select value={mapping[k] ?? ''} onChange={(e) => setMapping((m) => ({ ...m, [k]: e.target.value }))} aria-label={`Map ${k}`}>
                            <option value="">Skip</option>
                            {library.map((c) => (
                              <option key={c.code} value={c.code}>{c.code} – {c.name}</option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {missingStd.length > 0 && (
                <button className="mini" onClick={() => mutate((d) => d.library.push(...structuredClone(missingStd)))}>
                  Add {missingStd.length} standard components missing from this project
                </button>
              )}
              <label className="check"><input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} /> Replace existing items of these types on this floor</label>
              <p className="muted small">Items are placed at their label, which usually sits just beside the symbol on the source drawing. Nudge them as needed.</p>
              <button className="primary" disabled={!xf || planned.length === 0} onClick={doImport}>
                {xf ? `Import ${planned.length} items` : 'Set points A and B on both plans'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
