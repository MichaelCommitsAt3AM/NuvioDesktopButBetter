/** Kotlin ControllerHintToolbar: bottom-right dark-glass pill listing what each button does here. */
import type { ReactElement } from 'react';
import type { PadLayout } from './gamepadInput';

export type HintGlyph = 'B' | 'X' | 'Y' | 'LB/RB' | 'Menu';
export type Hint = { glyph: HintGlyph; label: string };
export type FocusKind = 'content' | 'navigation' | 'text' | 'adjust';

const isDetails = (path: string) => /^\/(details\/[^/]+\/[^/]+|person\/[^/]+|entity\/[^/]+\/[^/]+)$/.test(path);
const isStreams = (path: string) => /^\/details\/[^/]+\/[^/]+\/streams\/[^/]+$/.test(path);

/** Kotlin buildContextHints, keyed by route instead of a registered screen context. */
export function hintsFor(pathname: string, dialog: boolean, focus: FocusKind = 'content'): Hint[] {
  if (focus === 'adjust') return [{ glyph: 'B', label: 'Done' }];
  if (dialog) return [{ glyph: 'B', label: 'Close' }];
  if (focus === 'text') return [{ glyph: 'B', label: 'Close Keyboard' }];
  if (focus === 'navigation') return [{ glyph: 'LB/RB', label: 'Tabs' }, { glyph: 'B', label: 'Content' }];
  if (pathname === '/') return [{ glyph: 'X', label: 'Options' }, { glyph: 'Y', label: 'Search' }, { glyph: 'LB/RB', label: 'Tabs' }, { glyph: 'Menu', label: 'Navigation' }];
  if (pathname === '/search') return [{ glyph: 'Y', label: 'Focus Search' }, { glyph: 'LB/RB', label: 'Tabs' }, { glyph: 'Menu', label: 'Navigation' }, { glyph: 'B', label: 'Back' }];
  if (pathname === '/library') return [{ glyph: 'X', label: 'Options' }, { glyph: 'Y', label: 'Search' }, { glyph: 'LB/RB', label: 'Tabs' }, { glyph: 'Menu', label: 'Navigation' }];
  if (pathname === '/settings' || pathname.startsWith('/settings/')) return [{ glyph: 'LB/RB', label: 'Tabs' }, { glyph: 'Menu', label: 'Navigation' }, { glyph: 'B', label: pathname === '/settings' ? 'Menu' : 'Back' }];
  if (isStreams(pathname)) return [{ glyph: 'LB/RB', label: 'Addon Filter' }, { glyph: 'B', label: 'Back' }];
  if (isDetails(pathname)) return [{ glyph: 'X', label: 'Options' }, { glyph: 'LB/RB', label: 'Season' }, { glyph: 'B', label: 'Back' }];
  return [{ glyph: 'Menu', label: 'Navigation' }, { glyph: 'B', label: 'Back' }];
}

/** PlayStation face-button shapes for the Xbox positions (B = Circle, X = Square, Y = Triangle). */
const PLAYSTATION_SHAPES: Partial<Record<HintGlyph, { name: string; path: ReactElement }>> = {
  B: { name: 'circle', path: <circle cx="6" cy="6" r="3.6" fill="none" stroke="currentColor" strokeWidth="1.5" /> },
  X: { name: 'square', path: <rect x="2.6" y="2.6" width="6.8" height="6.8" fill="none" stroke="currentColor" strokeWidth="1.5" /> },
  Y: { name: 'triangle', path: <path d="M6 2.3 10 9.3H2Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /> },
};

const MENU_LINES = <svg viewBox="0 0 12 12" width="10" height="10"><path d="M2 3h8M2 6h8M2 9h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>;

function Glyph({ glyph, layout }: { glyph: HintGlyph; layout: PadLayout }) {
  const playstation = layout === 'playstation';
  if (glyph === 'LB/RB') {
    const [left, right] = playstation ? ['L1', 'R1'] : ['LB', 'RB'];
    return <span className="controller-glyph-pair" aria-hidden="true"><span className="controller-glyph-bumper">{left}</span><span className="controller-glyph-bumper">{right}</span></span>;
  }
  // PlayStation "Options" sits where Xbox "Menu" is and carries the same three-line icon.
  if (glyph === 'Menu') return <span className={`controller-glyph controller-glyph-menu${playstation ? ' controller-glyph-options' : ''}`} aria-hidden="true">{MENU_LINES}</span>;
  const shape = playstation ? PLAYSTATION_SHAPES[glyph] : undefined;
  if (shape) return <span className={`controller-glyph controller-glyph-ps-${shape.name}`} aria-hidden="true"><svg viewBox="0 0 12 12" width="12" height="12">{shape.path}</svg></span>;
  return <span className={`controller-glyph controller-glyph-${glyph.toLowerCase()}`} aria-hidden="true">{glyph}</span>;
}

export function ControllerHintToolbar({ hints, layout = 'xbox' }: { hints: Hint[]; layout?: PadLayout }) {
  if (!hints.length) return null;
  return <div className="controller-hint-toolbar" role="status" aria-label="Controller buttons" data-layout={layout}>
    {hints.map((hint, index) => <span className="controller-hint" key={`${hint.glyph}-${hint.label}`}>
      {index > 0 && <span className="controller-hint-divider" aria-hidden="true" />}
      <Glyph glyph={hint.glyph} layout={layout} /><span>{hint.label}</span>
    </span>)}
  </div>;
}
