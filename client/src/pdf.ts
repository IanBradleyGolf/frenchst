import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { api } from './api';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

type Doc = pdfjs.PDFDocumentProxy;
const docs = new Map<string, Promise<Doc>>();
const bytes = new Map<string, Promise<ArrayBuffer>>();
const renders = new Map<string, Promise<HTMLCanvasElement>>();

export function planBytes(planId: string): Promise<ArrayBuffer> {
  let p = bytes.get(planId);
  if (!p) {
    p = fetch(api.planUrl(planId)).then((r) => {
      if (!r.ok) throw new Error('Could not load the plan file');
      return r.arrayBuffer();
    });
    bytes.set(planId, p);
  }
  return p;
}

export function loadDoc(planId: string): Promise<Doc> {
  let p = docs.get(planId);
  if (!p) {
    // pdf.js takes ownership of the buffer it is given, so hand it a copy.
    p = planBytes(planId).then((b) => pdfjs.getDocument({ data: b.slice(0) }).promise);
    docs.set(planId, p);
  }
  return p;
}

export async function pageSize(planId: string, page: number) {
  const doc = await loadDoc(planId);
  const pg = await doc.getPage(page);
  const vp = pg.getViewport({ scale: 1 });
  return { width: vp.width, height: vp.height, rotation: pg.rotate };
}

/** Renders a page to a canvas at `scale` × page points. Cached per plan/page/scale. */
export function renderPage(planId: string, page: number, scale: number): Promise<HTMLCanvasElement> {
  const key = `${planId}:${page}:${scale}`;
  let p = renders.get(key);
  if (!p) {
    p = (async () => {
      const doc = await loadDoc(planId);
      const pg = await doc.getPage(page);
      const vp = pg.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(vp.width);
      canvas.height = Math.floor(vp.height);
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await pg.render({ canvasContext: ctx, viewport: vp }).promise;
      return canvas;
    })();
    renders.set(key, p);
  }
  return p;
}

export async function pageCount(planId: string) {
  return (await loadDoc(planId)).numPages;
}
