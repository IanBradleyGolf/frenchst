import { useState } from 'react';
import { useStore } from '../store';
import { uid } from '../geometry';
import type { Floor, Room, RoomNote } from '../types';

export const AUDIENCES = ['Electrician', 'Switch (automation)', 'Builder', 'Interior designer', 'Us'];

function myName() {
  try {
    return localStorage.getItem('fs.name') ?? '';
  } catch {
    return '';
  }
}
function saveName(v: string) {
  try {
    localStorage.setItem('fs.name', v);
  } catch {
    /* storage unavailable */
  }
}

const when = (iso: string) => new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });

export function openQuestions(r: Room) {
  return (r.notes ?? []).filter((n) => n.kind === 'question' && n.status === 'open').length;
}

function updateNote(floorId: string, roomId: string, noteId: string, fn: (n: RoomNote) => void, key?: string) {
  useStore.getState().mutate((d) => {
    const n = d.floors.find((f) => f.id === floorId)?.rooms.find((r) => r.id === roomId)?.notes?.find((x) => x.id === noteId);
    if (n) fn(n);
  }, key);
}

function NoteCard({ floorId, room, n }: { floorId: string; room: Room; n: RoomNote }) {
  const { mutate } = useStore.getState();
  const up = (fn: (x: RoomNote) => void, key?: string) => updateNote(floorId, room.id, n.id, fn, key);
  const [editing, setEditing] = useState(false);
  return (
    <div className={`note ${n.kind} ${n.status}`}>
      <div className="note-head">
        <span className={`note-kind ${n.kind}`}>{n.kind === 'question' ? 'Question' : 'Comment'}</span>
        {n.for && <span className="note-for">for {n.for}</span>}
        <span className="muted small">{[n.by, when(n.at)].filter(Boolean).join(' · ')}</span>
        <span className="grow" />
        {n.kind === 'question' && (
          <button className="mini" onClick={() => up((x) => (x.status = x.status === 'open' ? 'resolved' : 'open'))} title={n.status === 'open' ? 'Mark as answered' : 'Reopen'}>
            {n.status === 'open' ? '✓ Answered' : 'Reopen'}
          </button>
        )}
        <button className="mini" onClick={() => setEditing((e) => !e)}>{editing ? 'Done' : 'Edit'}</button>
        <button className="icon" title="Delete" onClick={() => { if (window.confirm('Delete this note?')) mutate((d) => { const r = d.floors.find((f) => f.id === floorId)!.rooms.find((x) => x.id === room.id)!; r.notes = (r.notes ?? []).filter((x) => x.id !== n.id); }); }}>×</button>
      </div>
      {editing ? (
        <div className="stack">
          <textarea rows={3} value={n.text} onChange={(e) => up((x) => (x.text = e.target.value), 'note-' + n.id)} />
          <div className="row gap wrap">
            <select value={n.kind} onChange={(e) => up((x) => (x.kind = e.target.value as RoomNote['kind']))}>
              <option value="question">Question</option>
              <option value="comment">Comment</option>
            </select>
            <input list="note-audiences" placeholder="For (who)" value={n.for ?? ''} onChange={(e) => up((x) => (x.for = e.target.value || undefined), 'notefor-' + n.id)} />
          </div>
        </div>
      ) : (
        <div className="note-text">{n.text}</div>
      )}
      {n.kind === 'question' && (
        <textarea className="note-answer" rows={n.answer ? 2 : 1} placeholder="Answer…" value={n.answer ?? ''} onChange={(e) => up((x) => { x.answer = e.target.value || undefined; }, 'noteans-' + n.id)} />
      )}
    </div>
  );
}

/** Questions and comments for one room. */
export function RoomNotes({ floor, room }: { floor: Floor; room: Room }) {
  const { mutate } = useStore.getState();
  const [kind, setKind] = useState<RoomNote['kind']>('question');
  const [text, setText] = useState('');
  const [forWho, setForWho] = useState('');
  const [by, setBy] = useState(myName());
  const notes = room.notes ?? [];
  const sorted = [...notes].sort((a, b) => (a.status === b.status ? b.at.localeCompare(a.at) : a.status === 'open' ? -1 : 1));
  const add = () => {
    const t = text.trim();
    if (!t) return;
    const n: RoomNote = { id: uid(), kind, text: t, for: forWho || undefined, by: by.trim() || undefined, at: new Date().toISOString(), status: 'open' };
    mutate((d) => {
      const r = d.floors.find((f) => f.id === floor.id)!.rooms.find((x) => x.id === room.id)!;
      r.notes = [...(r.notes ?? []), n];
    });
    saveName(by.trim());
    setText('');
  };
  return (
    <div className="stack">
      <h4 style={{ margin: '6px 0 0' }}>Questions & comments</h4>
      <datalist id="note-audiences">{AUDIENCES.map((a) => <option key={a} value={a} />)}</datalist>
      <div className="card-inset stack">
        <textarea rows={2} placeholder={kind === 'question' ? `Ask a question about ${room.name}…` : `Add a comment about ${room.name}…`} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) add(); }} />
        <div className="row gap wrap">
          <select value={kind} onChange={(e) => setKind(e.target.value as RoomNote['kind'])} aria-label="Type">
            <option value="question">Question</option>
            <option value="comment">Comment</option>
          </select>
          <input list="note-audiences" placeholder="For (who)" value={forWho} onChange={(e) => setForWho(e.target.value)} style={{ width: 130 }} />
          <input placeholder="Your name" value={by} onChange={(e) => setBy(e.target.value)} style={{ width: 100 }} />
          <button className="primary" disabled={!text.trim()} onClick={add}>Add</button>
        </div>
      </div>
      {sorted.map((n) => <NoteCard key={n.id} floorId={floor.id} room={room} n={n} />)}
      {!notes.length && <p className="muted small">Nothing yet. Questions stay open until marked answered, and appear in the Notes tab and the exports.</p>}
    </div>
  );
}

/** Every question and comment in the project, grouped by floor and room. */
