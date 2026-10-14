import { useId } from 'react';

export type ContinueWatchingStyle = 'card' | 'wide' | 'poster';

// Dimensions and color opacities mirror HomeContinueWatchingSection.kt.
export function ContinueWatchingStylePreview({ style }: { style: ContinueWatchingStyle }) {
  const id = useId();
  const progress = (x: number, y: number, width: number, height: number, fraction: number, track: string) => <>
    <rect x={x} y={y} width={width} height={height} rx={height / 2} fill={track} />
    <rect x={x} y={y} width={width * fraction} height={height} rx={height / 2} fill="var(--app-accent)" />
  </>;
  return <span className="continue-style-preview-slot" aria-hidden="true"><span className={`continue-style-preview ${style}`}>
    {style === 'card' && <svg width="100" height="56" viewBox="0 0 100 56">
      <defs>
        <clipPath id={`${id}-clip`}><rect width="100" height="56" rx="6" /></clipPath>
        <linearGradient id={`${id}-shade`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--app-bg)" stopOpacity="0" />
          <stop offset=".6" stopColor="var(--app-bg)" stopOpacity=".45" />
          <stop offset="1" stopColor="var(--app-bg)" stopOpacity=".9" />
        </linearGradient>
      </defs>
      <g clipPath={`url(#${id}-clip)`}>
        <rect width="100" height="56" fill="#49454f" fillOpacity=".65" />
        <rect width="100" height="56" fill={`url(#${id}-shade)`} />
        <rect x="69" y="5" width="26" height="9" rx="2" fill="var(--app-bg)" fillOpacity=".8" />
        <rect x="7" y="34" width="28" height="5" rx="2" fill="white" fillOpacity=".55" />
        <rect x="7" y="42" width="58" height="7" rx="2" fill="white" fillOpacity=".75" />
        {progress(5, 50, 90, 3, .55, '#0000004d')}
      </g>
    </svg>}
    {style === 'wide' && <svg width="100" height="60" viewBox="0 0 100 60">
      <defs><clipPath id={`${id}-clip`}><rect width="100" height="60" rx="6" /></clipPath></defs>
      <g clipPath={`url(#${id}-clip)`}>
        <rect width="100" height="60" fill="var(--app-surface)" fillOpacity=".8" />
        <rect width="40" height="60" fill="#49454f" fillOpacity=".65" />
        <rect x="44" y="4" width="36.4" height="8" rx="2" fill="var(--text)" fillOpacity=".2" />
        <rect x="44" y="29" width="26" height="6" rx="2" fill="var(--text)" fillOpacity=".14" />
        {progress(44, 52, 52, 4, .6, '#d0bcff29')}
      </g>
    </svg>}
    {style === 'poster' && <svg width="60" height="112" viewBox="0 0 60 112">
      <rect width="60" height="90" rx="8" fill="#49454f" fillOpacity=".65" />
      <rect x="6" y="72" width="48" height="12" rx="6" fill="var(--settings-surface,var(--app-surface))" />
      {progress(10, 76, 40, 4, .45, '#d0bcff29')}
      <rect x="0" y="96" width="32.3" height="7" rx="2" fill="var(--text)" fillOpacity=".18" />
      <rect x="0" y="106" width="20.9" height="6" rx="2" fill="var(--text)" fillOpacity=".12" />
      <rect x="44" y="97" width="16" height="7" rx="2" fill="var(--text)" fillOpacity=".16" />
    </svg>}
  </span></span>;
}

export function ContinueWatchingStyleCheck() {
  return <span className="continue-style-check" aria-hidden="true"><svg width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm-2 15-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9Z" /></svg></span>;
}
