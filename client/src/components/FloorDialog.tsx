import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { pageCount, pageSize, renderPage } from '../pdf';
import { uid } from '../geometry';
import { useStore } from '../store';
import type { PlanFile } from '../types';

function Thumb({ planId, page, selected, onClick }: { planId: string; page: number; selected: boolean; onClick: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let live = true;
    renderPage(planId, page, 0.22).then((c) => {
      if (!live || !ref.current) return;
      ref.current.innerHTML = '';
      const img = document.createElement('img');
      img.src = c.toDataURL('image/png');
      img.alt = `Page ${page}`;
      ref.current.appendChild(img);
    });
    return () => {
      live = false;
    };
  }, [planId, page]);
  return (
    <button type="button" className={`thumb ${selected ? 'sel' : ''}`} onClick={onClick}>
      <div ref={ref} className="thumb-img" />
      <span>Page {page}</span>
    </button>
  );
}

export function FloorDialog({ onClose }: { onClose: () => void }) {
  const project = useStore((s) => s.project!);
  const { mutate, setFloor, requestFit } = useStore.getState();
  const [plans, setPlans] = useState<PlanFile[]>([]);
  const [planId, setPlanId] = useState<string | null>(null);
  const [pages, setPages] = useState(0);
  const [page, setPage] = useState(1);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.listPlans(project.id).then((p) => {
      setPlans(p);
      if (p.length) setPlanId(p[p.length - 1].id);
    });
  }, [project.id]);

  useEffect(() => {
    if (!planId) return;
    setPages(0);
    pageCount(planId).then(setPages).catch((e) => setError(e.message));
  }, [planId]);

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setBusy(true);
    setError(null);
    try {
      const p = await api.uploadPlan(project.id, f);
      setPlans((x) => [...x, p]);
      setPlanId(p.id);
      setPage(1);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  }

  async function add() {
    if (!planId) return;
    setBusy(true);
    try {
      const s = await pageSize(planId, page);
      const id = uid();
      mutate((d) => {
        d.floors.push({ id, name: name.trim() || `Floor ${d.floors.length + 1}`, planId, page, width: s.width, height: s.height, rooms: [], items: [] });
      });
      setFloor(id);
      requestFit();
      onClose();
    } catch (err: any) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal wide" role="dialog" aria-label="Add floor">
        <h2>Add a floor</h2>
        <p className="muted small">Upload the architectural drawing set (PDF), then pick the page for this floor. Both dwellings can sit on one page — you assign each room to a dwelling.</p>
        <div className="row gap">
          <label className="file-btn">
            <input type="file" accept="application/pdf" onChange={onUpload} disabled={busy} />
            {busy ? 'Uploading…' : 'Upload PDF'}
          </label>
          {plans.length > 0 && (
            <select value={planId ?? ''} onChange={(e) => setPlanId(e.target.value)} aria-label="Plan file">
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.fileName}
                </option>
              ))}
            </select>
          )}
        </div>
        {error && <p className="error">{error}</p>}
        {planId && (
          <div className="thumbs">
            {pages === 0 && <p className="muted">Reading pages…</p>}
            {Array.from({ length: pages }, (_, i) => (
              <Thumb key={i} planId={planId} page={i + 1} selected={page === i + 1} onClick={() => setPage(i + 1)} />
            ))}
          </div>
        )}
        <div className="row gap end">
          <input placeholder="Floor name, e.g. Ground floor" value={name} onChange={(e) => setName(e.target.value)} aria-label="Floor name" style={{ flex: 1 }} />
          <button onClick={onClose}>Cancel</button>
          <button className="primary" disabled={!planId || busy} onClick={add}>
            Add page {page}
          </button>
        </div>
      </div>
    </div>
  );
}
