import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Copy, ClipboardPaste, Folder, Menu, Pencil, Trash2 } from 'lucide-react';
import { FullscreenButton } from '../../components/FullscreenButton';
import { Link, useNavigate } from 'react-router-dom';
import { call, refreshFeature, useFeatureSnapshot } from '../../bridge';
import { Dialog } from '../../components/Dialog';
import { InlineError } from '../../components/Status';
import './collectionManagement.css';

type Collection = { id: string; title: string; pinToTop: boolean; folders: { id: string }[] };
type Validation = { valid: boolean; error?: string | null };
const message = (error: unknown) => error instanceof Error ? error.message : String(error);

/** CollectionManagementScreen.kt: standalone screen, repository-backed actions. */
export function CollectionsPage() {
  const snapshot = useFeatureSnapshot<{ items: Collection[] }>('collections');
  const items = snapshot?.items ?? [];
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [text, setText] = useState('');
  const [importError, setImportError] = useState('');
  const [copyError, setCopyError] = useState('');
  const [removing, setRemoving] = useState<Collection | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const drag = useRef<{ from: number; to: number; pointer: number; y: number; active: boolean } | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const locked = useRef(false);
  useEffect(() => { void refreshFeature('collections').catch(cause => setError(message(cause))); }, []);
  async function run(method: string, params: Record<string, unknown>) {
    if (locked.current) return false;
    locked.current = true; setBusy(true); setError('');
    try { await call(method, params); await refreshFeature('collections'); return true; }
    catch (cause) { setError(message(cause)); return false; }
    finally { locked.current = false; setBusy(false); }
  }
  const openEditor = (id: string | null) => navigate('/collections/' + (id ?? 'new') + '/edit');
  async function copy() {
    try {
      const result = await call<{ json: string }>('collections.export');
      await navigator.clipboard.writeText(result.json);
    } catch (cause) { setCopyError(message(cause)); }
  }
  const closeImport = () => { if (!locked.current) { setImporting(false); setText(''); setImportError(''); } };
  async function importCollections() {
    if (locked.current || !text.trim()) return;
    locked.current = true; setBusy(true); setImportError('');
    try {
      const validation = await call<Validation>('collections.validateImport', { json: text });
      if (!validation.valid) { setImportError(validation.error || 'Invalid JSON'); return; }
      await call('collections.import', { json: text, confirmed: true });
      await refreshFeature('collections');
      setImporting(false); setText('');
    } catch (cause) { setImportError(message(cause)); }
    finally { locked.current = false; setBusy(false); }
  }
  const move = (from: number, to: number) => { if (from !== to && to >= 0 && to < items.length) void run('collections.move', { from, to }); };
  return <div className="page collection-management-page">
    <header className="collection-management-header">
      <Link className="collection-icon-button" to="/settings/appearance" aria-label="Back"><ArrowLeft /></Link>
      <h1>Collections</h1>
      <FullscreenButton onError={setError} />
      <button className="collection-icon-button" aria-label="Copy JSON" title="Copy JSON" disabled={busy} onClick={() => void copy()}><Copy /></button>
      <button className="collection-icon-button" aria-label="Import" title="Import" disabled={busy} onClick={() => setImporting(true)}><ClipboardPaste /></button>
    </header>
    {error && <InlineError message={error} />}
    <section className="collection-management-surface collection-count">{items.length} collection(s), {items.reduce((count, item) => count + item.folders.length, 0)} folder(s)</section>
    <button className="collection-new-button" disabled={busy} onClick={() => openEditor(null)}>New Collection</button>
    {!!items.length && <><h2 className="collection-management-label">Your Collections</h2>
      <div className="collection-management-list" ref={list}>{items.map((item, index) => <article className={'collection-management-surface collection-management-item' + (dragging === index ? ' dragging' : '')} key={item.id}>
        <h3>{item.title}</h3><p>{item.folders.length} folder(s){item.pinToTop && ' · Pinned'}</p>
        <div className="collection-management-actions">
          <button className="collection-icon-button collection-drag-handle" aria-label={'Reorder ' + item.title} title="Reorder" disabled={busy}
            onKeyDown={event => { if (event.key === 'ArrowUp' || event.key === 'ArrowDown') { event.preventDefault(); move(index, index + (event.key === 'ArrowUp' ? -1 : 1)); } }}
            onPointerDown={event => { if (event.button !== 0) return; event.currentTarget.setPointerCapture(event.pointerId); drag.current = { from: index, to: index, pointer: event.pointerId, y: event.clientY, active: false }; }}
            onPointerMove={event => {
              const current = drag.current; if (!current || current.pointer !== event.pointerId) return;
              if (!current.active && Math.abs(event.clientY - current.y) < 4) return;
              current.active = true; setDragging(index);
              const rows = [...(list.current?.children ?? [])];
              const target = rows.findIndex(row => { const bounds = row.getBoundingClientRect(); return event.clientY < bounds.top + bounds.height / 2; });
              current.to = target < 0 ? items.length - 1 : target;
              rows.forEach((row, rowIndex) => row.classList.toggle('drop-target', rowIndex === current.to && rowIndex !== current.from));
              if (list.current) { const bounds = list.current.getBoundingClientRect(); if (event.clientY < bounds.top + 40) list.current.scrollTop -= 12; else if (event.clientY > bounds.bottom - 40) list.current.scrollTop += 12; }
            }}
            onPointerUp={event => { const current = drag.current; drag.current = null; setDragging(null); list.current?.querySelectorAll('.drop-target').forEach(row => row.classList.remove('drop-target')); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); if (current?.active) move(current.from, current.to); }}
            onPointerCancel={() => { drag.current = null; setDragging(null); list.current?.querySelectorAll('.drop-target').forEach(row => row.classList.remove('drop-target')); }}><Menu size={20} /></button>
          <span />
          <button className="collection-icon-button collection-edit" aria-label={'Edit ' + item.title} title="Edit" disabled={busy} onClick={() => openEditor(item.id)}><Pencil size={20} /></button>
          <button className="collection-icon-button collection-delete" aria-label={'Delete ' + item.title} title="Delete" disabled={busy} onClick={() => setRemoving(item)}><Trash2 size={20} /></button>
        </div>
      </article>)}</div></>}
    {!items.length && <section className="collection-management-surface collection-management-empty"><Folder size={40} /><h2>No collections yet</h2><p>Create one to organize your catalogs.</p></section>}
    {importing && <Dialog label="Import Collections" className="collection-management-dialog" onClose={closeImport}><h2>Import Collections</h2><p>Paste your collections JSON below.</p><textarea aria-label="JSON" placeholder="JSON" value={text} disabled={busy} aria-invalid={!!importError} aria-describedby={importError ? 'collection-import-error' : undefined} onChange={event => { setText(event.target.value); setImportError(''); }} />{importError && <p id="collection-import-error" role="alert" className="collection-import-error">{importError}</p>}<div className="dialog-actions"><button disabled={busy} onClick={closeImport}>Cancel</button><button className="primary" disabled={busy || !text.trim()} onClick={() => void importCollections()}>Import</button></div></Dialog>}
    {copyError && <Dialog label="Copy JSON" className="collection-management-dialog" onClose={() => setCopyError('')}><h2>Copy JSON</h2><p role="alert">The collection data is too large for the clipboard on this device.</p><div className="dialog-actions"><button className="primary" onClick={() => setCopyError('')}>OK</button></div></Dialog>}
    {removing && <Dialog label="Delete Collection" className="collection-management-dialog" onClose={() => { if (!busy) setRemoving(null); }}><h2>Delete Collection</h2><p>Delete &quot;{removing.title}&quot;? This cannot be undone.</p><div className="dialog-actions"><button disabled={busy} onClick={() => setRemoving(null)}>Cancel</button><button className="destructive" disabled={busy} onClick={() => void run('collections.remove', { id: removing.id }).then(ok => { if (ok) setRemoving(null); })}>Delete</button></div></Dialog>}
  </div>;
}
