import type { PlanFile, Project, ProjectData, ProjectSummary } from './types';

export class ApiError extends Error {
  constructor(public status: number, message: string, public body?: any) {
    super(message);
  }
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { ...(init?.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...init?.headers } });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const body = text ? JSON.parse(text) : undefined;
  if (!res.ok) throw new ApiError(res.status, body?.error ?? `Request failed (${res.status})`, body);
  return body as T;
}

export const api = {
  listProjects: () => call<ProjectSummary[]>('/api/projects'),
  getProject: (id: string) => call<Project>(`/api/projects/${id}`),
  createProject: (name: string, data: ProjectData) => call<Project>('/api/projects', { method: 'POST', body: JSON.stringify({ name, data }) }),
  saveProject: (id: string, name: string, data: ProjectData, version: number) =>
    call<ProjectSummary>(`/api/projects/${id}`, { method: 'PUT', body: JSON.stringify({ name, data, version }) }),
  copyProject: (id: string, name: string) => call<Project>(`/api/projects/${id}/copy`, { method: 'POST', body: JSON.stringify({ name }) }),
  deleteProject: (id: string) => call<void>(`/api/projects/${id}`, { method: 'DELETE' }),
  listPlans: (projectId: string) => call<PlanFile[]>(`/api/projects/${projectId}/plans`),
  uploadPlan: (projectId: string, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return call<PlanFile>(`/api/projects/${projectId}/plans`, { method: 'POST', body: fd });
  },
  planUrl: (planId: string) => `/api/plans/${planId}`,
};
