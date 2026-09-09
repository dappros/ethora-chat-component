import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import styled from 'styled-components';
import { MOTION_BASE, MOTION_EASE, reducedMotion } from '../../../styles/motion';

export const MIN_SCALE = 1;
export const MAX_SCALE = 6;
/** What a double-click / double-tap jumps to from the fitted view. */
export const DOUBLE_TAP_SCALE = 2.5;
/** Horizontal travel (px) that counts as a navigation swipe. */
const SWIPE_THRESHOLD = 50;
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_SLOP = 24;
const WHEEL_SENSITIVITY = 0.0016;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const Viewport = styled.div`
  position: relative;
  /* An explicit height, not flex growth alone: the parent lays its children
     out in a row and centres them, so the viewport would otherwise be sized
     by its content, and the image's own max-height of 100% would resolve
     against that auto height and never fit anything. */
  flex: 1 1 auto;
  width: 100%;
  height: 100%;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  /* A zoomed image is dragged, not selected, and a two-finger gesture is a
     pinch rather than a page scroll. */
  touch-action: none;
  user-select: none;
  background-color: var(--ethora-color-bg, #fff);
`;

const ZoomableImage = styled.img<{
  $grabbing: boolean;
  $pannable: boolean;
  $animate: boolean;
}>`
  /* Same box the single-file view always used: fill the stage and let
     object-fit do the letterboxing, so what the viewer sees at scale 1 is
     unchanged. It is also what makes the pan clamp exact, since the painted
     content box is then derived from the natural aspect ratio alone. */
  width: 100%;
  height: 100%;
  object-fit: contain;
  transform-origin: center center;
  will-change: transform;
  cursor: ${({ $grabbing, $pannable }) =>
    $grabbing ? 'grabbing' : $pannable ? 'grab' : 'zoom-in'};
  transition: ${({ $animate }) =>
    $animate ? `transform ${MOTION_BASE} ${MOTION_EASE}` : 'none'};
  ${reducedMotion}
`;

export interface ImageLightboxHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  reset: () => void;
}

interface ImageLightboxProps {
  src: string;
  alt: string;
  /** Swipe (touch) navigation; also used to report gesture direction. */
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onError?: React.ReactEventHandler<HTMLImageElement>;
  /** Reported on every scale change so the chrome can label its controls. */
  onScaleChange?: (scale: number) => void;
}

/**
 * The zoom/pan surface of the media viewer.
 *
 * Zoom model: the `<img>` keeps `object-fit: contain`, so scale 1 is always
 * "fitted to the viewport" whatever the image's aspect ratio, and everything
 * above it is a CSS transform on top of that fit - no re-layout, no
 * re-decode, and the fitted view is exactly what the viewer saw before this
 * feature existed. Zooming is anchored on the pointer (or on the midpoint
 * between two fingers), and the pan offset is clamped every time either the
 * scale or the offset changes, using the image's natural aspect ratio
 * against the viewport box, so the picture can never be dragged off screen:
 * at scale 1 the only legal offset is (0, 0).
 */
const ImageLightbox = React.forwardRef<ImageLightboxHandle, ImageLightboxProps>(
  ({ src, alt, onSwipeLeft, onSwipeRight, onError, onScaleChange }, ref) => {
    const viewportRef = useRef<HTMLDivElement>(null);
    const imageRef = useRef<HTMLImageElement>(null);

    const [scale, setScale] = useState(MIN_SCALE);
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const [animate, setAnimate] = useState(false);
    const [dragging, setDragging] = useState(false);

    // Mutable gesture bookkeeping - none of it should re-render on change.
    const stateRef = useRef({ scale: MIN_SCALE, offset: { x: 0, y: 0 } });
    stateRef.current = { scale, offset };
    const mouseDragRef = useRef<{ x: number; y: number } | null>(null);
    const touchRef = useRef<{
      startX: number;
      startY: number;
      lastX: number;
      lastY: number;
      pinchDistance: number;
      pinchScale: number;
      panning: boolean;
      moved: boolean;
    } | null>(null);
    const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(
      null
    );

    /**
     * How far the image may be pushed from centre at a given scale. The
     * rendered (fitted) box is derived from the natural aspect ratio rather
     * than measured, so it is correct on the very first frame - measuring a
     * transformed element would feed the transform back into its own bounds.
     */
    const maxOffsetFor = useCallback((nextScale: number) => {
      const viewport = viewportRef.current;
      const image = imageRef.current;
      if (!viewport) return { x: 0, y: 0 };

      const vw = viewport.clientWidth;
      const vh = viewport.clientHeight;
      const nw = image?.naturalWidth || 0;
      const nh = image?.naturalHeight || 0;

      let fittedWidth = vw;
      let fittedHeight = vh;
      if (nw > 0 && nh > 0 && vw > 0 && vh > 0) {
        const fit = Math.min(vw / nw, vh / nh);
        fittedWidth = nw * fit;
        fittedHeight = nh * fit;
      }

      return {
        x: Math.max(0, (fittedWidth * nextScale - vw) / 2),
        y: Math.max(0, (fittedHeight * nextScale - vh) / 2),
      };
    }, []);

    const applyTransform = useCallback(
      (
        nextScale: number,
        nextOffset: { x: number; y: number },
        withAnimation: boolean
      ) => {
        const clampedScale = clamp(nextScale, MIN_SCALE, MAX_SCALE);
        const bounds = maxOffsetFor(clampedScale);
        setAnimate(withAnimation);
        setScale(clampedScale);
        setOffset({
          x: clamp(nextOffset.x, -bounds.x, bounds.x),
          y: clamp(nextOffset.y, -bounds.y, bounds.y),
        });
      },
      [maxOffsetFor]
    );

    /** Zoom keeping the point under (cx, cy) - viewport centre relative - fixed. */
    const zoomAround = useCallback(
      (nextScale: number, cx: number, cy: number, withAnimation: boolean) => {
        const current = stateRef.current;
        const clamped = clamp(nextScale, MIN_SCALE, MAX_SCALE);
        const ratio = clamped / current.scale;
        applyTransform(
          clamped,
          {
            x: cx - (cx - current.offset.x) * ratio,
            y: cy - (cy - current.offset.y) * ratio,
          },
          withAnimation
        );
      },
      [applyTransform]
    );

    const reset = useCallback(() => {
      applyTransform(MIN_SCALE, { x: 0, y: 0 }, true);
    }, [applyTransform]);

    const zoomByStep = useCallback(
      (factor: number) => {
        zoomAround(stateRef.current.scale * factor, 0, 0, true);
      },
      [zoomAround]
    );

    React.useImperativeHandle(
      ref,
      () => ({
        zoomIn: () => zoomByStep(1.5),
        zoomOut: () => zoomByStep(1 / 1.5),
        reset,
      }),
      [zoomByStep, reset]
    );

    // A new file starts fitted: carrying a 4x zoom over to the next picture
    // would drop the viewer into a random corner of it.
    useEffect(() => {
      setAnimate(false);
      setScale(MIN_SCALE);
      setOffset({ x: 0, y: 0 });
    }, [src]);

    useEffect(() => {
      onScaleChange?.(scale);
    }, [scale, onScaleChange]);

    // Wheel has to be a native non-passive listener: React's onWheel is
    // registered passively at the root, so preventDefault() there is ignored
    // and the host page scrolls behind the viewer while it zooms.
    useEffect(() => {
      const viewport = viewportRef.current;
      if (!viewport) return undefined;

      const onWheel = (event: WheelEvent) => {
        event.preventDefault();
        const rect = viewport.getBoundingClientRect();
        const cx = event.clientX - rect.left - rect.width / 2;
        const cy = event.clientY - rect.top - rect.height / 2;
        const factor = Math.exp(-event.deltaY * WHEEL_SENSITIVITY);
        zoomAround(stateRef.current.scale * factor, cx, cy, false);
      };

      viewport.addEventListener('wheel', onWheel, { passive: false });
      return () => viewport.removeEventListener('wheel', onWheel);
    }, [zoomAround]);

    const toggleZoomAt = useCallback(
      (clientX: number, clientY: number) => {
        const viewport = viewportRef.current;
        if (!viewport) return;
        if (stateRef.current.scale > MIN_SCALE) {
          reset();
          return;
        }
        const rect = viewport.getBoundingClientRect();
        zoomAround(
          DOUBLE_TAP_SCALE,
          clientX - rect.left - rect.width / 2,
          clientY - rect.top - rect.height / 2,
          true
        );
      },
      [reset, zoomAround]
    );

    // --- Mouse pan ---------------------------------------------------------
    const onMouseDown = useCallback((event: React.MouseEvent) => {
      if (event.button !== 0) return;
      if (stateRef.current.scale <= MIN_SCALE) return;
      event.preventDefault();
      mouseDragRef.current = { x: event.clientX, y: event.clientY };
      setDragging(true);
    }, []);

    useEffect(() => {
      if (!dragging || typeof window === 'undefined') return undefined;

      const onMove = (event: MouseEvent) => {
        const start = mouseDragRef.current;
        if (!start) return;
        const current = stateRef.current;
        applyTransform(
          current.scale,
          {
            x: current.offset.x + (event.clientX - start.x),
            y: current.offset.y + (event.clientY - start.y),
          },
          false
        );
        mouseDragRef.current = { x: event.clientX, y: event.clientY };
      };
      const onUp = () => {
        mouseDragRef.current = null;
        setDragging(false);
      };

      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
      return () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
    }, [dragging, applyTransform]);

    // --- Touch: pinch zoom, drag pan, swipe navigation, double-tap ---------
    const onTouchStart = useCallback((event: React.TouchEvent) => {
      if (event.touches.length === 2) {
        const [a, b] = [event.touches[0], event.touches[1]];
        touchRef.current = {
          startX: 0,
          startY: 0,
          lastX: 0,
          lastY: 0,
          pinchDistance: Math.hypot(
            a.clientX - b.clientX,
            a.clientY - b.clientY
          ),
          pinchScale: stateRef.current.scale,
          panning: false,
          moved: false,
        };
        return;
      }

      const touch = event.touches[0];
      if (!touch) return;
      touchRef.current = {
        startX: touch.clientX,
        startY: touch.clientY,
        lastX: touch.clientX,
        lastY: touch.clientY,
        pinchDistance: 0,
        pinchScale: stateRef.current.scale,
        panning: stateRef.current.scale > MIN_SCALE,
        moved: false,
      };
    }, []);

    const onTouchMove = useCallback(
      (event: React.TouchEvent) => {
        const gesture = touchRef.current;
        if (!gesture) return;

        if (event.touches.length === 2 && gesture.pinchDistance > 0) {
          const [a, b] = [event.touches[0], event.touches[1]];
          const distance = Math.hypot(
            a.clientX - b.clientX,
            a.clientY - b.clientY
          );
          const viewport = viewportRef.current;
          if (!viewport || distance <= 0) return;
          const rect = viewport.getBoundingClientRect();
          const cx =
            (a.clientX + b.clientX) / 2 - rect.left - rect.width / 2;
          const cy = (a.clientY + b.clientY) / 2 - rect.top - rect.height / 2;
          gesture.moved = true;
          zoomAround(
            (gesture.pinchScale * distance) / gesture.pinchDistance,
            cx,
            cy,
            false
          );
          return;
        }

        const touch = event.touches[0];
        if (!touch) return;
        if (
          Math.abs(touch.clientX - gesture.startX) > 6 ||
          Math.abs(touch.clientY - gesture.startY) > 6
        ) {
          gesture.moved = true;
        }

        if (gesture.panning) {
          const current = stateRef.current;
          applyTransform(
            current.scale,
            {
              x: current.offset.x + (touch.clientX - gesture.lastX),
              y: current.offset.y + (touch.clientY - gesture.lastY),
            },
            false
          );
        }
        gesture.lastX = touch.clientX;
        gesture.lastY = touch.clientY;
      },
      [applyTransform, zoomAround]
    );

    const onTouchEnd = useCallback(
      (event: React.TouchEvent) => {
        const gesture = touchRef.current;
        if (!gesture) return;
        // Wait until the last finger is up: lifting one of two pinch fingers
        // must not be read as the end of a swipe.
        if (event.touches.length > 0) return;
        touchRef.current = null;

        if (!gesture.moved && gesture.pinchDistance === 0) {
          const now = Date.now();
          const previous = lastTapRef.current;
          if (
            previous &&
            now - previous.time < DOUBLE_TAP_MS &&
            Math.abs(previous.x - gesture.startX) < DOUBLE_TAP_SLOP &&
            Math.abs(previous.y - gesture.startY) < DOUBLE_TAP_SLOP
          ) {
            lastTapRef.current = null;
            toggleZoomAt(gesture.startX, gesture.startY);
            return;
          }
          lastTapRef.current = {
            time: now,
            x: gesture.startX,
            y: gesture.startY,
          };
          return;
        }

        // Swipe only from the fitted view: while zoomed in, a horizontal drag
        // is a pan across the picture, not a request for the next one.
        if (gesture.panning || gesture.pinchDistance > 0) return;
        if (stateRef.current.scale > MIN_SCALE) return;

        const dx = gesture.lastX - gesture.startX;
        const dy = gesture.lastY - gesture.startY;
        if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dx) <= Math.abs(dy)) {
          return;
        }
        if (dx < 0) {
          onSwipeLeft?.();
        } else {
          onSwipeRight?.();
        }
      },
      [onSwipeLeft, onSwipeRight, toggleZoomAt]
    );

    const onDoubleClick = useCallback(
      (event: React.MouseEvent) => {
        toggleZoomAt(event.clientX, event.clientY);
      },
      [toggleZoomAt]
    );

    const transform = useMemo(
      () => `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
      [offset.x, offset.y, scale]
    );

    return (
      <Viewport
        ref={viewportRef}
        data-testid="image-lightbox-viewport"
        onMouseDown={onMouseDown}
        onDoubleClick={onDoubleClick}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        <ZoomableImage
          ref={imageRef}
          data-testid="image-lightbox-image"
          src={src}
          alt={alt}
          draggable={false}
          onError={onError}
          $grabbing={dragging}
          $pannable={scale > MIN_SCALE}
          $animate={animate}
          style={{ transform }}
        />
      </Viewport>
    );
  }
);

ImageLightbox.displayName = 'ImageLightbox';

export default ImageLightbox;
