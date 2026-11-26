import { useEffect, useMemo, useState } from 'react';
import { useFloor, useStore } from '../store';
import { distance, mirrorItems, mirrorRoom, roomAt, polygonArea } from '../geometry';
import { libraryMap, NO_ROOM, placedItems, totals } from '../schedule';
import { svgFor } from '../symbols';
import type { Component, Floor, TextNote } from '../types';
import { dwellingColor } from './PlanCanvas';
import { ImportDialog } from './ImportDialog';
import { linkSelected, unlinkSelected, deleteWire } from '../circuits';
import { deleteMark, updateText } from '../marks';
import { compareComponents } from '../library';
import { isStretchy, lenOf, metresOf, widOf } from '../symbols';
import { ClearFloor } from './ClearFloor';
import { RoomNotes, openQuestions } from './RoomNotes';

export function RightPanel({ showLabels, setShowLabels, showRooms, setShowRooms, showWires, setShowWires }: { showLabels: boolean; setShowLabels: (v: boolean) => void; showRooms: boolean; setShowRooms: (v: boolean) => void; showWires: boolean; setShowWires: (v: boolean) => void }) {
  const tab = useStore((s) => s.rightTab);
  const { setRightTab } = useStore.getState();
  const floor = useFloor();
  return (
    <aside className="right">
      <nav className="tabs" role="tablist">
        {(['properties', 'rooms', 'schedule'] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'sel' : ''} onClick={() => setRightTab(t)}>
            {t === 'properties' ? 'Properties' : t === 'rooms' ? 'Rooms' : 'Schedule'}
          </button>
        ))}
      </nav>
      <div className="tab-body">
        {tab === 'properties' && (floor ? <Properties floor={floor} showLabels={showLabels} setShowLabels={setShowLabels} showRooms={showRooms} setShowRooms={setShowRooms} showWires={showWires} setShowWires={setShowWires} /> : <p className="muted pad">Add a floor to begin.</p>)}
        {tab === 'rooms' && (floor ? <Rooms floor={floor} /> : <p className="muted pad">Add a floor to begin.</p>)}
        {tab === 'schedule' && <Schedule />}
      </div>
    </aside>
  );
}

/* ---------------- Properties ---------------- */

function Properties({ floor, showLabels, setShowLabels, showRooms, setShowRooms, showWires, setShowWires }: { floor: Floor; showLabels: boolean; setShowLabels: (v: boolean) => void; showRooms: boolean; setShowRooms: (v: boolean) => void; showWires: boolean; setShowWires: (v: boolean) => void }) {
  const data = useStore((s) => s.project!.data);
  const selection = useStore((s) => s.selection);
  const tool = useStore((s) => s.tool);
  const draft = useStore((s) => s.draft);
  const { mutate, setTool, setDraft, select } = useStore.getState();
  const lib = useMemo(() => libraryMap(data), [data]);
  const [importing, setImporting] = useState(false);

  if (tool === 'calibrate' && draft.length === 4) return <Calibrate floor={floor} pts={draft} done={() => { setDraft([]); setTool('select'); }} />;

  const items = selection.kind === 'items' ? floor.items.filter((i) => selection.ids.includes(i.id)) : [];
  const updateSel = (fn: (it: Floor['items'][number]) => void, key?: string) =>
    mutate((d) => {
      const ids = new Set(items.map((i) => i.id));
      for (const it of d.floors.find((f) => f.id === floor.id)!.items) if (ids.has(it.id)) fn(it);
    }, key);

  if (selection.kind === 'wire') {
    const a = floor.items.find((i) => i.id === selection.a), b = floor.items.find((i) => i.id === selection.b);
    if (a && b) {
      const cct = a.circuit ?? '';
      return (
        <div className="pad stack">
          <h4>Wire {a.code} – {b.code}</h4>
          <p className="muted small">On circuit {cct} ({floor.items.filter((i) => i.circuit === cct).length} lights). Drag the white dot to change its arc; double-click the dot to straighten it.</p>
          <div className="row gap wrap">
            <button className="danger" onClick={() => deleteWire(floor.id, a.id, b.id)} title="Delete (Del). The circuit splits where this wire was.">Delete wire</button>
            <button onClick={() => select({ kind: 'items', ids: floor.items.filter((i) => i.circuit === cct).map((i) => i.id) })} title="Or double-click the wire">Select whole circuit</button>
          </div>
          <p className="muted small">Deleting a wire splits the circuit in two; a light left on its own has no circuit.</p>
        </div>
      );
    }
  }

  if (selection.kind === 'wall' && floor.walls?.some((w) => w.id === selection.id)) {
    const w = floor.walls.find((x) => x.id === selection.id)!;
    const mpp = floor.mmPerPt || 35.28;
    const len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1) * mpp;
    return (
      <div className="pad stack">
        <h4>Wall</h4>
        <div className="row gap wrap">
          <label htmlFor="wall-t" className="small" style={{ margin: 0 }}>Thickness (mm)</label>
          <input id="wall-t" type="number" min={10} step={10} style={{ width: 80 }} value={w.t} onChange={(e) => { const v = Math.max(10, Number(e.target.value) || 90); mutate((d) => (d.floors.find((f) => f.id === floor.id)!.walls!.find((x) => x.id === w.id)!.t = v), 'wallt-' + w.id); }} />
          {[90, 110, 150, 200].map((t) => <button key={t} className="mini" onClick={() => mutate((d) => (d.floors.find((f) => f.id === floor.id)!.walls!.find((x) => x.id === w.id)!.t = t))}>{t}</button>)}
        </div>
        <p className="muted small">Length {(len / 1000).toFixed(2)} m{floor.mmPerPt ? '' : ' (scale not set — assuming 1:100)'}. Drag the square ends to adjust (snaps straight; Shift for free).</p>
        <div className="row gap wrap">
          <button className="danger" onClick={() => { mutate((d) => { const f = d.floors.find((x) => x.id === floor.id)!; f.walls = (f.walls ?? []).filter((x) => x.id !== w.id); }); select({ kind: 'none' }); }}>Delete wall</button>
        </div>
      </div>
    );
  }

  if (selection.kind === 'erase' && floor.erase?.some((r) => r.id === selection.id)) {
    const r = floor.erase.find((x) => x.id === selection.id)!;
    return (
      <div className="pad stack">
        <h4>Erased area</h4>
        <p className="muted small">A white box over the drawing. Drag it to move; drag its corners or edges to resize. It is also whited out in the PDF export.</p>
        <p className="muted small">{Math.round(r.w)} × {Math.round(r.h)} pt</p>
        <div className="row gap wrap">
          <button className="danger" onClick={() => deleteMark(floor.id, selection)}>Restore (delete box)</button>
        </div>
      </div>
    );
  }

  if (selection.kind === 'text' && floor.texts?.some((t) => t.id === selection.id)) {
    const t = floor.texts.find((x) => x.id === selection.id)!;
    const up = (fn: (x: TextNote) => void, key?: string) => updateText(floor.id, t.id, fn, key);
    return (
      <div className="pad stack">
        <h4>Text</h4>
        <textarea id="text-edit" autoFocus rows={3} value={t.text} onChange={(e) => up((x) => (x.text = e.target.value), 'text-' + t.id)} />
        <div className="row gap wrap">
          <label>Size <input type="number" min={1} step={0.5} value={t.size} onChange={(e) => up((x) => (x.size = Math.max(1, Number(e.target.value) || 1)), 'tsize-' + t.id)} style={{ width: 64 }} /></label>
          <label>Colour <input type="color" value={t.color} onChange={(e) => up((x) => (x.color = e.target.value), 'tcol-' + t.id)} /></label>
          <label><input type="checkbox" checked={!!t.bold} onChange={(e) => up((x) => (x.bold = e.target.checked))} /> Bold</label>
        </div>
        <div className="row gap wrap">
          <label>Rotation° <input type="number" step={15} value={t.rot ?? 0} onChange={(e) => up((x) => (x.rot = Number(e.target.value) || 0), 'trot-' + t.id)} style={{ width: 64 }} /></label>
          <button onClick={() => up((x) => (x.rot = (((x.rot ?? 0) - 90) % 360 + 360) % 360))}>⟲ 90°</button>
          <button onClick={() => up((x) => (x.rot = ((x.rot ?? 0) + 90) % 360))}>⟳ 90°</button>
        </div>
        <p className="muted small">Drag the text to move it; drag a corner to resize or the top handle to rotate.</p>
        <div className="row gap wrap">
          <button className="danger" onClick={() => deleteMark(floor.id, selection)}>Delete text</button>
        </div>
      </div>
    );
  }

  if (items.length) {
    const codes = [...new Set(items.map((i) => i.code))];
    const circuits = [...new Set(items.map((i) => i.circuit ?? ''))];
    const notes = [...new Set(items.map((i) => i.note ?? ''))];
    const one = items.length === 1 ? items[0] : null;
    const room = one ? roomAt(floor, one.x, one.y) : undefined;
    return (
      <div className="pad stack">
        <h4>{items.length === 1 ? `${one!.code} – ${lib.get(one!.code)?.name ?? ''}` : `${items.length} items selected`}</h4>
        {one && <p className="muted small">{room ? `${room.name} · ${room.dwelling}` : 'Not inside a room'}</p>}
        <label htmlFor="pp-code">Component</label>
        <select id="pp-code" value={codes.length === 1 ? codes[0] : ''} onChange={(e) => updateSel((it) => (it.code = e.target.value))}>
          {codes.length > 1 && <option value="">(mixed)</option>}
          {[...data.library].sort(compareComponents).map((c) => (
            <option key={c.code} value={c.code}>
              {c.code} – {c.name}
            </option>
          ))}
        </select>
        <div className="row gap wrap">
          <button onClick={() => linkSelected(floor)} title="Put the selected lights on one circuit (L)">Wire together</button>
          <button onClick={() => unlinkSelected(floor)} disabled={!items.some((i) => i.circuit)} title="Take the selected lights off their circuit (U)">Remove wiring</button>
        </div>
        {circuits.length === 1 && circuits[0] && <p className="muted small">Circuit {circuits[0]} has {floor.items.filter((i) => i.circuit === circuits[0]).length} lights.</p>}
        <label htmlFor="pp-cct">Circuit</label>
        <input id="pp-cct" placeholder={circuits.length > 1 ? '(mixed)' : 'e.g. K1-2 or C04'} value={circuits.length === 1 ? circuits[0] : ''} onChange={(e) => updateSel((it) => (it.circuit = e.target.value || undefined), 'circuit')} />
        <label htmlFor="pp-note">Note</label>
        <textarea id="pp-note" rows={2} placeholder={notes.length > 1 ? '(mixed)' : ''} value={notes.length === 1 ? notes[0] : ''} onChange={(e) => updateSel((it) => (it.note = e.target.value || undefined), 'note')} />
        {items.every((i) => isStretchy(lib.get(i.code)?.symbol ?? 'generic')) && (() => {
          const lens = new Set(items.map((i) => Math.round(lenOf(i, lib.get(i.code)!, data.symbolSize, floor.mmPerPt))));
          return (
            <>
              <div className="row gap wrap">
                <label htmlFor="pp-len" className="small" style={{ margin: 0 }}>Length (m)</label>
                <input id="pp-len" type="number" step={0.1} min={0.1} style={{ width: 80 }} value={lens.size === 1 ? +([...lens][0] / 1000).toFixed(2) : ''} placeholder="mixed" onChange={(e) => { const v = Number(e.target.value); if (v > 0) updateSel((it) => (it.len = Math.round(v * 1000)), 'len'); }} />
                {items.every((i) => lib.get(i.code)?.symbol === 'loop') && (
                  <>
                    <label htmlFor="pp-wid" className="small" style={{ margin: 0 }}>Depth (m)</label>
                    <input id="pp-wid" type="number" step={0.1} min={0.2} style={{ width: 80 }} value={new Set(items.map((i) => widOf(i, lib.get(i.code)!))).size === 1 ? +(widOf(items[0], lib.get(items[0].code)!) / 1000).toFixed(2) : ''} placeholder="mixed" onChange={(e) => { const v = Number(e.target.value); if (v > 0) updateSel((it) => (it.wid = Math.round(v * 1000)), 'wid'); }} />
                  </>
                )}
                <span className="muted small">Total {(items.reduce((a, i) => a + (lib.get(i.code)!.symbol === 'loop' ? metresOf(i, lib.get(i.code)!) * 1000 : lenOf(i, lib.get(i.code)!, data.symbolSize, floor.mmPerPt)), 0) / 1000).toFixed(1)} m</span>
              </div>
              <p className="muted small">Drag the square end handles to stretch (snaps to 100 mm; Shift for free).{floor.mmPerPt ? '' : ' Scale not set on this floor, so lengths are drawn assuming 1:100 — set the scale for true lengths.'}</p>
            </>
          );
        })()}
        <div className="row gap wrap">
          <label htmlFor="pp-rot" className="small" style={{ margin: 0 }}>Rotation°</label>
          <input id="pp-rot" type="number" step={15} style={{ width: 70 }} value={new Set(items.map((i) => Math.round(i.rot))).size === 1 ? Math.round(items[0].rot) : ''} placeholder="mixed" onChange={(e) => { const v = Number(e.target.value); if (!Number.isNaN(v)) updateSel((it) => (it.rot = ((v % 360) + 360) % 360), 'rot'); }} />
          <button onClick={() => updateSel((it) => (it.rot = (it.rot + 270) % 360))} title="Rotate 90° left">⟲ 90°</button>
          <button onClick={() => updateSel((it) => (it.rot = (it.rot + 90) % 360))} title="Rotate 90° right">⟳ 90°</button>
          <button onClick={() => updateSel((it) => (it.rot = (it.rot + 315) % 360))} title="Rotate left (Shift+R)">⟲ 45°</button>
          <button onClick={() => updateSel((it) => (it.rot = (it.rot + 45) % 360))} title="Rotate right (R)">⟳ 45°</button>
          <button onClick={() => updateSel((it) => (it.rot = 0))}>Reset</button>
        </div>
        <div className="row gap wrap">
          <button disabled={!floor.axis} title={floor.axis ? 'Copy mirrored across the party wall (M)' : 'Set the party wall line first'} onClick={() => mirrorCopy(floor)}>
            Mirror copy
          </button>
          <button className="danger" onClick={() => { mutate((d) => { const f = d.floors.find((x) => x.id === floor.id)!; const ids = new Set(items.map((i) => i.id)); f.items = f.items.filter((i) => !ids.has(i.id)); }); select({ kind: 'none' }); }}>
            Delete
          </button>
        </div>
      </div>
    );
  }

  const calibrated = floor.mmPerPt ? `1:${Math.round((floor.mmPerPt / 0.3528) * 1)} at this paper size (1 pt = ${floor.mmPerPt.toFixed(2)} mm)` : 'Not set';
  return (
    <div className="pad stack">
      <h4>{floor.name}</h4>
      <label htmlFor="fl-name">Floor name</label>
      <input id="fl-name" value={floor.name} onChange={(e) => mutate((d) => (d.floors.find((f) => f.id === floor.id)!.name = e.target.value), 'floorname')} />
      <div className="kv">
        <span>Visible area</span>
        <span>{floor.crop ? 'Cropped' : 'Whole sheet'}</span>
      </div>
      <div className="row gap wrap">
        <button onClick={() => setTool('crop')}>{floor.crop ? 'Re-crop sheet' : 'Crop to dwelling'}</button>
        {floor.crop && <button onClick={() => { mutate((d) => delete d.floors.find((f) => f.id === floor.id)!.crop); setTimeout(() => useStore.getState().requestFit(), 0); }}>Show whole sheet</button>}
      </div>
      <div className="kv">
        <span>Scale</span>
        <span>{calibrated}</span>
      </div>
      <button onClick={() => setTool('calibrate')}>Set scale from a known dimension</button>
      <div className="kv">
        <span>Party wall</span>
        <span>{floor.axis ? 'Set' : 'Not set'}</span>
      </div>
      <div className="row gap wrap">
        <button onClick={() => setTool('axis')}>{floor.axis ? 'Redraw party wall' : 'Draw party wall line'}</button>
        {floor.axis && <button onClick={() => mutate((d) => delete d.floors.find((f) => f.id === floor.id)!.axis)}>Clear</button>}
      </div>
      <p className="muted small">The party wall line lets you lay out one dwelling, then mirror-copy items and rooms to the other.</p>
      <hr />
      <button onClick={() => setImporting(true)}>Import components from another PDF…</button>
      <p className="muted small">Reads fitting labels (DL1, WL2, LL1…) and Switch device tags from LA Lounge or Switch drawings and places them on this floor.</p>
      {importing && <ImportDialog floor={floor} onClose={() => setImporting(false)} />}
      <hr />
      <ClearFloor floor={floor} />
      <p className="muted small">Removes components and wiring (and optionally text, erased areas, walls and rooms) from this floor, ready to start again.</p>
      <hr />
      <label htmlFor="sym-size">Symbol size</label>
      <input id="sym-size" type="range" min={1.5} max={10} step={0.5} value={data.symbolSize} onChange={(e) => mutate((d) => (d.symbolSize = Number(e.target.value)), 'symsize')} />
      <label className="check"><input type="checkbox" checked={showLabels} onChange={(e) => setShowLabels(e.target.checked)} /> Show codes</label>
      <label className="check"><input type="checkbox" checked={showWires} onChange={(e) => setShowWires(e.target.checked)} /> Show wiring</label>
      <label className="check"><input type="checkbox" checked={showRooms} onChange={(e) => setShowRooms(e.target.checked)} /> Show rooms</label>
      <hr />
      <p className="muted small">
        <b>Shortcuts</b><br />V select · H pan (or hold Space) · W wire · L wire selected together · U remove wiring · C crop · N new room · R rotate 45° (or drag the orange handle) · Del delete · Ctrl+C / Ctrl+V copy and paste · Ctrl+D duplicate · M mirror copy · arrows nudge · Ctrl+Z / Ctrl+Y undo and redo · F fit
      </p>
    </div>
  );
}

export function mirrorCopy(floor: Floor) {
  const { selection, mutate, select } = useStore.getState();
  if (!floor.axis || selection.kind !== 'items') return;
  const src = floor.items.filter((i) => selection.ids.includes(i.id));
  const copies = mirrorItems(src, floor.axis);
  mutate((d) => d.floors.find((f) => f.id === floor.id)!.items.push(...copies));
  select({ kind: 'items', ids: copies.map((c) => c.id) });
}

function Calibrate({ floor, pts, done }: { floor: Floor; pts: number[]; done: () => void }) {
  const [mm, setMm] = useState('');
  const { mutate } = useStore.getState();
  const d = distance(pts[0], pts[1], pts[2], pts[3]);
  return (
    <form
      className="pad stack"
      onSubmit={(e) => {
        e.preventDefault();
        const v = Number(mm);
        if (!v || v <= 0) return;
        mutate((x) => (x.floors.find((f) => f.id === floor.id)!.mmPerPt = v / d));
        done();
      }}
    >
      <h4>Set scale</h4>
      <p className="muted small">You picked two points {d.toFixed(1)} pt apart on the page. Enter the real distance between them.</p>
      <label htmlFor="cal-mm">Real distance (mm)</label>
      <input id="cal-mm" autoFocus type="number" min="1" value={mm} onChange={(e) => setMm(e.target.value)} placeholder="e.g. 3600" />
      <div className="row gap">
        <button type="button" onClick={done}>Cancel</button>
        <button className="primary">Set scale</button>
      </div>
    </form>
  );
}

/* ---------------- Rooms ---------------- */

function Rooms({ floor }: { floor: Floor }) {
  const data = useStore((s) => s.project!.data);
  const selection = useStore((s) => s.selection);
  const { mutate, select, setTool } = useStore.getState();
  const sel = selection.kind === 'room' ? floor.rooms.find((r) => r.id === selection.id) : undefined;
  const countIn = (rid: string) => floor.items.filter((it) => roomAt(floor, it.x, it.y)?.id === rid).length;
  const area = (pts: number[]) => (floor.mmPerPt ? `${((polygonArea(pts) * floor.mmPerPt ** 2) / 1e6).toFixed(1)} m²` : '');
  const upd = (fn: (r: Floor['rooms'][number]) => void, key?: string) => sel && mutate((d) => fn(d.floors.find((f) => f.id === floor.id)!.rooms.find((r) => r.id === sel.id)!), key);

  return (
    <div className="pad stack">
      <div className="row gap">
        <button className="primary" onClick={() => setTool('room')}>+ Draw room (N)</button>
      </div>
      {sel && (
        <div className="card-inset stack">
          <label htmlFor="rm-name">Room name</label>
          <input id="rm-name" autoFocus value={sel.name} onChange={(e) => upd((r) => (r.name = e.target.value), 'roomname')} onFocus={(e) => e.target.select()} />
          <label htmlFor="rm-dw">Dwelling</label>
          <select id="rm-dw" value={sel.dwelling} onChange={(e) => upd((r) => (r.dwelling = e.target.value))}>
            {data.dwellings.map((d) => <option key={d}>{d}</option>)}
          </select>
          <p className="muted small">Drag the corner handles on the plan to adjust. {area(sel.points)}</p>
          <div className="row gap wrap">
            <button
              disabled={!floor.axis}
              title={floor.axis ? 'Mirror this room and its items to the other side of the party wall' : 'Set the party wall line first'}
              onClick={() => {
                const other = data.dwellings.find((d) => d !== sel.dwelling && d !== 'Common') ?? sel.dwelling;
                const room = mirrorRoom(sel, floor.axis!, other);
                const inside = floor.items.filter((it) => roomAt(floor, it.x, it.y)?.id === sel.id);
                const copies = mirrorItems(inside, floor.axis!);
                mutate((d) => {
                  const f = d.floors.find((x) => x.id === floor.id)!;
                  f.rooms.push(room);
                  f.items.push(...copies);
                });
                select({ kind: 'room', id: room.id });
              }}
            >
              Mirror room + items
            </button>
            <button className="danger" onClick={() => { mutate((d) => { const f = d.floors.find((x) => x.id === floor.id)!; f.rooms = f.rooms.filter((r) => r.id !== sel.id); }); select({ kind: 'none' }); }}>
              Delete room
            </button>
          </div>
          <RoomNotes floor={floor} room={sel} />
        </div>
      )}
      <table className="tbl">
        <thead>
          <tr><th>Room</th><th>Dwelling</th><th className="num">Items</th><th className="num" title="Open questions">?</th></tr>
        </thead>
        <tbody>
          {[...floor.rooms].sort((a, b) => a.dwelling.localeCompare(b.dwelling) || a.name.localeCompare(b.name)).map((r) => (
            <tr key={r.id} className={sel?.id === r.id ? 'sel' : ''} onClick={() => select({ kind: 'room', id: r.id })}>
              <td>{r.name}</td>
              <td><span className="dot" style={{ background: dwellingColor(data.dwellings, r.dwelling) }} />{r.dwelling}</td>
              <td className="num">{countIn(r.id)}</td>
              <td className="num">{openQuestions(r) || ''}</td>
            </tr>
          ))}
          {floor.rooms.length === 0 && <tr><td colSpan={4} className="muted">No rooms yet. Draw rooms so every item is counted against a room and dwelling.</td></tr>}
        </tbody>
      </table>
      <DwellingEditor />
    </div>
  );
}

function DwellingEditor() {
  const dwellings = useStore((s) => s.project!.data.dwellings);
  const { mutate } = useStore.getState();
  const [name, setName] = useState('');
  return (
    <details>
      <summary className="small">Dwellings</summary>
      <ul className="plain small">
        {dwellings.map((d) => <li key={d}>{d}</li>)}
      </ul>
      <form className="row gap" onSubmit={(e) => { e.preventDefault(); const v = name.trim(); if (v && !dwellings.includes(v)) mutate((x) => x.dwellings.push(v)); setName(''); }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Add dwelling or zone" aria-label="New dwelling" />
        <button>Add</button>
      </form>
    </details>
  );
}

/* ---------------- Schedule ---------------- */

function Schedule() {
  const data = useStore((s) => s.project!.data);
  const floorId = useStore((s) => s.floorId);
  const selection = useStore((s) => s.selection);
  const [picked, setPicked] = useState('');
  const [view, setView] = useState<'room' | 'component'>('room');

  const items = useMemo(() => placedItems(data), [data]);
  // One entry per room, floor by floor, plus "not in a room" where a floor has loose items.
  const groups = useMemo(
    () =>
      data.floors
        .map((f) => {
          const names = [...new Set(f.rooms.map((r) => r.name))];
          if (items.some((p) => p.floor.id === f.id && p.room === NO_ROOM)) names.push(NO_ROOM);
          return { floor: f, names };
        })
        .filter((g) => g.names.length > 0),
    [data.floors, items],
  );
  const keys = groups.flatMap((g) => g.names.map((n) => `${g.floor.id}|${n}`));

  // Follow the room selected on the plan; otherwise keep the last pick, else the first room on this floor.
  const selRoom = selection.kind === 'room' ? data.floors.flatMap((f) => f.rooms.map((r) => ({ f, r }))).find((x) => x.r.id === selection.id) : undefined;
  useEffect(() => {
    if (selRoom) setPicked(`${selRoom.f.id}|${selRoom.r.name}`);
  }, [selRoom?.f.id, selRoom?.r.name]);
  const key = keys.includes(picked) ? picked : keys.find((k) => k.startsWith(`${floorId}|`)) ?? keys[0] ?? '';

  const lines = useMemo(() => {
    const at = key.indexOf('|');
    const fid = key.slice(0, at);
    const room = key.slice(at + 1);
    return totals(data, items.filter((p) => p.floor.id === fid && p.room === room));
  }, [data, items, key]);
  const perMetre = (c: Component) => c.symbol === 'profile' || c.symbol === 'loop';

  // Every placed component with its project total and the rooms it sits in.
  const usage = useMemo(
    () =>
      totals(data, items).map((l) => {
        const mine = items.filter((p) => p.code === l.component.code);
        const rooms = data.floors.flatMap((f) => {
          const here = mine.filter((p) => p.floor.id === f.id);
          return [...new Set(here.map((p) => p.room))].map((room) => ({ floor: f.name, room, qty: totals(data, here.filter((p) => p.room === room))[0]?.qty ?? 0 }));
        });
        return { ...l, rooms };
      }),
    [data, items],
  );

  const toggle = (
    <div className="seg">
      <button className={view === 'room' ? 'sel' : ''} onClick={() => setView('room')}>By room</button>
      <button className={view === 'component' ? 'sel' : ''} onClick={() => setView('component')}>By component</button>
    </div>
  );
  if (view === 'component')
    return (
      <div className="pad stack">
        {toggle}
        <table className="tbl">
          <thead>
            <tr><th></th><th>Code</th><th>Component / room</th><th className="num">Qty</th></tr>
          </thead>
          {usage.map((u) => (
            <tbody key={u.component.code}>
              <tr className="comp-row">
                <td><span dangerouslySetInnerHTML={{ __html: svgFor(u.component.symbol, u.component.color, 16) }} /></td>
                <td className="mono">{u.component.code}</td>
                <td>{u.component.name}</td>
                <td className="num"><b>{u.qty}</b>{perMetre(u.component) ? <span className="muted"> m</span> : null}</td>
              </tr>
              {u.rooms.map((r) => (
                <tr key={r.floor + r.room} className="room-row">
                  <td></td>
                  <td></td>
                  <td className="small">{r.room === NO_ROOM ? <span className="muted">Not in a room</span> : r.room}{data.floors.length > 1 && !r.room.startsWith(r.floor) ? <span className="muted"> · {r.floor}</span> : null}</td>
                  <td className="num small">{r.qty}</td>
                </tr>
              ))}
            </tbody>
          ))}
          {usage.length === 0 && <tbody><tr><td colSpan={4} className="muted">Nothing placed yet.</td></tr></tbody>}
        </table>
      </div>
    );
  if (!keys.length) return <div className="pad stack">{toggle}<p className="muted">Draw a room on the plan to see its components here.</p></div>;
  return (
    <div className="pad stack">
      {toggle}
      <select value={key} onChange={(e) => setPicked(e.target.value)} aria-label="Room">
        {groups.map((g) => (
          <optgroup key={g.floor.id} label={g.floor.name}>
            {g.names.map((n) => <option key={n} value={`${g.floor.id}|${n}`}>{n === NO_ROOM ? 'Not in a room' : n}</option>)}
          </optgroup>
        ))}
      </select>
      <table className="tbl">
        <thead>
          <tr><th></th><th>Code</th><th>Component</th><th className="num">Qty</th></tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.component.code}>
              <td><span dangerouslySetInnerHTML={{ __html: svgFor(l.component.symbol, l.component.color, 16) }} /></td>
              <td className="mono">{l.component.code}</td>
              <td>{l.component.name}</td>
              <td className="num">{l.qty}{perMetre(l.component) ? <span className="muted"> m</span> : null}</td>
            </tr>
          ))}
          {lines.length === 0 && <tr><td colSpan={4} className="muted">Nothing placed in this room.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
