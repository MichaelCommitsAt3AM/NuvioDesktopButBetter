import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useFeatureSnapshot } from '../../bridge';
import './downloadNotifications.css';

const startedEvent = 'nuvio-download-started';
export function notifyDownloadStarted() {
  window.dispatchEvent(new Event(startedEvent));
}

type Download = { id: string; title: string; status: string; seasonNumber?: number | null; episodeNumber?: number | null };

/** App-level host: notifications remain visible when navigating between screens. */
export function DownloadNotifications() {
  const snapshot = useFeatureSnapshot<{ items: Download[] }>('downloads');
  const previous = useRef<Map<string, string> | null>(null);
  const [messages, setMessages] = useState<string[]>([]);

  useEffect(() => {
    const started = () => setMessages(current => [...current, 'Download has started']);
    window.addEventListener(startedEvent, started);
    return () => window.removeEventListener(startedEvent, started);
  }, []);

  useEffect(() => {
    if (!snapshot?.items) {
      previous.current = null;
      return;
    }
    const completed = snapshot.items.filter(item => item.status === 'completed'
      && previous.current?.has(item.id) && previous.current.get(item.id) !== 'completed');
    previous.current = new Map(snapshot.items.map(item => [item.id, item.status]));
    if (completed.length) setMessages(current => [...current, ...completed.map(item => {
      const episode = item.seasonNumber != null && item.episodeNumber != null
        ? ` · S${item.seasonNumber} E${item.episodeNumber}` : '';
      return `Download complete: ${item.title}${episode}`;
    })]);
  }, [snapshot]);

  useEffect(() => {
    if (!messages.length) return;
    const timer = window.setTimeout(() => setMessages(current => current.slice(1)), 3500);
    return () => window.clearTimeout(timer);
  }, [messages]);

  return createPortal(<div className="download-toast-host" role="status" aria-live="polite" aria-atomic="true">
    {messages[0] && <div className="download-toast">{messages[0]}</div>}
  </div>, document.body);
}
