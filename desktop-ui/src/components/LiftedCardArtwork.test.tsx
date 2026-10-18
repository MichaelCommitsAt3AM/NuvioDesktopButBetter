import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { LiftedCardArtwork } from './LiftedCardArtwork';

afterEach(() => { cleanup(); document.body.innerHTML = ''; vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('scales the original card layout and typography together without a separate popup font size', () => {
  const source = document.createElement('button');
  source.dataset.sourceKey = 'cw:movie';
  source.style.visibility = 'hidden';
  source.innerHTML = '<strong style="font-size:15px">Title</strong><small style="font-size:10.8px">Episode</small>';
  document.body.appendChild(source);
  Object.defineProperties(source, { offsetWidth: { value: 300 }, offsetHeight: { value: 170 } });
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(600);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(340);
  const disconnect = vi.fn();
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect = disconnect; });
  const view = render(<LiftedCardArtwork sourceKey="cw:movie" fallback={<div>Fallback</div>}/>);
  const host = view.container.querySelector('.lifted-card-artwork')!;
  const clone = host.lastElementChild as HTMLElement;
  expect(clone.style.transform).toBe('scale(2, 2)');
  expect(clone.style.width).toBe('300px');
  expect(clone.querySelector('strong')!.style.fontSize).toBe('15px');
  expect(clone.querySelector('small')!.style.fontSize).toBe('10.8px');
  expect(clone.style.visibility).toBe('visible');
  expect(clone.hasAttribute('data-source-key')).toBe(false);
  expect(host.firstElementChild).toHaveAttribute('hidden');
  view.unmount();
  expect(disconnect).toHaveBeenCalledOnce();
});
