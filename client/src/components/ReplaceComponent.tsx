import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { compareComponents } from '../library';
import { isVisible } from '../layers';
import { isStretchy } from '../symbols';
import type { ProjectData } from '../types';

/** Swap every placed instance of one component for another, e.g. all DL1 to DL3. One undo step. */
export function replaceComponent(from: string, to: string, floorId?: string) {
  useStore.getState().mutate((d) => {
    const target = d.library.find((c) => c.code === to);
    if (!target || from === to) return;
    for (const f of d.floors) {
      if (floorId && f.id !== floorId) continue;
      for (const it of f.items) {
        if (it.code !== from || !isVisible(d, it)) continue;
        it.code = to;
        // Position, rotation, circuit and note carry over; a drawn length only makes sense on a to-length component.
        if (!isStretchy(target.symbol)) delete it.len;
        if (target.symbol !== 'loop') delete it.wid;
      }
    }
  });
}

function countOf(data: ProjectData, code: string, floorId?: string) {
  let n = 0, hidden = 0;
  for (const f of data.floors) {
    if (floorId && f.id !== floorId) continue;
    for (const it of f.items) if (it.code === code) isVisible(data, it) ? n++ : hidden++;
  }
  return { n, hidden };
}

export function ReplaceComponent({ from: initial, onClose }: { from?: string; onClose: () => void }) {
  const data = useStore((s) => s.project!.data);
  const floorId = useStore((s) => s.floorId);
  const floor = data.floors.find((f) => f.id === floorId);
  const lib = useMemo(() => [...data.library].sort(compareComponents), [data.library]);
  // Offer only codes that are actually placed (including ones no longer in the library).
  const placed = useMemo(() => {
    const used = new Set(data.floors.flatMap((f) => f.items.map((i) => i.code)));
    const known = lib.filter((c) => used.has(c.code)).map((c) => ({ code: c.code, name: c.name }));
    const orphans = [...used].filter((c) => !lib.some((l) => l.code === c)).sort().map((code) => ({ code, name: '(not in library)' }));
    return [...known, ...orphans];
  }, [data.floors, lib]);

  const [from, setFrom] = useState(initial && placed.some((p) => p.code === initial) ? initial : placed[0]?.code ?? '');
  const [to, setTo] = useState('');
  const [scope, setScope] = useState<'all' | 'floor'>('all');
  const scopeId = scope === 'floor' ? floor?.id : undefined;
  const { n, hidden } = countOf(data, from, scopeId);
  const src = data.library.find((c) => c.code === from);
  const dst = data.library.find((c) => c.code === to);
  const stretchMismatch = src && dst && isStretchy(src.symbol) !== isStretchy(dst.symbol);

  return (
    <div className="card-inset stack">
      <b>Replace component</b>
      <label htmlFor="rc-from">Replace every</label>
      <select id="rc-from" value={from} onChange={(e) => setFrom(e.target.value)}>
        {placed.map((c) => <option key={c.code} value={c.code}>{c.code} – {c.name}</option>)}
      </select>
      <label htmlFor="rc-to">With</label>
      <select id="rc-to" value={to} onChange={(e) => setTo(e.target.value)}>
        <option value="">Choose a component…</option>
        {lib.filter((c) => c.code !== from).map((c) => <option key={c.code} value={c.code}>{c.code} – {c.name}</option>)}
      </select>
      <div className="seg">
        <button className={scope === 'all' ? 'sel' : ''} onClick={() => setScope('all')}>All floors</button>
        <button className={scope === 'floor' ? 'sel' : ''} disabled={!floor} onClick={() => setScope('floor')}>{floor ? `${floor.name} only` : 'This floor only'}</button>
      </div>
      <p className="muted small">
        {n} × {from || '—'} will change{scope === 'floor' && floor ? ` on ${floor.name}` : ' across all floors'}. Positions, rotation, circuits and notes are kept. Ctrl+Z undoes this.
        {hidden > 0 && ` ${hidden} on hidden layers are left as they are.`}
        {stretchMismatch && ' These components are drawn differently (to length vs single symbol), so check them on the plan afterwards.'}
      </p>
      <div className="row gap wrap">
        <button className="primary" disabled={!to || !n} onClick={() => { replaceComponent(from, to, scopeId); onClose(); }}>
          Replace {n || ''}
        </button>
        <button onClick={onClose}>Cancel</button>
      </div>
    </div>
  );
}
