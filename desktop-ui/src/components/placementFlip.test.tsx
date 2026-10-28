import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { useRef } from 'react';
import { usePlacementFlip } from './placementFlip';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function Rail({ order = ['a', 'b'], update = 0, composeSpring = false }: { order?: string[]; update?: number; composeSpring?: boolean }) {
  const track = useRef<HTMLDivElement>(null);
  usePlacementFlip(track, composeSpring);
  return <div ref={track} data-update={update}>{order.map(key => <article key={key} data-flip-key={key} />)}</div>;
}

function setup() {
  let scroll = 0;
  let hidden = false;
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockImplementation(() => hidden ? [] as unknown as DOMRectList : [{ width: 400, height: 100 }] as unknown as DOMRectList);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    return { left: this.offsetLeft - scroll, top: this.offsetTop - scroll, width: 400, height: 100 } as DOMRect;
  });
  vi.spyOn(HTMLElement.prototype, 'offsetLeft', 'get').mockImplementation(function (this: HTMLElement) {
    return this.hasAttribute('data-flip-key') ? [...this.parentElement!.children].indexOf(this) * 100 : 0;
  });
  vi.spyOn(HTMLElement.prototype, 'offsetTop', 'get').mockReturnValue(0);
  const animate = vi.fn((_frames: Keyframe[] | PropertyIndexedKeyframes | null, _options?: number | KeyframeAnimationOptions) => ({ cancel: vi.fn(), finished: new Promise<void>(() => {}) }) as unknown as Animation);
  const original = HTMLElement.prototype.animate;
  HTMLElement.prototype.animate = animate;
  return { animate, scroll: (value: number) => { scroll = value; }, hide: (value: boolean) => { hidden = value; }, restore: () => { HTMLElement.prototype.animate = original; } };
}

it('does not move cards on a Home update after page or horizontal scrolling', () => {
  const fixture = setup();
  try {
    const view = render(<Rail />);
    fixture.scroll(280);
    view.rerender(<Rail update={1} />);
    expect(fixture.animate).not.toHaveBeenCalled();
    fixture.scroll(620);
    view.rerender(<Rail update={2} />);
    expect(fixture.animate).not.toHaveBeenCalled();
  } finally { fixture.restore(); }
});

it('still animates actual reordering and cancels running animations on unmount', () => {
  const fixture = setup();
  try {
    const view = render(<Rail />);
    fixture.scroll(280);
    view.rerender(<Rail order={['b', 'a']} />);
    expect(fixture.animate).toHaveBeenCalledTimes(2);
    expect(fixture.animate.mock.calls[0][0]).toEqual([{ transform: 'translate(100px, 0px)' }, { transform: 'translate(0px, 0px)' }]);
    view.unmount();
    for (const result of fixture.animate.mock.results) expect(result.value.cancel).toHaveBeenCalled();
  } finally { fixture.restore(); }
});

it('does not animate stale positions when the cached Home screen becomes visible again', () => {
  const fixture = setup();
  try {
    const view = render(<Rail />);
    fixture.hide(true);
    view.rerender(<Rail update={1} />);
    fixture.hide(false);
    view.rerender(<Rail order={['b', 'a']} update={2} />);
    expect(fixture.animate).not.toHaveBeenCalled();
  } finally { fixture.restore(); }
});

it('settles Continue Watching neighbors with the Compose placement spring', () => {
  const fixture = setup();
  try {
    const view = render(<Rail composeSpring />);
    view.rerender(<Rail composeSpring order={['b']} />);
    expect(fixture.animate).toHaveBeenCalledOnce();
    const [frames, options] = fixture.animate.mock.calls[0];
    expect((frames as Keyframe[]).length).toBeGreaterThan(10);
    expect(options).toMatchObject({ easing: 'linear' });
    expect((frames as Keyframe[])[0]).toEqual({ transform: 'translate(100px, 0px)' });
    expect((frames as Keyframe[]).at(-1)).toEqual({ transform: 'translate(0px, 0px)' });
  } finally { fixture.restore(); }
});
