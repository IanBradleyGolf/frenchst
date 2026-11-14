import { useState } from 'react';
import { CONTROLS, SYMBOL_KINDS } from '../library';
import { svgFor } from '../symbols';
import { useStore } from '../store';
import type { Component } from '../types';

const blank: Component = { code: '', name: '', category: 'Downlights', symbol: 'downlight', color: '#2563eb', control: 'DALI', supplier: '', supplyRate: 0, installRate: 0 };

export function ComponentDialog({ code, onClose }: { code: string | null; onClose: () => void }) {
  const data = useStore((s) => s.project!.data);
  const { mutate } = useStore.getState();
  const existing = code ? data.library.find((c) => c.code === code) : undefined;
  const [c, setC] = useState<Component>(existing ? { ...existing } : { ...blank });
  const [error, setError] = useState<string | null>(null);
  const used = existing ? data.floors.reduce((n, f) => n + f.items.filter((i) => i.code === existing.code).length, 0) : 0;
  const categories = [...new Set(data.library.map((x) => x.category))];

  const set = <K extends keyof Component>(k: K, v: Component[K]) => setC((x) => ({ ...x, [k]: v }));

  function save(e: React.FormEvent) {
    e.preventDefault();
    const codeT = c.code.trim().toUpperCase();
    if (!codeT) return setError('Code is required.');
    if (codeT !== existing?.code && data.library.some((x) => x.code === codeT)) return setError(`${codeT} already exists.`);
    const next = { ...c, code: codeT, name: c.name.trim() || codeT, category: c.category.trim() || 'Other' };
    mutate((d) => {
      if (existing) {
        const i = d.library.findIndex((x) => x.code === existing.code);
        d.library[i] = next;
        if (codeT !== existing.code) for (const f of d.floors) for (const it of f.items) if (it.code === existing.code) it.code = codeT;
      } else d.library.push(next);
    });
    onClose();
  }

  function remove() {
    if (!existing || used) return;
    mutate((d) => {
      d.library = d.library.filter((x) => x.code !== existing.code);
    });
    onClose();
  }

  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal" onSubmit={save} role="dialog" aria-label="Component">
        <h2>{existing ? `Edit ${existing.code}` : 'New component'}</h2>
        <div className="form-grid">
          <label htmlFor="cd-code">Code</label>
          <input id="cd-code" value={c.code} onChange={(e) => set('code', e.target.value)} placeholder="e.g. DL8" />
          <label htmlFor="cd-name">Name</label>
          <input id="cd-name" value={c.name} onChange={(e) => set('name', e.target.value)} />
          <label htmlFor="cd-cat">Category</label>
          <input id="cd-cat" list="cd-cats" value={c.category} onChange={(e) => set('category', e.target.value)} />
          <datalist id="cd-cats">{categories.map((x) => <option key={x} value={x} />)}</datalist>
          <label htmlFor="cd-sym">Symbol</label>
          <div className="row gap">
            <select id="cd-sym" value={c.symbol} onChange={(e) => set('symbol', e.target.value as Component['symbol'])}>
              {SYMBOL_KINDS.map((s) => <option key={s}>{s}</option>)}
            </select>
            <input type="color" value={c.color} onChange={(e) => set('color', e.target.value)} aria-label="Colour" />
            <span className="sym-preview" dangerouslySetInnerHTML={{ __html: svgFor(c.symbol, c.color, 30) }} />
          </div>
          <label htmlFor="cd-ctl">Control</label>
          <select id="cd-ctl" value={c.control} onChange={(e) => set('control', e.target.value as Component['control'])}>
            {CONTROLS.map((s) => <option key={s}>{s}</option>)}
          </select>
          <label htmlFor="cd-sup">Supplier</label>
          <input id="cd-sup" value={c.supplier} onChange={(e) => set('supplier', e.target.value)} />
          <label htmlFor="cd-sr">Supply $ (ex GST)</label>
          <input id="cd-sr" type="number" step="0.01" min="0" value={c.supplyRate} onChange={(e) => set('supplyRate', Number(e.target.value))} />
          <label htmlFor="cd-ir">Install $ (ex GST)</label>
          <input id="cd-ir" type="number" step="0.01" min="0" value={c.installRate} onChange={(e) => set('installRate', Number(e.target.value))} />
          <label htmlFor="cd-notes">Notes</label>
          <textarea id="cd-notes" rows={2} value={c.notes ?? ''} onChange={(e) => set('notes', e.target.value)} />
        </div>
        {error && <p className="error">{error}</p>}
        <div className="row gap end">
          {existing && (
            <button type="button" className="danger" disabled={used > 0} onClick={remove} title={used ? `Used ${used} times — remove those first` : 'Delete component'}>
              Delete{used ? ` (used ${used}×)` : ''}
            </button>
          )}
          <span style={{ flex: 1 }} />
          <button type="button" onClick={onClose}>Cancel</button>
          <button className="primary">Save</button>
        </div>
      </form>
    </div>
  );
}
