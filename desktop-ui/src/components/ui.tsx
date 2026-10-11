import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useVirtualizer as useTanstackVirtual } from '@tanstack/react-virtual';
import { CircleUserRound } from 'lucide-react';
import type { Media, Profile } from '../generated/contract';
import { useFeatureSnapshot } from '../bridge';
import type { AppearanceSnapshot } from '../features/settings/appearanceStore';
import type { ProfilesSnapshot } from '../features/profiles/profileStore';
import { Poster } from './Poster';

export function Avatar({ profile, size = 'md' }: { profile?: Profile; size?: 'sm' | 'md' | 'lg' }) {
  const profiles = useFeatureSnapshot<ProfilesSnapshot>('profiles');
  const record = profiles?.items.find(item => item.id === profile?.id);
  const avatarUrl = record?.avatarUrl || profiles?.avatars.find(item => item.id === record?.avatarId)?.url || profile?.avatarUrl;
  if (avatarUrl) return <img className={`avatar ${size}`} src={avatarUrl} alt="" />;
  return <span className={`avatar placeholder ${size}`} style={{ background: profile?.color ?? '#32343a' }}>{profile ? profile.name.slice(0, 1).toUpperCase() : <CircleUserRound size={size === 'sm' ? 15 : 19} />}</span>;
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return <div className="page-heading"><div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>{action}</div>;
}

export function MediaGrid({ items }: { items: Media[] }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const appearance = useFeatureSnapshot<AppearanceSnapshot>('appearance');
  const [width, setWidth] = useState(window.innerWidth);
  useEffect(() => { const element = parentRef.current; if (!element) return; const observer = new ResizeObserver(entries => setWidth(entries[0].contentRect.width)); observer.observe(element); return () => observer.disconnect(); }, []);
  const scale = Math.max(1,Math.min(1.18,Math.min(window.innerWidth/1280,window.innerHeight/820)));
  const cardWidth = (appearance?.cardStyle.widthDp ?? 126)*1.4*scale*(appearance?.cardStyle.catalogLandscapeModeEnabled ? 1.6 : 1);
  const columns = Math.max(1,Math.floor((width+20)/(cardWidth+20)));
  const actualCardWidth = Math.max(1,(width - (columns-1)*20*scale - 4*scale)/columns);
  const rowHeight = actualCardWidth*(appearance?.cardStyle.catalogLandscapeModeEnabled ? 9/16 : (appearance?.cardStyle.heightDp ?? 189)/(appearance?.cardStyle.widthDp ?? 126)) + (appearance?.cardStyle.hideLabelsEnabled ? 24 : 80)*scale;
  const rowCount = Math.ceil(items.length / columns);
  const virtualizer = useTanstackVirtual({ count: rowCount, getScrollElement: () => parentRef.current, estimateSize: () => rowHeight, overscan: 2 });
  useEffect(() => { virtualizer.measure(); }, [columns,rowHeight]);
  return <div className="virtual-grid-wrap" ref={parentRef} style={{ height: Math.max(280, Math.min(rowCount * rowHeight, window.innerHeight*.8)) }}><div className="virtual-grid" style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>{virtualizer.getVirtualItems().map((row) => <div className="grid-row" key={row.key} style={{ position: 'absolute', top: 0, transform: `translateY(${row.start}px)`,gridTemplateColumns:`repeat(${columns},minmax(0,1fr))` }}>{items.slice(row.index * columns, (row.index + 1) * columns).map((item) => <Poster key={`${item.type}-${item.id}`} item={item} />)}</div>)}</div></div>;
}


