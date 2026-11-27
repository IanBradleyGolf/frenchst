import express, { type Request, type Response, type NextFunction } from 'express';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createStore, ConflictError } from './store.js';

const store = createStore();
const app = express();
app.use(express.json({ limit: '25mb' }));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 60 * 1024 * 1024 } });

const ID = /^[0-9a-f-]{36}$/i;

// App Service Authentication (Easy Auth) passes the signed-in user in this header.
function userOf(req: Request): string | null {
  return (req.header('x-ms-client-principal-name') as string | undefined) ?? null;
}

const wrap =
  (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

function checkId(req: Request, res: Response, key = 'id') {
  if (!ID.test(req.params[key] ?? '')) {
    res.status(400).json({ error: 'Invalid id' });
    return false;
  }
  return true;
}

app.get('/api/health', (_req, res) => res.json({ ok: true, storage: store.describe() }));
app.get('/api/me', (req, res) => res.json({ user: userOf(req) }));

app.get('/api/projects', wrap(async (_req, res) => res.json(await store.listProjects())));

app.post(
  '/api/projects',
  wrap(async (req, res) => {
    const { name, data } = req.body ?? {};
    if (!name || typeof name !== 'string') return res.status(400).json({ error: 'Name is required' });
    res.status(201).json(await store.createProject(name.slice(0, 200), data ?? {}, userOf(req)));
  }),
);

app.get(
  '/api/projects/:id',
  wrap(async (req, res) => {
    if (!checkId(req, res)) return;
    const p = await store.getProject(req.params.id);
    if (!p) return res.status(404).json({ error: 'Project not found' });
    res.json(p);
  }),
);

app.put(
  '/api/projects/:id',
  wrap(async (req, res) => {
    if (!checkId(req, res)) return;
    const { name, data, version } = req.body ?? {};
    if (typeof version !== 'number') return res.status(400).json({ error: 'version is required' });
    try {
      res.json(await store.saveProject(req.params.id, String(name ?? 'Untitled').slice(0, 200), data, version, userOf(req)));
    } catch (e) {
      if (e instanceof ConflictError) return res.status(409).json({ error: 'Someone else saved this project since you opened it.', current: e.current });
      throw e;
    }
  }),
);

app.delete(
  '/api/projects/:id',
  wrap(async (req, res) => {
    if (!checkId(req, res)) return;
    await store.deleteProject(req.params.id);
    res.status(204).end();
  }),
);

app.post(
  '/api/projects/:id/copy',
  wrap(async (req, res) => {
    if (!checkId(req, res)) return;
    const name = String(req.body?.name ?? '').trim();
    if (!name) return res.status(400).json({ error: 'Name is required' });
    const p = await store.copyProject(req.params.id, name.slice(0, 200), userOf(req));
    if (!p) return res.status(404).json({ error: 'Project not found' });
    res.status(201).json(p);
  }),
);

app.get(
  '/api/projects/:id/plans',
  wrap(async (req, res) => {
    if (!checkId(req, res)) return;
    res.json(await store.listPlans(req.params.id));
  }),
);

app.post(
  '/api/projects/:id/plans',
  upload.single('file'),
  wrap(async (req, res) => {
    if (!checkId(req, res)) return;
    const f = req.file;
    if (!f) return res.status(400).json({ error: 'Attach a PDF file' });
    if (!f.buffer.subarray(0, 5).toString('latin1').startsWith('%PDF')) return res.status(400).json({ error: 'That file is not a PDF' });
    res.status(201).json(await store.addPlan(req.params.id, f.originalname, f.buffer));
  }),
);

app.get(
  '/api/plans/:id',
  wrap(async (req, res) => {
    if (!checkId(req, res)) return;
    const p = await store.getPlanContent(req.params.id);
    if (!p) return res.status(404).json({ error: 'Plan not found' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    res.send(p.content);
  }),
);

app.get(
  '/api/projects/:id/revisions',
  wrap(async (req, res) => {
    if (!checkId(req, res)) return;
    res.json(await store.listRevisions(req.params.id));
  }),
);

app.post(
  '/api/projects/:id/revisions',
  wrap(async (req, res) => {
    if (!checkId(req, res)) return;
    const { label, note, data } = req.body ?? {};
    if (!label) return res.status(400).json({ error: 'Label is required' });
    res.status(201).json(await store.createRevision(req.params.id, String(label).slice(0, 100), note ? String(note).slice(0, 1000) : null, data, userOf(req)));
  }),
);

app.get(
  '/api/revisions/:id',
  wrap(async (req, res) => {
    if (!checkId(req, res)) return;
    const r = await store.getRevision(req.params.id);
    if (!r) return res.status(404).json({ error: 'Revision not found' });
    res.json(r);
  }),
);

// Serve the built client in production.
const here = path.dirname(fileURLToPath(import.meta.url));
const clientDist = [path.resolve(here, '../../client/dist'), path.resolve(here, '../public')].find((p) => fs.existsSync(p));
if (clientDist) {
  app.use(express.static(clientDist, { index: false, maxAge: '1h' }));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Server error' });
});

const port = Number(process.env.PORT ?? 8080);
store
  .init()
  .then(() => app.listen(port, () => console.log(`French St Planner on :${port} using ${store.describe()}`)))
  .catch((e) => {
    console.error('Storage failed to start:', e);
    process.exit(1);
  });
