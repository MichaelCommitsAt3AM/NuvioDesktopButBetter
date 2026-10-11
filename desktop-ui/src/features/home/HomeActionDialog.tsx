import type { ReactNode } from 'react';
import { Dialog } from '../../components/Dialog';

export function HomeActionDialog({title,poster,subtitle,onClose,children,artwork}:{title:string;poster?:string|null;subtitle?:string;onClose:()=>void;children:ReactNode;artwork?:ReactNode}) {
  return <Dialog label={`Actions for ${title}`} className={`home-actions-dialog ${artwork?'home-cw-actions-dialog':''}`}  onClose={onClose}>
    {artwork}{!artwork && poster && <img className="home-actions-poster" src={poster} alt=""/>}
    <h2>{title}</h2>{subtitle && <p>{subtitle}</p>}
    <div className="home-actions-options">{children}</div>
  </Dialog>;
}
