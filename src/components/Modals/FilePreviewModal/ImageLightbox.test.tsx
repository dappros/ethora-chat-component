import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import ImageLightbox, {
  DOUBLE_TAP_SCALE,
  ImageLightboxHandle,
  MAX_SCALE,
} from './ImageLightbox';

const VIEWPORT = { width: 800, height: 600 };
const NATURAL = { width: 1600, height: 1200 };

/**
 * JSDOM reports 0 for every box and for naturalWidth/Height, which would make
 * the clamp collapse to "no panning allowed" and hide every bug in it. Give
 * the viewer a real 800x600 viewport showing a 1600x1200 picture: fitted it
 * exactly fills the viewport, so at scale 2 the legal pan range is +/-400 x
 * and +/-300 y.
 */
const setGeometry = () => {
  const viewport = screen.getByTestId('image-lightbox-viewport');
  const image = screen.getByTestId('image-lightbox-image');

  Object.defineProperty(viewport, 'clientWidth', {
    value: VIEWPORT.width,
    configurable: true,
  });
  Object.defineProperty(viewport, 'clientHeight', {
    value: VIEWPORT.height,
    configurable: true,
  });
  viewport.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      width: VIEWPORT.width,
      height: VIEWPORT.height,
      right: VIEWPORT.width,
      bottom: VIEWPORT.height,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
  Object.defineProperty(image, 'naturalWidth', {
    value: NATURAL.width,
    configurable: true,
  });
  Object.defineProperty(image, 'naturalHeight', {
    value: NATURAL.height,
    configurable: true,
  });

  return { viewport, image };
};

const transformOf = (element: HTMLElement) => element.style.transform;

const scaleOf = (element: HTMLElement): number =>
  Number(/scale\(([\d.]+)\)/.exec(transformOf(element))?.[1] ?? '0');

const offsetOf = (element: HTMLElement): { x: number; y: number } => {
  const match = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(
    transformOf(element)
  );
  return { x: Number(match?.[1] ?? 0), y: Number(match?.[2] ?? 0) };
};

const renderLightbox = (props: Partial<React.ComponentProps<typeof ImageLightbox>> = {}) => {
  const ref = React.createRef<ImageLightboxHandle>();
  const result = render(
    <ImageLightbox
      ref={ref}
      src="https://files.example.com/one.png"
      alt="one.png"
      {...props}
    />
  );
  const geometry = setGeometry();
  return { ...result, ...geometry, ref };
};

describe('ImageLightbox', () => {
  it('starts fitted with no offset', () => {
    const { image } = renderLightbox();
    expect(scaleOf(image)).toBe(1);
    expect(offsetOf(image)).toEqual({ x: 0, y: 0 });
  });

  it('zooms on wheel and swallows the event so the page behind does not scroll', () => {
    const { viewport, image } = renderLightbox();

    // fireEvent returns false when the handler called preventDefault, which
    // is what keeps the host page from scrolling under the viewer.
    const notPrevented = fireEvent.wheel(viewport, {
      deltaY: -240,
      clientX: 400,
      clientY: 300,
    });

    expect(scaleOf(image)).toBeGreaterThan(1);
    expect(notPrevented).toBe(false);
  });

  it('never zooms past the bounds in either direction', () => {
    const { viewport, image } = renderLightbox();

    for (let i = 0; i < 30; i += 1) {
      fireEvent.wheel(viewport, { deltaY: -400, clientX: 400, clientY: 300 });
    }
    expect(scaleOf(image)).toBe(MAX_SCALE);

    for (let i = 0; i < 60; i += 1) {
      fireEvent.wheel(viewport, { deltaY: 400, clientX: 400, clientY: 300 });
    }
    expect(scaleOf(image)).toBe(1);
    expect(offsetOf(image)).toEqual({ x: 0, y: 0 });
  });

  it('double-click toggles between fit and zoom', () => {
    const { viewport, image } = renderLightbox();

    fireEvent.doubleClick(viewport, { clientX: 400, clientY: 300 });
    expect(scaleOf(image)).toBe(DOUBLE_TAP_SCALE);

    fireEvent.doubleClick(viewport, { clientX: 400, clientY: 300 });
    expect(scaleOf(image)).toBe(1);
  });

  it('drag pans when zoomed in and clamps the image inside the viewport', () => {
    const { viewport, image } = renderLightbox();
    fireEvent.doubleClick(viewport, { clientX: 400, clientY: 300 });

    fireEvent.mouseDown(viewport, { button: 0, clientX: 400, clientY: 300 });
    fireEvent.mouseMove(window, { clientX: 460, clientY: 340 });
    fireEvent.mouseUp(window);

    expect(offsetOf(image)).toEqual({ x: 60, y: 40 });

    // Way past the edge: the picture stops at its own boundary rather than
    // sliding out of the viewport. At 2.5x that is (1600*2.5-800)/2 = 1600.
    fireEvent.mouseDown(viewport, { button: 0, clientX: 0, clientY: 0 });
    fireEvent.mouseMove(window, { clientX: 100000, clientY: 100000 });
    fireEvent.mouseUp(window);

    const limit = (NATURAL.width * 0.5 * DOUBLE_TAP_SCALE - VIEWPORT.width) / 2;
    expect(offsetOf(image).x).toBe(limit);
  });

  it('does not pan while fitted', () => {
    const { viewport, image } = renderLightbox();

    fireEvent.mouseDown(viewport, { button: 0, clientX: 400, clientY: 300 });
    fireEvent.mouseMove(window, { clientX: 600, clientY: 500 });
    fireEvent.mouseUp(window);

    expect(offsetOf(image)).toEqual({ x: 0, y: 0 });
  });

  it('exposes zoom in, zoom out and reset', () => {
    const { image, ref } = renderLightbox();

    act(() => ref.current?.zoomIn());
    expect(scaleOf(image)).toBeCloseTo(1.5, 5);

    act(() => ref.current?.zoomOut());
    expect(scaleOf(image)).toBeCloseTo(1, 5);

    act(() => ref.current?.zoomIn());
    act(() => ref.current?.zoomIn());
    act(() => ref.current?.reset());
    expect(scaleOf(image)).toBe(1);
    expect(offsetOf(image)).toEqual({ x: 0, y: 0 });
  });

  it('reports the scale so the chrome can enable and disable its controls', () => {
    const onScaleChange = vi.fn();
    const { viewport } = renderLightbox({ onScaleChange });

    onScaleChange.mockClear();
    fireEvent.doubleClick(viewport, { clientX: 400, clientY: 300 });

    expect(onScaleChange).toHaveBeenCalledWith(DOUBLE_TAP_SCALE);
  });

  it('returns to the fitted view when the file changes', () => {
    const { viewport, image, rerender } = renderLightbox();
    fireEvent.doubleClick(viewport, { clientX: 500, clientY: 400 });
    expect(scaleOf(image)).toBeGreaterThan(1);

    rerender(
      <ImageLightbox src="https://files.example.com/two.png" alt="two.png" />
    );

    expect(scaleOf(screen.getByTestId('image-lightbox-image'))).toBe(1);
  });
});

describe('ImageLightbox touch gestures', () => {
  const touch = (x: number, y: number) => ({ clientX: x, clientY: y });

  it('a horizontal swipe navigates while fitted', () => {
    const onSwipeLeft = vi.fn();
    const onSwipeRight = vi.fn();
    const { viewport } = renderLightbox({ onSwipeLeft, onSwipeRight });

    fireEvent.touchStart(viewport, { touches: [touch(400, 300)] });
    fireEvent.touchMove(viewport, { touches: [touch(200, 305)] });
    fireEvent.touchEnd(viewport, { touches: [] });
    expect(onSwipeLeft).toHaveBeenCalledTimes(1);

    fireEvent.touchStart(viewport, { touches: [touch(200, 300)] });
    fireEvent.touchMove(viewport, { touches: [touch(400, 305)] });
    fireEvent.touchEnd(viewport, { touches: [] });
    expect(onSwipeRight).toHaveBeenCalledTimes(1);
  });

  it('a mostly vertical or short drag is not a swipe', () => {
    const onSwipeLeft = vi.fn();
    const { viewport } = renderLightbox({ onSwipeLeft });

    fireEvent.touchStart(viewport, { touches: [touch(400, 300)] });
    fireEvent.touchMove(viewport, { touches: [touch(370, 60)] });
    fireEvent.touchEnd(viewport, { touches: [] });

    fireEvent.touchStart(viewport, { touches: [touch(400, 300)] });
    fireEvent.touchMove(viewport, { touches: [touch(380, 300)] });
    fireEvent.touchEnd(viewport, { touches: [] });

    expect(onSwipeLeft).not.toHaveBeenCalled();
  });

  it('a horizontal drag pans instead of navigating once zoomed in', () => {
    const onSwipeLeft = vi.fn();
    const { viewport, image } = renderLightbox({ onSwipeLeft });
    fireEvent.doubleClick(viewport, { clientX: 400, clientY: 300 });

    fireEvent.touchStart(viewport, { touches: [touch(400, 300)] });
    fireEvent.touchMove(viewport, { touches: [touch(300, 300)] });
    fireEvent.touchEnd(viewport, { touches: [] });

    expect(onSwipeLeft).not.toHaveBeenCalled();
    expect(offsetOf(image).x).toBe(-100);
  });

  it('pinching with two fingers zooms', () => {
    const { viewport, image } = renderLightbox();

    fireEvent.touchStart(viewport, {
      touches: [touch(300, 300), touch(500, 300)],
    });
    fireEvent.touchMove(viewport, {
      touches: [touch(200, 300), touch(600, 300)],
    });
    fireEvent.touchEnd(viewport, { touches: [] });

    expect(scaleOf(image)).toBeCloseTo(2, 5);
  });

  it('double-tap toggles zoom', () => {
    const { viewport, image } = renderLightbox();

    fireEvent.touchStart(viewport, { touches: [touch(400, 300)] });
    fireEvent.touchEnd(viewport, { touches: [] });
    fireEvent.touchStart(viewport, { touches: [touch(402, 301)] });
    fireEvent.touchEnd(viewport, { touches: [] });

    expect(scaleOf(image)).toBe(DOUBLE_TAP_SCALE);
  });
});
