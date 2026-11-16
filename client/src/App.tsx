import { useEffect, useState } from 'react';
import { api } from './api';
import { useStore } from './store';
import { ProjectList } from './components/ProjectList';
import { Editor } from './components/Editor';
import { UpdateBanner } from './components/UpdateBanner';
import { CATEGORY_MOVES, DEFAULT_LIBRARY } from './library';
import type { ProjectData } from './types';

function readHash() {
  const m = location.hash.match(/^#p-([0-9a-f-]{36})$/i);
  return m ? m[1] : null;
}

export function App() {
  return (
    <>
      <UpdateBanner />
      <Main />
    </>
  );
}

function Main() {
  const [projectId, setProjectId] = useState<string | null>(readHash());
  const project = useStore((s) => s.project);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const h = () => setProjectId(readHash());
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
  }, []);

  useEffect(() => {
    if (!projectId) {
      useStore.getState().setProject(null);
      return;
    }
    setError(null);
    api
      .getProject(projectId)
      .then((p) => {
        // Older projects: make sure required fields exist.
        const defaults: ProjectData = { schema: 1, dwellings: ['Dwelling 1', 'Dwelling 2', 'Common'], symbolSize: 4, library: structuredClone(DEFAULT_LIBRARY), floors: [] };
        p.data = Object.assign(defaults, p.data ?? {});
        useStore.getState().setProject(p);
        // New standard components appear automatically; ones removed on purpose are not re-added.
        const have = new Set(p.data.library.map((c) => c.code));
        const seen = new Set(p.data.stdSeen ?? []);
        const fresh = DEFAULT_LIBRARY.filter((c) => !have.has(c.code) && !seen.has(c.code));
        const moves = p.data.library.filter((c) => CATEGORY_MOVES[c.code]?.[0] === c.category);
        if (fresh.length || moves.length || DEFAULT_LIBRARY.some((c) => !seen.has(c.code))) {
          useStore.getState().mutate((d) => {
            d.library.push(...structuredClone(fresh));
            for (const c of d.library) if (CATEGORY_MOVES[c.code]?.[0] === c.category) c.category = CATEGORY_MOVES[c.code][1];
            d.stdSeen = DEFAULT_LIBRARY.map((c) => c.code);
          });
        }
      })
      .catch((e) => setError(e.message));
  }, [projectId]);

  const open = (id: string) => (location.hash = `p-${id}`);
  const back = () => {
    history.pushState('', document.title, location.pathname);
    setProjectId(null);
  };

  if (!projectId) return <ProjectList onOpen={open} />;
  if (error)
    return (
      <div className="home">
        <p className="error">{error}</p>
        <button onClick={back}>Back to projects</button>
      </div>
    );
  if (!project || project.id !== projectId) return <div className="home muted">Opening project…</div>;
  return <Editor onBack={back} />;
}
