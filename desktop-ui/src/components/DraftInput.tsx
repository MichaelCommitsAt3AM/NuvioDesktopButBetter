import { createContext, useContext, useEffect, useRef, useState, type InputHTMLAttributes, type ReactNode } from 'react';

type DraftHandle = { flush: () => Promise<void>; cancel: () => void };
export class DraftController {
  private handles = new Set<DraftHandle>();
  register(handle: DraftHandle) { this.handles.add(handle); return () => { this.handles.delete(handle); }; }
  async flush() { for (const handle of this.handles) await handle.flush(); }
  cancel() { for (const handle of this.handles) handle.cancel(); }
}
const DraftContext = createContext<DraftController | null>(null);
export function DraftScope({ children }: { children: ReactNode }) {
  const [controller] = useState(() => new DraftController());
  return <DraftContext value={controller}>{children}</DraftContext>;
}
export function useDraftController() { return useContext(DraftContext); }

type DraftInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'defaultValue' | 'onChange'> & {
  value: string;
  onCommit: (value: string) => void | Promise<void>;
  commitDelay?: number;
};

/** Local typing with serialized, awaitable commits. Failed text remains available for retry. */
export function DraftInput({ value, onCommit, commitDelay = 500, onBlur, onKeyDown, ...rest }: DraftInputProps) {
  const controller = useDraftController();
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState('');
  const latest = useRef(value);
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;
  const timer = useRef<number | null>(null);
  const focused = useRef(false);
  const dirty = useRef(false);
  const composing = useRef(false);
  const active = useRef(true);
  const inFlight = useRef<Promise<void> | null>(null);
  const clearTimer = () => { if (timer.current !== null) window.clearTimeout(timer.current); timer.current = null; };
  const cancel = () => { clearTimer(); dirty.current = false; };
  const flush = async (): Promise<void> => {
    clearTimer();
    if (inFlight.current) { await inFlight.current; return flush(); }
    if (!active.current || !dirty.current) return;
    if (composing.current) throw new Error('Finish entering text before saving.');
    const submitted = latest.current;
    dirty.current = false;
    const commit = commitRef.current;
    const flight = (async () => { await commit(submitted); })();
    inFlight.current = flight;
    try {
      await flight;
      if (active.current) setError('');
    } catch (cause) {
      if (active.current) { dirty.current = true; setError(cause instanceof Error ? cause.message : 'Could not save this field.'); }
      throw cause;
    } finally { inFlight.current = null; }
    if (active.current && dirty.current) await flush();
  };
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(() => {
    active.current = true;
    const unregister = controller?.register({ flush: () => flushRef.current(), cancel });
    return () => {
      unregister?.();
      clearTimer();
      // Explicit saves flush scoped editors; navigation discards their pending drafts.
      if (!controller) void flushRef.current().catch(() => {});
      active.current = false;
    };
  }, [controller]);
  useEffect(() => {
    if (!focused.current && !dirty.current && !inFlight.current) { latest.current = value; setDraft(value); }
  }, [value]);
  const schedule = () => {
    clearTimer();
    timer.current = window.setTimeout(() => { void flushRef.current().catch(() => {}); }, commitDelay);
  };
  return <><input {...rest} value={draft} aria-invalid={error ? true : rest['aria-invalid']}
    onCompositionStart={() => { composing.current = true; clearTimer(); }}
    onCompositionEnd={() => { composing.current = false; if (dirty.current) schedule(); }}
    onChange={(event) => { latest.current = event.target.value; dirty.current = true; setDraft(latest.current); if (!composing.current) schedule(); }}
    onFocus={() => { focused.current = true; }}
    onBlur={(event) => { focused.current = false; void flushRef.current().catch(() => {}); onBlur?.(event); }}
    onKeyDown={(event) => { if (event.key === 'Enter' && !composing.current) void flushRef.current().catch(() => {}); onKeyDown?.(event); }}
  />{error && <span className="form-error" role="alert">{error}</span>}</>;
}
