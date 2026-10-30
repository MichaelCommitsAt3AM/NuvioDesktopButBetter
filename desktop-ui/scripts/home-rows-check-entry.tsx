import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { HomeRow } from '../src/features/home/HomeRow';
import { HorizontalRail } from '../src/components/HorizontalRail';

const count = 30;
export function mount(optimized: boolean) {
  const host = document.getElementById('root')!;
  const root = createRoot(host);
  flushSync(() => root.render(<main className="main-area" style={{ height: '100vh', overflow: 'auto' }}>
    <div className="home-page">{Array.from({ length: count }, (_, row) => {
      const content = <section className="shelf" data-row={row} style={{ height: 406, marginBottom: 24 }}>
        <h2>Row {row}</h2><HorizontalRail label={`Row ${row}`}>
          {Array.from({ length: 24 }, (_, card) => <button key={card} className="fixture-card" style={{ flex: 'none', width: 180, height: 290 }}>
            <span>Artwork {card}</span><strong>Title {row}:{card}</strong><small>2026</small>
          </button>)}
        </HorizontalRail>
      </section>;
      return optimized ? <HomeRow key={row} estimatedHeight={430}>{content}</HomeRow> : <div key={row}>{content}</div>;
    })}</div>
  </main>));
  return count;
}
