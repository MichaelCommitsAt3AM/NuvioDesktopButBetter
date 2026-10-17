import { useId, type ReactNode } from 'react';
import { InlineNotice } from './Status';
import { ReadOnlyReasonContext } from './readOnlyContext';
import './readOnlyBoundary.css';

/** Disable editing while leaving links available for browsing and returning. */
export function ReadOnlyBoundary({ readOnly, reason, children }: { readOnly: boolean; reason: string; children: ReactNode }) {
  const noticeId = useId();
  return <ReadOnlyReasonContext.Provider value={readOnly ? reason : null}>
    {readOnly && <InlineNotice id={noticeId} message={reason} />}
    <fieldset className={`read-only-boundary${readOnly ? ' is-read-only' : ''}`} disabled={readOnly} aria-describedby={readOnly ? noticeId : undefined}
      onClickCapture={event => {
        if (readOnly && (event.target as Element).closest('button,input,select,textarea,[role="switch"],[role="slider"]')) { event.preventDefault(); event.stopPropagation(); }
      }}
      onChangeCapture={event => { if (readOnly) { event.preventDefault(); event.stopPropagation(); } }}
      onDragStartCapture={event => { if (readOnly) { event.preventDefault(); event.stopPropagation(); } }}>
      {children}
    </fieldset>
  </ReadOnlyReasonContext.Provider>;
}
