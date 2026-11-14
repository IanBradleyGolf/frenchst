import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sql from 'mssql';

export interface ProjectSummary {
  id: string;
  name: string;
  version: number;
  updatedAt: string;
  updatedBy: string | null;
}
export interface ProjectRecord extends ProjectSummary {
  data: unknown;
}
export interface PlanRecord {
  id: string;
  projectId: string;
  fileName: string;
  size: number;
  uploadedAt: string;
}
export interface RevisionSummary {
  id: string;
  projectId: string;
  label: string;
  note: string | null;
  createdAt: string;
  createdBy: string | null;
}

export class ConflictError extends Error {
  constructor(public current: number) {
    super('Version conflict');
  }
}

export interface Store {
  init(): Promise<void>;
  listProjects(): Promise<ProjectSummary[]>;
  getProject(id: string): Promise<ProjectRecord | null>;
  createProject(name: string, data: unknown, user: string | null): Promise<ProjectRecord>;
  saveProject(id: string, name: string, data: unknown, expectedVersion: number, user: string | null): Promise<ProjectSummary>;
  deleteProject(id: string): Promise<void>;
  addPlan(projectId: string, fileName: string, content: Buffer): Promise<PlanRecord>;
  listPlans(projectId: string): Promise<PlanRecord[]>;
  getPlanContent(id: string): Promise<{ fileName: string; content: Buffer } | null>;
  createRevision(projectId: string, label: string, note: string | null, data: unknown, user: string | null): Promise<RevisionSummary>;
  listRevisions(projectId: string): Promise<RevisionSummary[]>;
  getRevision(id: string): Promise<(RevisionSummary & { data: unknown }) | null>;
  describe(): string;
}

const now = () => new Date().toISOString();
const newId = () => crypto.randomUUID();

/* ---------------- Azure SQL ---------------- */

const SCHEMA = `
IF OBJECT_ID('dbo.fs_projects','U') IS NULL
CREATE TABLE dbo.fs_projects (
  id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
  name NVARCHAR(200) NOT NULL,
  version INT NOT NULL,
  data NVARCHAR(MAX) NOT NULL,
  updated_at DATETIME2 NOT NULL,
  updated_by NVARCHAR(200) NULL
);
IF OBJECT_ID('dbo.fs_plans','U') IS NULL
CREATE TABLE dbo.fs_plans (
  id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
  project_id UNIQUEIDENTIFIER NOT NULL,
  file_name NVARCHAR(260) NOT NULL,
  size INT NOT NULL,
  content VARBINARY(MAX) NOT NULL,
  uploaded_at DATETIME2 NOT NULL
);
IF OBJECT_ID('dbo.fs_revisions','U') IS NULL
CREATE TABLE dbo.fs_revisions (
  id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
  project_id UNIQUEIDENTIFIER NOT NULL,
  label NVARCHAR(100) NOT NULL,
  note NVARCHAR(1000) NULL,
  data NVARCHAR(MAX) NOT NULL,
  created_at DATETIME2 NOT NULL,
  created_by NVARCHAR(200) NULL
);
`;

function sqlConfig(): sql.config | string {
  if (process.env.SQL_CONNECTION_STRING) return process.env.SQL_CONNECTION_STRING;
  const server = process.env.SQL_SERVER ?? 'metricus.database.windows.net';
  const database = process.env.SQL_DATABASE ?? 'frenchst';
  const base = { server, database, options: { encrypt: true, trustServerCertificate: false }, pool: { max: 5 } };
  if ((process.env.SQL_AUTH ?? 'managed-identity') === 'sql') {
    return { ...base, user: process.env.SQL_USER, password: process.env.SQL_PASSWORD };
  }
  // Managed identity on App Service, or `az login` locally.
  return {
    ...base,
    authentication: {
      type: 'azure-active-directory-default',
      options: process.env.SQL_MI_CLIENT_ID ? { clientId: process.env.SQL_MI_CLIENT_ID } : {},
    },
  } as sql.config;
}

export class SqlStore implements Store {
  private pool!: sql.ConnectionPool;
  describe() {
    return `Azure SQL (${process.env.SQL_SERVER ?? 'metricus.database.windows.net'}/${process.env.SQL_DATABASE ?? 'frenchst'})`;
  }
  async init() {
    const cfg = sqlConfig();
    this.pool = typeof cfg === 'string' ? await new sql.ConnectionPool(cfg).connect() : await new sql.ConnectionPool(cfg).connect();
    await this.pool.request().batch(SCHEMA);
  }
  private req() {
    return this.pool.request();
  }
  async listProjects() {
    const r = await this.req().query(
      'SELECT id, name, version, updated_at, updated_by FROM dbo.fs_projects ORDER BY updated_at DESC',
    );
    return r.recordset.map(rowToSummary);
  }
  async getProject(id: string) {
    const r = await this.req().input('id', sql.UniqueIdentifier, id).query('SELECT * FROM dbo.fs_projects WHERE id=@id');
    const row = r.recordset[0];
    return row ? { ...rowToSummary(row), data: JSON.parse(row.data) } : null;
  }
  async createProject(name: string, data: unknown, user: string | null) {
    const id = newId();
    const ts = new Date();
    await this.req()
      .input('id', sql.UniqueIdentifier, id)
      .input('name', sql.NVarChar(200), name)
      .input('data', sql.NVarChar(sql.MAX), JSON.stringify(data))
      .input('ts', sql.DateTime2, ts)
      .input('user', sql.NVarChar(200), user)
      .query('INSERT INTO dbo.fs_projects (id,name,version,data,updated_at,updated_by) VALUES (@id,@name,1,@data,@ts,@user)');
    return { id, name, version: 1, updatedAt: ts.toISOString(), updatedBy: user, data };
  }
  async saveProject(id: string, name: string, data: unknown, expectedVersion: number, user: string | null) {
    const ts = new Date();
    const r = await this.req()
      .input('id', sql.UniqueIdentifier, id)
      .input('name', sql.NVarChar(200), name)
      .input('data', sql.NVarChar(sql.MAX), JSON.stringify(data))
      .input('v', sql.Int, expectedVersion)
      .input('ts', sql.DateTime2, ts)
      .input('user', sql.NVarChar(200), user)
      .query(
        'UPDATE dbo.fs_projects SET name=@name, data=@data, version=version+1, updated_at=@ts, updated_by=@user WHERE id=@id AND version=@v; SELECT version FROM dbo.fs_projects WHERE id=@id',
      );
    const current = r.recordset[0]?.version;
    if (r.rowsAffected[0] === 0) throw new ConflictError(current ?? -1);
    return { id, name, version: current, updatedAt: ts.toISOString(), updatedBy: user };
  }
  async deleteProject(id: string) {
    await this.req()
      .input('id', sql.UniqueIdentifier, id)
      .query(
        'DELETE FROM dbo.fs_plans WHERE project_id=@id; DELETE FROM dbo.fs_revisions WHERE project_id=@id; DELETE FROM dbo.fs_projects WHERE id=@id',
      );
  }
  async addPlan(projectId: string, fileName: string, content: Buffer) {
    const id = newId();
    const ts = new Date();
    await this.req()
      .input('id', sql.UniqueIdentifier, id)
      .input('pid', sql.UniqueIdentifier, projectId)
      .input('fn', sql.NVarChar(260), fileName)
      .input('size', sql.Int, content.length)
      .input('content', sql.VarBinary(sql.MAX), content)
      .input('ts', sql.DateTime2, ts)
      .query('INSERT INTO dbo.fs_plans (id,project_id,file_name,size,content,uploaded_at) VALUES (@id,@pid,@fn,@size,@content,@ts)');
    return { id, projectId, fileName, size: content.length, uploadedAt: ts.toISOString() };
  }
  async listPlans(projectId: string) {
    const r = await this.req()
      .input('pid', sql.UniqueIdentifier, projectId)
      .query('SELECT id, project_id, file_name, size, uploaded_at FROM dbo.fs_plans WHERE project_id=@pid ORDER BY uploaded_at');
    return r.recordset.map((x) => ({
      id: x.id,
      projectId: x.project_id,
      fileName: x.file_name,
      size: x.size,
      uploadedAt: new Date(x.uploaded_at).toISOString(),
    }));
  }
  async getPlanContent(id: string) {
    const r = await this.req().input('id', sql.UniqueIdentifier, id).query('SELECT file_name, content FROM dbo.fs_plans WHERE id=@id');
    const row = r.recordset[0];
    return row ? { fileName: row.file_name, content: row.content as Buffer } : null;
  }
  async createRevision(projectId: string, label: string, note: string | null, data: unknown, user: string | null) {
    const id = newId();
    const ts = new Date();
    await this.req()
      .input('id', sql.UniqueIdentifier, id)
      .input('pid', sql.UniqueIdentifier, projectId)
      .input('label', sql.NVarChar(100), label)
      .input('note', sql.NVarChar(1000), note)
      .input('data', sql.NVarChar(sql.MAX), JSON.stringify(data))
      .input('ts', sql.DateTime2, ts)
      .input('user', sql.NVarChar(200), user)
      .query(
        'INSERT INTO dbo.fs_revisions (id,project_id,label,note,data,created_at,created_by) VALUES (@id,@pid,@label,@note,@data,@ts,@user)',
      );
    return { id, projectId, label, note, createdAt: ts.toISOString(), createdBy: user };
  }
  async listRevisions(projectId: string) {
    const r = await this.req()
      .input('pid', sql.UniqueIdentifier, projectId)
      .query('SELECT id, project_id, label, note, created_at, created_by FROM dbo.fs_revisions WHERE project_id=@pid ORDER BY created_at DESC');
    return r.recordset.map(rowToRevision);
  }
  async getRevision(id: string) {
    const r = await this.req().input('id', sql.UniqueIdentifier, id).query('SELECT * FROM dbo.fs_revisions WHERE id=@id');
    const row = r.recordset[0];
    return row ? { ...rowToRevision(row), data: JSON.parse(row.data) } : null;
  }
}

function rowToSummary(row: any): ProjectSummary {
  return {
    id: String(row.id).toLowerCase(),
    name: row.name,
    version: row.version,
    updatedAt: new Date(row.updated_at).toISOString(),
    updatedBy: row.updated_by ?? null,
  };
}
function rowToRevision(row: any): RevisionSummary {
  return {
    id: String(row.id).toLowerCase(),
    projectId: String(row.project_id).toLowerCase(),
    label: row.label,
    note: row.note ?? null,
    createdAt: new Date(row.created_at).toISOString(),
    createdBy: row.created_by ?? null,
  };
}

/* ---------------- Local files (development) ---------------- */

export class FileStore implements Store {
  constructor(private dir: string) {}
  describe() {
    return `local files (${this.dir})`;
  }
  private p(...parts: string[]) {
    return path.join(this.dir, ...parts);
  }
  async init() {
    for (const d of ['projects', 'plans', 'revisions']) await fs.mkdir(this.p(d), { recursive: true });
  }
  private async readJson<T>(file: string): Promise<T | null> {
    try {
      return JSON.parse(await fs.readFile(file, 'utf8')) as T;
    } catch {
      return null;
    }
  }
  async listProjects() {
    const files = await fs.readdir(this.p('projects'));
    const out: ProjectSummary[] = [];
    for (const f of files) {
      const r = await this.readJson<ProjectRecord>(this.p('projects', f));
      if (r) out.push({ id: r.id, name: r.name, version: r.version, updatedAt: r.updatedAt, updatedBy: r.updatedBy });
    }
    return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  getProject(id: string) {
    return this.readJson<ProjectRecord>(this.p('projects', `${safe(id)}.json`));
  }
  async createProject(name: string, data: unknown, user: string | null) {
    const rec: ProjectRecord = { id: newId(), name, version: 1, updatedAt: now(), updatedBy: user, data };
    await fs.writeFile(this.p('projects', `${rec.id}.json`), JSON.stringify(rec));
    return rec;
  }
  async saveProject(id: string, name: string, data: unknown, expectedVersion: number, user: string | null) {
    const cur = await this.getProject(id);
    if (!cur) throw new Error('Not found');
    if (cur.version !== expectedVersion) throw new ConflictError(cur.version);
    const rec: ProjectRecord = { id, name, version: cur.version + 1, updatedAt: now(), updatedBy: user, data };
    await fs.writeFile(this.p('projects', `${safe(id)}.json`), JSON.stringify(rec));
    const { data: _d, ...summary } = rec;
    return summary;
  }
  async deleteProject(id: string) {
    await fs.rm(this.p('projects', `${safe(id)}.json`), { force: true });
  }
  async addPlan(projectId: string, fileName: string, content: Buffer) {
    const rec: PlanRecord = { id: newId(), projectId, fileName, size: content.length, uploadedAt: now() };
    await fs.writeFile(this.p('plans', `${rec.id}.pdf`), content);
    await fs.writeFile(this.p('plans', `${rec.id}.json`), JSON.stringify(rec));
    return rec;
  }
  async listPlans(projectId: string) {
    const out: PlanRecord[] = [];
    for (const f of await fs.readdir(this.p('plans'))) {
      if (!f.endsWith('.json')) continue;
      const r = await this.readJson<PlanRecord>(this.p('plans', f));
      if (r?.projectId === projectId) out.push(r);
    }
    return out.sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt));
  }
  async getPlanContent(id: string) {
    const meta = await this.readJson<PlanRecord>(this.p('plans', `${safe(id)}.json`));
    if (!meta) return null;
    return { fileName: meta.fileName, content: await fs.readFile(this.p('plans', `${safe(id)}.pdf`)) };
  }
  async createRevision(projectId: string, label: string, note: string | null, data: unknown, user: string | null) {
    const rec = { id: newId(), projectId, label, note, createdAt: now(), createdBy: user, data };
    await fs.writeFile(this.p('revisions', `${rec.id}.json`), JSON.stringify(rec));
    const { data: _d, ...summary } = rec;
    return summary;
  }
  async listRevisions(projectId: string) {
    const out: RevisionSummary[] = [];
    for (const f of await fs.readdir(this.p('revisions'))) {
      const r = await this.readJson<RevisionSummary & { data: unknown }>(this.p('revisions', f));
      if (r?.projectId === projectId) {
        const { data: _d, ...s } = r;
        out.push(s);
      }
    }
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  getRevision(id: string) {
    return this.readJson<RevisionSummary & { data: unknown }>(this.p('revisions', `${safe(id)}.json`));
  }
}

function safe(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('Bad id');
  return id;
}

export function createStore(): Store {
  if (process.env.STORAGE === 'file' || (!process.env.SQL_SERVER && !process.env.SQL_CONNECTION_STRING && process.env.NODE_ENV !== 'production')) {
    return new FileStore(process.env.DATA_DIR ?? path.resolve(process.cwd(), '..', 'data'));
  }
  return new SqlStore();
}
