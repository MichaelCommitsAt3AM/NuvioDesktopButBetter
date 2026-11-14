import type { ReactNode } from 'react';
import './resumeBadge.css';

/** Pill shown where playback will resume ("Resume from 0:03", "42 min left"). Shared by the streams and details screens. */
export function ResumeBadge({ children }: { children: ReactNode }) {
  return <span className="resume-badge">{children}</span>;
}
