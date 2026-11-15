import { useState } from 'react';
import { useStore } from '../store';
import type { Floor } from '../types';

/** Remove everything drawn on a floor (the plan itself stays). Undo restores it. */
export function ClearFloor({ floor }: { floor: Floor }) {
  const { mutate, select } = useStore.getState();
  const [open, setOpen] = useState(false);
  const [opts, setOpts] = useState({ items: true, texts: false, erase: false, walls: false, rooms: false });
  const counts = {
    items: floor.items.length,
    texts: floor.texts?.length ?? 0,
    erase: floor.erase?.length ?? 0,
    walls: floor.walls?.length ?? 0,
    rooms: floor.rooms.length,
  };
  const notes = floor.rooms.reduce((a, r) => a + (r.notes?.length ?? 0), 0);
  const labels: Record<keyof typeof opts, string> = {
    items: 'Components and wiring',
    texts: 'Text',
    erase: 'Erased areas',
    walls: 'Walls',
    rooms: `Rooms${notes ? ` (and their ${notes} question${notes > 1 ? 's' : ''}/comment${notes > 1 ? 's' : ''})` : ''}`,
  };
  const any = (Object.keys(opts) as (keyof typeof opts)[]).some((k) => opts[k] && counts[k]);
  if (!open) return <button onClick={() => setOpen(true)}>Clear this floor…</button>;
  return (
    <div className="card-inset stack">
      <b>Clear {floor.name}</b>
      {(Object.keys(opts) as (keyof typeof opts)[]).map((k) => (
        <label key={k} className="check">
          <input type="checkbox" checked={opts[k]} disabled={!counts[k]} onChange={(e) => setOpts({ ...opts, [k]: e.target.checked })} /> {labels[k]} <span className="muted small">({counts[k]})</span>
        </label>
      ))}
      <p className="muted small">The plan drawing, crop and scale stay. Ctrl+Z undoes this, and saved revisions are kept.</p>
      <div className="row gap wrap">
        <button
          className="danger"
          disabled={!any}
          onClick={() => {
            mutate((d) => {
              const f = d.floors.find((x) => x.id === floor.id)!;
              if (opts.items) {
                f.items = [];
                f.links = [];
                f.bends = {};
              }
              if (opts.texts) f.texts = [];
              if (opts.erase) f.erase = [];
              if (opts.walls) f.walls = [];
              if (opts.rooms) f.rooms = [];
            });
            select({ kind: 'none' });
            setOpen(false);
          }}
        >
          Clear selected
        </button>
        <button onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  );
}
