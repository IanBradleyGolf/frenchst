import { Fragment, useEffect, useMemo, useState } from 'react';
import { useFloor, useStore } from '../store';
import { distance, mirrorItems, mirrorRoom, roomAt, polygonArea, uid } from '../geometry';
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
import { ReplaceComponent } from './ReplaceComponent';

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
        {(() => {
          const n = data.copies ?? 2;
          const single = new Set(data.singleRooms ?? []);
          const vals = [...new Set(items.map((i) => i.built ?? ''))];
          const effective = [...new Set(items.map((i) => (i.built ? i.built === 'one' : single.has(roomAt(floor, i.x, i.y)?.name ?? '')) ? 1 : n))];
          return (
            <>
              <label htmlFor="pp-built">Built in</label>
              <select id="pp-built" value={vals.length === 1 ? vals[0] : 'mixed'} onChange={(e) => { const v = e.target.value; if (v !== 'mixed') updateSel((it) => { if (v) it.built = v as 'all' | 'one'; else delete it.built; }); }}>
                {vals.length > 1 && <option value="mixed">(mixed)</option>}
                <option value="">Same as its room</option>
                <option value="all">All {n} duplexes (×{n})</option>
                <option value="one">1 duplex only (×1)</option>
              </select>
              <p className="muted small">Counted {effective.length === 1 ? `×${effective[0]}` : 'differently across the selection'} in the exports.</p>
            </>
          );
        })()}
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
          <label className="row gap small" title="Applies to every room with this name, on every floor">
            <input
              type="checkbox"
              checked={(data.singleRooms ?? []).includes(sel.name)}
              onChange={(e) => {
                const on = e.target.checked;
                mutate((d) => {
                  const set = new Set(d.singleRooms ?? []);
                  if (on) set.add(sel.name);
                  else set.delete(sel.name);
                  d.singleRooms = [...set].sort();
                });
              }}
            />
            Components here are for 1 duplex only (counted once in exports, not ×{data.copies ?? 2})
          </label>
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
          <tr><th>Room</th><th>Dwelling</th><th className="num" title="Duplexes the room's components are built in">Built</th><th className="num">Items</th><th className="num" title="Open questions">?</th></tr>
        </thead>
        <tbody>
          {[...floor.rooms].sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true, sensitivity: 'base' })).map((r) => (
            <tr key={r.id} className={sel?.id === r.id ? 'sel' : ''} onClick={() => select({ kind: 'room', id: r.id })}>
              <td>{r.name}</td>
              <td><span className="dot" style={{ background: dwellingColor(data.dwellings, r.dwelling) }} />{r.dwelling}</td>
              <td className="num">{(data.singleRooms ?? []).includes(r.name) ? <b className="one-side">×1</b> : <span className="muted">×{data.copies ?? 2}</span>}</td>
              <td className="num">{countIn(r.id)}</td>
              <td className="num">{openQuestions(r) || ''}</td>
            </tr>
          ))}
          {floor.rooms.length === 0 && <tr><td colSpan={5} className="muted">No rooms yet. Draw rooms so every item is counted against a room and dwelling.</td></tr>}
        </tbody>
      </table>
      {floor.rooms.length > 0 && (() => {
        const names = [...new Set(floor.rooms.map((r) => r.name))];
        const single = new Set(data.singleRooms ?? []);
        const allOn = names.every((n) => single.has(n));
        return (
          <button
            title="Rooms with the same name on other floors (e.g. Lighting, Low Voltage, Powerpoints) follow too"
            onClick={() =>
              mutate((d) => {
                const set = new Set(d.singleRooms ?? []);
                for (const n of names) allOn ? set.delete(n) : set.add(n);
                d.singleRooms = [...set].sort();
              })
            }
          >
            {allOn ? `Count every room on this floor ×${data.copies ?? 2} again` : 'Mark every room on this floor as 1 duplex only'}
          </button>
        );
      })()}
      {data.floors.length > 1 && floor.rooms.length > 0 && <CopyRooms floor={floor} />}
      <DwellingEditor />
    </div>
  );
}

/** Copy this floor's rooms onto other floors at the same positions (e.g. Low Voltage → Powerpoints for the same level). */
function CopyRooms({ floor }: { floor: Floor }) {
  const floors = useStore((s) => s.project!.data.floors);
  const { mutate } = useStore.getState();
  const others = floors.filter((f) => f.id !== floor.id);
  const [open, setOpen] = useState(false);
  const [targets, setTargets] = useState<string[]>([]);
  const [roomIds, setRoomIds] = useState<string[]>(() => floor.rooms.map((r) => r.id));
  const [same, setSame] = useState<'skip' | 'replace'>('skip');
  const [done, setDone] = useState<string | null>(null);
  const sorted = [...floor.rooms].sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }));
  const clashes = others
    .filter((f) => targets.includes(f.id))
    .reduce((n, f) => n + floor.rooms.filter((r) => roomIds.includes(r.id) && f.rooms.some((x) => x.name === r.name)).length, 0);
  const otherSheet = others.filter((f) => targets.includes(f.id) && (f.planId !== floor.planId || f.page !== floor.page));
  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  function run() {
    let added = 0, replaced = 0, skipped = 0;
    mutate((d) => {
      const picked = d.floors.find((f) => f.id === floor.id)!.rooms.filter((r) => roomIds.includes(r.id));
      for (const t of d.floors.filter((f) => targets.includes(f.id))) {
        for (const r of picked) {
          const i = t.rooms.findIndex((x) => x.name === r.name);
          const copy = { id: uid(), name: r.name, dwelling: r.dwelling, points: [...r.points], ...(r.label ? { label: { ...r.label } } : {}) };
          if (i >= 0 && same === 'skip') { skipped++; continue; }
          if (i >= 0) { t.rooms[i] = { ...copy, notes: t.rooms[i].notes }; replaced++; }
          else { t.rooms.push(copy); added++; }
        }
      }
    });
    setDone([`${added} added`, replaced ? `${replaced} replaced` : '', skipped ? `${skipped} skipped (already there)` : ''].filter(Boolean).join(', '));
    setTargets([]);
  }

  if (!open) return <button onClick={() => { setOpen(true); setDone(null); }}>Copy rooms to another floor…</button>;
  return (
    <div className="card-inset stack">
      <b>Copy rooms from {floor.name}</b>
      <div className="small muted">To floor</div>
      <div className="stack tight">
        {others.map((f) => (
          <label key={f.id} className="row gap small"><input type="checkbox" checked={targets.includes(f.id)} onChange={() => setTargets(toggle(targets, f.id))} />{f.name}<span className="muted">({f.rooms.length} rooms)</span></label>
        ))}
      </div>
      <div className="row gap small muted">
        Rooms ({roomIds.length} of {floor.rooms.length})
        <button className="link" onClick={() => setRoomIds(floor.rooms.map((r) => r.id))}>All</button>
        <button className="link" onClick={() => setRoomIds([])}>None</button>
      </div>
      <div className="stack tight copy-rooms-list">
        {sorted.map((r) => (
          <label key={r.id} className="row gap small"><input type="checkbox" checked={roomIds.includes(r.id)} onChange={() => setRoomIds(toggle(roomIds, r.id))} />{r.name}</label>
        ))}
      </div>
      {clashes > 0 && (
        <div className="stack tight small">
          <span>{clashes} room{clashes === 1 ? '' : 's'} already exist on the target floor{targets.length > 1 ? 's' : ''} with the same name:</span>
          <label className="row gap"><input type="radio" checked={same === 'skip'} onChange={() => setSame('skip')} />Skip them</label>
          <label className="row gap"><input type="radio" checked={same === 'replace'} onChange={() => setSame('replace')} />Replace their outline (keeps their notes)</label>
        </div>
      )}
      {otherSheet.length > 0 && <p className="small warn">{otherSheet.map((f) => f.name).join(', ')} {otherSheet.length === 1 ? 'uses' : 'use'} a different drawing, so the rooms land at the same page position and may need nudging.</p>}
      {done && <p className="small muted">Done: {done}.</p>}
      <div className="row gap">
        <button className="primary" disabled={!targets.length || !roomIds.length} onClick={run}>Copy {roomIds.length} room{roomIds.length === 1 ? '' : 's'}</button>
        <button onClick={() => setOpen(false)}>Close</button>
      </div>
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

const byName = (a: string, b: string) => a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' });

function Schedule() {
  const data = useStore((s) => s.project!.data);
  const floorId = useStore((s) => s.floorId);
  const selection = useStore((s) => s.selection);
  const [picked, setPicked] = useState('');
  const [view, setView] = useState<'room' | 'component'>('room');
  const [q, setQ] = useState('');
  const [loose, setLoose] = useState(false); // By component: only items not inside any room
  const [replacing, setReplacing] = useState<string | null | undefined>(undefined); // undefined = closed, null = no code preset

  const items = useMemo(() => placedItems(data), [data]);
  // One entry per room name, totalled across every floor (layers like Low Voltage and Powerpoints share room names),
  // plus "not in a room" if anything is loose.
  const keys = useMemo(() => {
    const names = [...new Set(data.floors.flatMap((f) => f.rooms.map((r) => r.name)))].sort(byName);
    if (items.some((p) => p.room === NO_ROOM)) names.push(NO_ROOM);
    return names;
  }, [data.floors, items]);

  // Follow the room selected on the plan; otherwise keep the last pick, else the first room on this floor.
  const selRoom = selection.kind === 'room' ? data.floors.flatMap((f) => f.rooms.map((r) => ({ f, r }))).find((x) => x.r.id === selection.id) : undefined;
  useEffect(() => {
    if (selRoom) setPicked(selRoom.r.name);
  }, [selRoom?.r.name]);
  const firstHere = data.floors.find((f) => f.id === floorId)?.rooms[0]?.name;
  const key = keys.includes(picked) ? picked : firstHere && keys.includes(firstHere) ? firstHere : keys[0] ?? '';

  const lines = useMemo(() => totals(data, items.filter((p) => p.room === key)), [data, items, key]);
  // For "Not in a room": where each loose component sits, floor by floor.
  const looseByFloor = useMemo(() => {
    if (key !== NO_ROOM) return new Map<string, { floor: Floor; ids: string[]; qty: number }[]>();
    const m = new Map<string, { floor: Floor; ids: string[]; qty: number }[]>();
    for (const f of data.floors) {
      const here = items.filter((p) => p.room === NO_ROOM && p.floor.id === f.id);
      for (const code of new Set(here.map((p) => p.code))) {
        const mine = here.filter((p) => p.code === code);
        const list = m.get(code) ?? [];
        list.push({ floor: f, ids: mine.map((p) => p.itemId), qty: totals(data, mine)[0]?.qty ?? 0 });
        m.set(code, list);
      }
    }
    return m;
  }, [data, items, key]);
  const { focusItems } = useStore.getState();
  const perMetre = (c: Component) => c.symbol === 'profile' || c.symbol === 'loop';

  const looseCount = useMemo(() => items.filter((p) => p.room === NO_ROOM).length, [items]);
  // Every placed component with its project total and the rooms it sits in.
  const usage = useMemo(() => {
    const pool = loose ? items.filter((p) => p.room === NO_ROOM) : items;
    return totals(data, pool).map((l) => {
        const mine = pool.filter((p) => p.code === l.component.code);
        // One row per room name, totalled across floors; loose items get one row per floor so they can be found.
        const rooms = [...new Set(mine.filter((p) => p.room !== NO_ROOM).map((p) => p.room))]
          .sort(byName)
          .map((room) => ({ room, floor: null as Floor | null, ids: [] as string[], qty: totals(data, mine.filter((p) => p.room === room))[0]?.qty ?? 0 }));
        for (const f of data.floors) {
          const here = mine.filter((p) => p.room === NO_ROOM && p.floor.id === f.id);
          if (here.length) rooms.push({ room: NO_ROOM, floor: f, ids: here.map((p) => p.itemId), qty: totals(data, here)[0]?.qty ?? 0 });
        }
        return { ...l, rooms };
      });
  }, [data, items, loose]);

  // Search: a component matches on code, name or category (all its rooms shown); otherwise only its rooms that match are shown.
  const shown = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return usage;
    const hit = (text: string) => terms.every((t) => text.toLowerCase().includes(t));
    return usage.flatMap((u) => {
      const c = u.component;
      if (hit(`${c.code} ${c.name} ${c.category}`)) return [u];
      const rooms = u.rooms.filter((r) => hit(`${c.code} ${c.name} ${c.category} ${r.room === NO_ROOM ? 'not in a room' : r.room}`));
      return rooms.length ? [{ ...u, rooms }] : [];
    });
  }, [usage, q]);

  const toggle = (
    <div className="seg">
      <button className={view === 'room' ? 'sel' : ''} onClick={() => setView('room')}>By room</button>
      <button className={view === 'component' ? 'sel' : ''} onClick={() => setView('component')}>By component</button>
    </div>
  );
  if (view === 'component')
    return (
      <div className="pad stack">
        <div className="row gap wrap">
          {toggle}
          <button onClick={() => setReplacing(null)} disabled={usage.length === 0} title="Change every instance of one component to another, e.g. all DL1 to DL3">Replace…</button>
        </div>
        <label className="row gap small" title="Components placed outside every room you've drawn">
          <input type="checkbox" checked={loose} onChange={(e) => setLoose(e.target.checked)} />
          Only show components not in a room ({looseCount})
        </label>
        <div className="search-wrap">
          <input className="search" type="search" placeholder="Search code, component or room" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') setQ(''); }} aria-label="Search schedule" />
        </div>
        {replacing !== undefined && <ReplaceComponent key={replacing ?? ''} from={replacing ?? undefined} onClose={() => setReplacing(undefined)} />}
        <table className="tbl">
          <thead>
            <tr><th></th><th>Code</th><th>Component / room</th><th className="num">Qty</th></tr>
          </thead>
          {shown.map((u) => (
            <tbody key={u.component.code}>
              <tr className="comp-row">
                <td><span dangerouslySetInnerHTML={{ __html: svgFor(u.component.symbol, u.component.color, 16) }} /></td>
                <td className="mono">{u.component.code}</td>
                <td>{u.component.name} <button className="icon swap" title={`Replace every ${u.component.code} with another component`} onClick={() => setReplacing(u.component.code)}>⇄</button></td>
                <td className="num"><b>{u.qty}</b>{perMetre(u.component) ? <span className="muted"> m</span> : null}</td>
              </tr>
              {u.rooms.map((r) => (
                <tr key={r.room + (r.floor?.id ?? '')} className={r.floor ? 'room-row find' : 'room-row'} onClick={r.floor ? () => focusItems(r.floor!.id, r.ids) : undefined} title={r.floor ? 'Show these on the plan' : undefined}>
                  <td></td>
                  <td></td>
                  <td className="small">{r.floor ? <><span className="muted">Not in a room · </span>{r.floor.name} <span className="find-hint">Show ›</span></> : r.room}</td>
                  <td className="num small">{r.qty}</td>
                </tr>
              ))}
            </tbody>
          ))}
          {usage.length === 0 && <tbody><tr><td colSpan={4} className="muted">{loose ? 'Every component is inside a room.' : 'Nothing placed yet.'}</td></tr></tbody>}
          {usage.length > 0 && shown.length === 0 && <tbody><tr><td colSpan={4} className="muted">Nothing matches “{q.trim()}”.</td></tr></tbody>}
        </table>
      </div>
    );
  if (!keys.length) return <div className="pad stack">{toggle}<p className="muted">Draw a room on the plan to see its components here.</p></div>;
  return (
    <div className="pad stack">
      {toggle}
      <select value={key} onChange={(e) => setPicked(e.target.value)} aria-label="Room">
        {keys.map((n) => <option key={n} value={n}>{n === NO_ROOM ? 'Not in a room' : n}</option>)}
      </select>
      <table className="tbl">
        <thead>
          <tr><th></th><th>Code</th><th>Component</th><th className="num">Qty</th></tr>
        </thead>
        <tbody>
          {lines.map((l) => {
            const where = looseByFloor.get(l.component.code) ?? [];
            const all = () => where[0] && focusItems(where[0].floor.id, where[0].ids);
            return (
              <Fragment key={l.component.code}>
                <tr className={where.length ? 'find' : undefined} onClick={where.length ? all : undefined} title={where.length ? 'Show on the plan' : undefined}>
                  <td><span dangerouslySetInnerHTML={{ __html: svgFor(l.component.symbol, l.component.color, 16) }} /></td>
                  <td className="mono">{l.component.code}</td>
                  <td>{l.component.name}</td>
                  <td className="num">{l.qty}{perMetre(l.component) ? <span className="muted"> m</span> : null}</td>
                </tr>
                {where.map((w) => (
                  <tr key={w.floor.id} className="room-row find" onClick={() => focusItems(w.floor.id, w.ids)} title="Show these on the plan">
                    <td></td>
                    <td></td>
                    <td className="small">{w.floor.name} <span className="find-hint">Show ›</span></td>
                    <td className="num small">{w.qty}</td>
                  </tr>
                ))}
              </Fragment>
            );
          })}
          {lines.length === 0 && <tr><td colSpan={4} className="muted">Nothing placed in this room.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
