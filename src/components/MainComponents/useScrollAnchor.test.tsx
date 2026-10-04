import React, { useRef } from 'react';
import { act, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useScrollAnchor } from './useScrollAnchor';

// jsdom has no layout: rows are 50px tall, stacked in DOM order.
function Harness({ list, stuck }: { list: string[]; stuck: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const flowRef = useRef<HTMLDivElement>(null);
  useScrollAnchor({ containerRef, flowRef, rows: list, isStuckToBottom: () => stuck });
  return (
    <div ref={containerRef} data-testid="sc">
      <div ref={flowRef}>
        {list.map((id) => (
          <div key={id} data-message-id={id} />
        ))}
      </div>
    </div>
  );
}

const patchRects = () => {
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get: () => 300,
  });
  Element.prototype.getBoundingClientRect = function () {
    const el = this as HTMLElement;
    const id = el.getAttribute?.('data-message-id');
    const scroller = el.closest?.('[data-testid="sc"]') as HTMLElement | null;
    const scrollTop = scroller?.scrollTop ?? 0;
    let top = 0;
    let h = 300;
    if (id && scroller) {
      const all = Array.from(scroller.querySelectorAll('[data-message-id]'));
      top = all.indexOf(el) * 50 - scrollTop;
      h = 50;
    }
    return { top, bottom: top + h, left: 0, right: 0, width: 0, height: h, x: 0, y: top, toJSON() {} } as DOMRect;
  };
};

describe('useScrollAnchor', () => {
  it('restores the anchor row offset in the layout effect after rows are prepended', () => {
    patchRects();
    const { getByTestId, rerender } = render(<Harness list={['b', 'c', 'd']} stuck={false} />);
    const sc = getByTestId('sc');
    sc.scrollTop = 50;
    // two rows prepended: b and c move down by 100px in layout
    act(() => rerender(<Harness list={['a1', 'a2', 'b', 'c', 'd']} stuck={false} />));
    expect(sc.scrollTop).toBe(150);
  });

  it('does nothing while stuck to the bottom', () => {
    patchRects();
    const { getByTestId, rerender } = render(<Harness list={['b']} stuck={true} />);
    const sc = getByTestId('sc');
    sc.scrollTop = 50;
    act(() => rerender(<Harness list={['a', 'b']} stuck={true} />));
    expect(sc.scrollTop).toBe(50);
  });
});
