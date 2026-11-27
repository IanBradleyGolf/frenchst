import { useEffect, useState } from 'react';
import { api } from '../api';
import { newProjectData } from '../library';
import type { ProjectSummary } from '../types';

export function ProjectList({ onOpen }: { onOpen: (id: string) => void }) {
  const [list, setList] = useState<ProjectSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('48–48A French St, Maroubra');
  const [busy, setBusy] = useState(false);
  const [copying, setCopying] = useState<{ id: string; name: string } | null>(null);
  const [copyBusy, setCopyBusy] = useState(false);

  useEffect(() => {
    api.listProjects().then(setList).catch((e) => setError(e.message));
  }, []);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      const p = await api.createProject(name.trim(), newProjectData());
      onOpen(p.id);
    } catch (err: any) {
      setError(err.message);
      setBusy(false);
    }
  }

  async function copy(e: React.FormEvent) {
    e.preventDefault();
    if (!copying || !copying.name.trim()) return;
    setCopyBusy(true);
    try {
      const p = await api.copyProject(copying.id, copying.name.trim());
      onOpen(p.id);
    } catch (err: any) {
      setError(err.message);
      setCopyBusy(false);
    }
  }

  return (
    <div className="home">
      <header className="home-head">
        <div className="brand">
          <span className="brand-mark" aria-hidden>
            <svg width="22" height="22" viewBox="0 0 22 22"><rect x="1" y="1" width="20" height="20" rx="3" fill="none" stroke="currentColor" strokeWidth="1.6" /><circle cx="7" cy="8" r="2.2" fill="currentColor" /><circle cx="15" cy="8" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.4" /><rect x="5" y="14" width="12" height="3" fill="currentColor" /></svg>
          </span>
          French St Planner
        </div>
        <p>Place lighting, power, data and control components on your plans, then export quantities and marked-up drawings.</p>
      </header>

      <section className="home-grid">
        <div className="card">
          <h2>Projects</h2>
          {error && <p className="error">{error}</p>}
          {!list && !error && <p className="muted">Loading…</p>}
          {list && list.length === 0 && <p className="muted">No projects yet. Create one to start.</p>}
          <ul className="project-list">
            {list?.map((p) => (
              <li key={p.id}>
                <div className="pl-row">
                  <button className="pl-open" onClick={() => onOpen(p.id)}>
                    <span className="pl-name">{p.name}</span>
                    <span className="pl-meta">
                      Saved {new Date(p.updatedAt).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })}
                      {p.updatedBy ? ` by ${p.updatedBy}` : ''}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="pl-copy"
                    title="Copy this project, including its plans and revisions"
                    onClick={() => setCopying(copying?.id === p.id ? null : { id: p.id, name: `${p.name} (copy)` })}
                  >
                    Copy
                  </button>
                </div>
                {copying?.id === p.id && (
                  <form className="pl-copy-form" onSubmit={copy}>
                    <input
                      autoFocus
                      value={copying.name}
                      onChange={(e) => setCopying({ ...copying, name: e.target.value })}
                      aria-label="Name for the copy"
                    />
                    <button className="primary" disabled={copyBusy || !copying.name.trim()}>
                      {copyBusy ? 'Copying…' : 'Create copy'}
                    </button>
                    <button type="button" onClick={() => setCopying(null)} disabled={copyBusy}>
                      Cancel
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </div>
        <form className="card" onSubmit={create}>
          <h2>New project</h2>
          <label htmlFor="np-name">Name</label>
          <input id="np-name" value={name} onChange={(e) => setName(e.target.value)} />
          <p className="muted small">Starts with the LA Lounge fitting types plus power, data and control components. You can edit the library at any time.</p>
          <button className="primary" disabled={busy}>
            {busy ? 'Creating…' : 'Create project'}
          </button>
        </form>
      </section>
    </div>
  );
}
