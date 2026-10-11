import type { ReactNode } from 'react';

export function EmptyState({ title, message, icon, action }: { title: string; message: string; icon: ReactNode; action?: ReactNode }) {
  return <div className="empty-state"><span className="empty-icon">{icon}</span><h2>{title}</h2><p>{message}</p>{action}</div>;
}
