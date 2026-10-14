import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';
import useMeasure from 'react-use-measure';
import {
  PdfDocumentLoadingTask,
  PdfDocumentProxy,
  PdfRenderTask,
  loadPdfjs,
} from '../../../helpers/pdf/loadPdfjs';
import { useChatSettingState } from '../../../hooks/useChatSettingState';
import { useT } from '../../../i18n/useT';
import { shimmerBackground } from '../../../styles/motion';
import { ZoomInIcon, ZoomOutIcon, ZoomResetIcon } from '../../../assets/icons';

/*
 * Layout constants, in CSS pixels. The page stack is absolutely positioned
 * inside one scroll container, so the scroll height is known before any
 * canvas exists and only the pages near the viewport own a canvas.
 */
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const ZOOM_STEP = 1.25;
const WHEEL_ZOOM_SENSITIVITY = 0.002;
const PAGE_GAP = 12;
const SIDE_GUTTER = 16;
const TOP_GUTTER = 16;
// Room under the last page so the floating controls never cover it.
const BOTTOM_GUTTER = 72;
const MIN_VIEW_WIDTH = 320;
const RESIZE_DEBOUNCE_MS = 150;
const MEASURE_CONCURRENCY = 4;
const MAX_RENDERED_PAGES = 7;
// Pages intersecting the viewport plus this margin are render candidates, so
// a page is already painted by the time it scrolls into view.
const RENDER_ROOT_MARGIN = '800px 0px';
const MAX_DEVICE_PIXEL_RATIO = 2;
const KEY_SCROLL_RATIO = 0.9;
// US Letter in PDF points. Used for skeleton sizing until real sizes arrive.
const DEFAULT_PAGE_SIZE = { width: 612, height: 792 };

interface PageSize {
  width: number;
  height: number;
}

interface ScrollAnchor {
  /** Content fraction (0-1) under the anchor point, horizontally and vertically. */
  fx: number;
  fy: number;
  /** Anchor point inside the scroll container's visible box. */
  cx: number;
  cy: number;
}

interface PageLayout {
  pageWidth: number;
  stageWidth: number;
  stageHeight: number;
  left: number;
  tops: number[];
  heights: number[];
}

const ViewerContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  width: 100%;
  height: 100%;
  overflow: auto;
`;

const Viewer = styled.div`
  position: relative;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
`;

const Scroll = styled.div`
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  overflow: auto;
  overscroll-behavior: contain;
  background-color: #e6e9ee;
  border-radius: var(--ethora-radius-lg, 16px);
  -webkit-overflow-scrolling: touch;
`;

const Stage = styled.div`
  position: relative;
`;

const PageSheet = styled.div<{ $loading: boolean }>`
  position: absolute;
  box-sizing: border-box;
  overflow: hidden;
  background-color: #fff;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
  ${({ $loading }) => $loading && shimmerBackground}
`;

const PageCanvas = styled.canvas<{ $painted: boolean }>`
  display: ${({ $painted }) => ($painted ? 'block' : 'none')};
  width: 100%;
  height: 100%;
`;

const Overlay = styled.div`
  position: absolute;
  left: 0;
  right: 0;
  bottom: 16px;
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 8px;
  padding: 0 16px;
  pointer-events: none;
`;

const GlassPill = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 2px;
  box-sizing: border-box;
  border-radius: 999px;
  background-color: rgba(20, 22, 28, 0.72);
  color: #fff;
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  pointer-events: auto;
  user-select: none;
`;

// Grid column 1 is an empty spacer so the indicator stays centred even when
// the zoom pill is the only other item.
const PageIndicator = styled(GlassPill)`
  grid-column: 2;
  justify-self: center;
  padding: 6px 14px;
`;

const ZoomPill = styled(GlassPill)`
  grid-column: 3;
  justify-self: end;
  padding: 3px;
`;

const ZoomLevel = styled.span`
  min-width: 44px;
  text-align: center;
  font-size: 12px;
`;

const ZoomButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: inherit;
  cursor: pointer;

  &:hover:not(:disabled) {
    background-color: rgba(255, 255, 255, 0.16);
  }

  &:disabled {
    opacity: 0.4;
    cursor: default;
  }

  &:focus-visible {
    outline: 2px solid #fff;
    outline-offset: 2px;
  }
`;

const FallbackBox = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 16px;
  border-radius: var(--ethora-radius-lg, 16px);
  background-color: var(--ethora-color-bg-subtle, #f5f7fa);
  color: var(--ethora-color-text, #141414);
  text-align: center;

  a {
    color: var(--ethora-color-primary-text, var(--ethora-color-primary, #0052cd));
  }
`;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const isEditableTarget = (target: EventTarget | null): boolean => {
  const element = target as HTMLElement | null;
  if (!element || !element.tagName) return false;
  if (element.isContentEditable) return true;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName);
};

/** Index (1-based) of the page covering the most of the visible box. */
const findCurrentPage = (
  scrollTop: number,
  viewHeight: number,
  tops: number[],
  heights: number[]
): number => {
  const viewBottom = scrollTop + viewHeight;
  let best = 0;
  let bestOverlap = -1;
  for (let index = 0; index < tops.length; index += 1) {
    const top = tops[index];
    const bottom = top + heights[index];
    if (bottom < scrollTop) continue;
    if (top > viewBottom) break;
    const overlap = Math.min(bottom, viewBottom) - Math.max(top, scrollTop);
    if (overlap > bestOverlap) {
      best = index;
      bestOverlap = overlap;
    }
  }
  return best + 1;
};

/** The pages nearest the anchor page, capped so memory stays bounded. */
const nearestPages = (pages: number[], anchor: number): Set<number> =>
  new Set(
    [...pages]
      .sort((a, b) => Math.abs(a - anchor) - Math.abs(b - anchor) || a - b)
      .slice(0, MAX_RENDERED_PAGES)
  );

interface PdfPageProps {
  pdfDocument: PdfDocumentProxy;
  pageNumber: number;
  /** CSS width of the page. */
  width: number;
  height: number;
  top: number;
  left: number;
  /** Only pages near the viewport own a canvas; the rest are freed. */
  active: boolean;
}

/**
 * One page: a sized placeholder that holds a canvas while it is `active`.
 * Deactivating cancels any in-flight render and gives the canvas back.
 */
const PdfPage = React.memo(function PdfPage({
  pdfDocument,
  pageNumber,
  width,
  height,
  top,
  left,
  active,
}: PdfPageProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const taskRef = useRef<PdfRenderTask | null>(null);
  const [painted, setPainted] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    if (!active || width <= 0) {
      taskRef.current?.cancel();
      taskRef.current = null;
      canvas.width = 0;
      canvas.height = 0;
      setPainted(false);
      return undefined;
    }

    let cancelled = false;

    (async () => {
      try {
        const page = await pdfDocument.getPage(pageNumber);
        if (cancelled) {
          page.cleanup();
          return;
        }

        const base = page.getViewport({ scale: 1 });
        const dpr = Math.min(window.devicePixelRatio || 1, MAX_DEVICE_PIXEL_RATIO);
        const viewport = page.getViewport({
          scale: base.width ? (width / base.width) * dpr : dpr,
        });

        const context = canvas.getContext('2d');
        if (!context) return;

        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));

        taskRef.current?.cancel();
        const task = page.render({ canvasContext: context, viewport });
        taskRef.current = task;
        await task.promise;
        if (!cancelled) setPainted(true);
        page.cleanup();
      } catch (error) {
        if (!cancelled) {
          console.warn('[Ethora] PDF page render failed:', error);
        }
      }
    })();

    return () => {
      cancelled = true;
      taskRef.current?.cancel();
      taskRef.current = null;
    };
  }, [active, pdfDocument, pageNumber, width]);

  return (
    <PageSheet
      data-pdf-page={pageNumber}
      $loading={!painted}
      style={{ left, top, width, height }}
    >
      <PageCanvas ref={canvasRef} $painted={painted} />
    </PageSheet>
  );
});

interface PdfViewerProps {
  pdfUrl: string;
}

/**
 * In-app PDF viewer.
 *
 * This used to be an iframe pointed at `mozilla.github.io/pdf.js/web/viewer.html`
 * with the file URL in the query string, which meant every document a user
 * opened was handed to a third-party host - and broke outright whenever that
 * page changed or was unreachable. Rendering locally keeps the file URL
 * inside the app and works offline-ish (the PDF itself still has to load).
 *
 * All pages stack in one scroll container. Every page has a placeholder sized
 * from its real aspect, but only the few near the viewport render a canvas,
 * so a 200-page document costs about as much as a 7-page one.
 */
const PdfViewer: React.FC<PdfViewerProps> = ({ pdfUrl }) => {
  const t = useT();
  const { config } = useChatSettingState();
  const [measureRef, frameBounds] = useMeasure();

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const setScrollRef = useCallback(
    (element: HTMLDivElement | null) => {
      scrollRef.current = element;
      measureRef(element);
    },
    [measureRef]
  );

  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [pdfDoc, setPdfDoc] = useState<PdfDocumentProxy | null>(null);
  const [sizes, setSizes] = useState<PageSize[]>([]);
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);
  const [viewWidth, setViewWidth] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const currentPageRef = useRef(1);
  const [wanted, setWanted] = useState<ReadonlySet<number>>(() => new Set());

  const anchorRef = useRef<ScrollAnchor | null>(null);
  const layoutRef = useRef<PageLayout | null>(null);
  const scrollFrameRef = useRef<number | null>(null);

  const layoutWidth = viewWidth > 0 ? viewWidth : MIN_VIEW_WIDTH;
  const pageCount = pdfDoc?.numPages ?? 0;

  // Opening the document. Sizes start from a Letter-shaped guess and are
  // replaced once the real ones have been measured.
  useEffect(() => {
    let cancelled = false;
    let loaded: PdfDocumentProxy | null = null;
    let loadingTask: PdfDocumentLoadingTask | undefined;

    setStatus('loading');
    setPdfDoc(null);
    setSizes([]);
    setWanted(new Set());
    currentPageRef.current = 1;
    setCurrentPage(1);

    (async () => {
      const pdfjs = await loadPdfjs(config?.pdfPreview?.workerSrc, config?.pdfPreview?.libUrl);
      if (cancelled) return;
      if (!pdfjs || !pdfUrl) {
        setStatus('error');
        return;
      }

      try {
        loadingTask = pdfjs.getDocument({ url: pdfUrl, isEvalSupported: false });
        const opened = await loadingTask.promise;
        if (cancelled) {
          opened.destroy().catch(() => undefined);
          return;
        }
        loaded = opened;
        if (opened.numPages < 1) {
          setStatus('error');
          return;
        }
        setSizes(Array.from({ length: opened.numPages }, () => DEFAULT_PAGE_SIZE));
        setPdfDoc(opened);
        setStatus('ready');
      } catch (error) {
        if (!cancelled) {
          console.warn('[Ethora] PDF open failed:', error);
          setStatus('error');
        }
      }
    })();

    return () => {
      cancelled = true;
      loaded?.destroy?.().catch(() => undefined);
      loadingTask?.destroy?.().catch(() => undefined);
    };
  }, [pdfUrl, config?.pdfPreview?.workerSrc, config?.pdfPreview?.libUrl]);

  // Real page sizes: page 1 first so the first screen is right, then the rest
  // in small batches. Each batch is one state update, not one per page.
  useEffect(() => {
    if (!pdfDoc) return undefined;
    let cancelled = false;

    (async () => {
      try {
        const total = pdfDoc.numPages;
        const first = await pdfDoc.getPage(1);
        const firstViewport = first.getViewport({ scale: 1 });
        first.cleanup();
        if (cancelled || !firstViewport.width) return;

        const firstSize = { width: firstViewport.width, height: firstViewport.height };
        setSizes(Array.from({ length: total }, () => firstSize));

        for (let start = 2; start <= total; start += MEASURE_CONCURRENCY) {
          const end = Math.min(total, start + MEASURE_CONCURRENCY - 1);
          const batch: Array<{ pageNumber: number; size: PageSize }> = await Promise.all(
            Array.from({ length: end - start + 1 }, async (_, offset) => {
              const pageNumber = start + offset;
              const page = await pdfDoc.getPage(pageNumber);
              const viewport = page.getViewport({ scale: 1 });
              page.cleanup();
              return {
                pageNumber,
                size: { width: viewport.width, height: viewport.height },
              };
            })
          );
          if (cancelled) return;
          setSizes((previous) => {
            if (previous.length !== total) return previous;
            const next = previous.slice();
            batch.forEach(({ pageNumber, size }) => {
              next[pageNumber - 1] = size;
            });
            return next;
          });
        }
      } catch (error) {
        if (!cancelled) {
          console.warn('[Ethora] PDF page measure failed:', error);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pdfDoc]);

  const layout = useMemo<PageLayout>(() => {
    const pageSizes = sizes.length > 0 ? sizes : [DEFAULT_PAGE_SIZE];
    const pageWidth = Math.max(1, layoutWidth - SIDE_GUTTER * 2) * zoom;
    const stageWidth = Math.max(layoutWidth, pageWidth + SIDE_GUTTER * 2);
    const tops: number[] = [];
    const heights: number[] = [];
    let y = TOP_GUTTER;
    pageSizes.forEach((size) => {
      const height = (pageWidth * size.height) / (size.width || 1);
      tops.push(y);
      heights.push(height);
      y += height + PAGE_GAP;
    });
    const contentHeight = y - PAGE_GAP;
    return {
      pageWidth,
      stageWidth,
      stageHeight: contentHeight + BOTTOM_GUTTER,
      left: (stageWidth - pageWidth) / 2,
      tops,
      heights,
    };
  }, [sizes, layoutWidth, zoom]);

  layoutRef.current = layout;

  // A layout change (zoom, resize, real page sizes) keeps the point that was
  // under the anchor still under it. Without an anchor the offset is kept.
  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const anchor = anchorRef.current;
    if (anchor) {
      anchorRef.current = null;
      element.scrollLeft = anchor.fx * element.scrollWidth - anchor.cx;
      element.scrollTop = anchor.fy * element.scrollHeight - anchor.cy;
    }
    const next = findCurrentPage(
      element.scrollTop,
      element.clientHeight,
      layout.tops,
      layout.heights
    );
    if (next !== currentPageRef.current) {
      currentPageRef.current = next;
      setCurrentPage(next);
    }
  }, [layout]);

  const captureAnchor = useCallback((cx?: number, cy?: number) => {
    const element = scrollRef.current;
    if (!element || !element.scrollHeight || !element.scrollWidth) return;
    // At the very top there is nothing to keep in place. Anchoring the centre
    // would shift a reader who never left the first page (for example when
    // the first real width arrives after a provisional layout).
    if (element.scrollTop <= 0 && element.scrollLeft <= 0) {
      anchorRef.current = null;
      return;
    }
    const ax = cx ?? element.clientWidth / 2;
    const ay = cy ?? element.clientHeight / 2;
    anchorRef.current = {
      fx: (element.scrollLeft + ax) / element.scrollWidth,
      fy: (element.scrollTop + ay) / element.scrollHeight,
      cx: ax,
      cy: ay,
    };
  }, []);

  const applyZoom = useCallback(
    (next: number, cx?: number, cy?: number) => {
      const clamped = clamp(next, MIN_ZOOM, MAX_ZOOM);
      if (clamped === zoomRef.current) return;
      captureAnchor(cx, cy);
      zoomRef.current = clamped;
      setZoom(clamped);
    },
    [captureAnchor]
  );

  // Fit-width is the default. A debounced resize keeps the reading position
  // without re-laying out on every pixel of a window drag.
  const measuredWidth = Math.max(MIN_VIEW_WIDTH, Math.floor(frameBounds.width || 0));
  useEffect(() => {
    if (viewWidth === 0) {
      setViewWidth(measuredWidth);
      return undefined;
    }
    if (measuredWidth === viewWidth) return undefined;
    const timer = window.setTimeout(() => {
      captureAnchor();
      setViewWidth(measuredWidth);
    }, RESIZE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [measuredWidth, viewWidth, captureAnchor]);

  // Environments without IntersectionObserver fall back to the pages nearest
  // the current one, which keeps the same cap.
  const hasObserver = typeof IntersectionObserver !== 'undefined';
  useEffect(() => {
    if (!pdfDoc || hasObserver) return;
    setWanted(
      nearestPages(
        Array.from({ length: pdfDoc.numPages }, (_, index) => index + 1),
        currentPage
      )
    );
  }, [pdfDoc, currentPage, hasObserver]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!pdfDoc || !element || typeof IntersectionObserver === 'undefined') {
      return undefined;
    }

    const visible = new Set<number>();
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const page = Number((entry.target as HTMLElement).dataset.pdfPage);
          if (!Number.isFinite(page)) return;
          if (entry.isIntersecting) {
            visible.add(page);
          } else {
            visible.delete(page);
          }
        });
        setWanted(nearestPages([...visible], currentPageRef.current));
      },
      { root: element, rootMargin: RENDER_ROOT_MARGIN }
    );

    element.querySelectorAll('[data-pdf-page]').forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [pdfDoc]);

  const updateCurrentPage = useCallback(() => {
    const element = scrollRef.current;
    const current = layoutRef.current;
    if (!element || !current) return;
    const next = findCurrentPage(
      element.scrollTop,
      element.clientHeight,
      current.tops,
      current.heights
    );
    if (next !== currentPageRef.current) {
      currentPageRef.current = next;
      setCurrentPage(next);
    }
  }, []);

  const onScroll = () => {
    if (scrollFrameRef.current !== null) return;
    scrollFrameRef.current = window.requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      updateCurrentPage();
    });
  };

  useEffect(
    () => () => {
      if (scrollFrameRef.current !== null) {
        window.cancelAnimationFrame(scrollFrameRef.current);
      }
    },
    []
  );

  // Ctrl/Cmd + wheel zooms around the cursor. React's onWheel is passive, so
  // preventDefault needs a native non-passive listener.
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return undefined;

    const onWheel = (event: WheelEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      applyZoom(
        zoomRef.current * Math.exp(-event.deltaY * WHEEL_ZOOM_SENSITIVITY),
        event.clientX - rect.left,
        event.clientY - rect.top
      );
    };

    element.addEventListener('wheel', onWheel, { passive: false });
    return () => element.removeEventListener('wheel', onWheel);
  }, [status, applyZoom]);

  // Keyboard: zoom keys work anywhere in the viewer. Scroll keys work when
  // focus is outside the scroll region; inside it the browser scrolls natively.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      if (isEditableTarget(event.target)) return;

      const element = scrollRef.current;
      if (!element) return;
      const target = event.target as HTMLElement | null;
      const insideScroll = !!target && element.contains(target);
      const buttonFocused =
        !!target && (target.tagName === 'BUTTON' || target.tagName === 'A');

      switch (event.key) {
        case '+':
        case '=':
          event.preventDefault();
          applyZoom(zoomRef.current * ZOOM_STEP);
          return;
        case '-':
        case '_':
          event.preventDefault();
          applyZoom(zoomRef.current / ZOOM_STEP);
          return;
        case '0':
          event.preventDefault();
          applyZoom(1);
          return;
        default:
          break;
      }

      if (insideScroll) return;
      const page = element.clientHeight * KEY_SCROLL_RATIO;
      switch (event.key) {
        case 'PageDown':
          event.preventDefault();
          element.scrollTop += page;
          return;
        case 'PageUp':
          event.preventDefault();
          element.scrollTop -= page;
          return;
        case ' ':
          // A focused button is activated by Space; leave that alone.
          if (buttonFocused) return;
          event.preventDefault();
          element.scrollTop += event.shiftKey ? -page : page;
          return;
        case 'Home':
          event.preventDefault();
          element.scrollTop = 0;
          return;
        case 'End':
          event.preventDefault();
          element.scrollTop = element.scrollHeight;
          return;
        default:
          return;
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [applyZoom]);

  if (status === 'error' || (status === 'ready' && pageCount === 0)) {
    return (
      <ViewerContainer>
        <FallbackBox>
          <span>{t('modal.filePreview.pdfUnavailable')}</span>
          <a href={pdfUrl} target="_blank" rel="noopener noreferrer">
            {t('modal.filePreview.openExternally')}
          </a>
        </FallbackBox>
      </ViewerContainer>
    );
  }

  const zoomPercent = Math.round(zoom * 100);

  return (
    <Viewer>
      <Scroll
        ref={setScrollRef}
        tabIndex={0}
        role="region"
        aria-label={t('modal.filePreview.pdfPages')}
        onScroll={onScroll}
        data-testid="pdf-scroll"
      >
        <Stage style={{ width: layout.stageWidth, height: layout.stageHeight }}>
          {pdfDoc ? (
            Array.from({ length: pageCount }, (_, index) => {
              const pageNumber = index + 1;
              return (
                <PdfPage
                  key={pageNumber}
                  pdfDocument={pdfDoc}
                  pageNumber={pageNumber}
                  width={layout.pageWidth}
                  height={layout.heights[index]}
                  top={layout.tops[index]}
                  left={layout.left}
                  active={wanted.has(pageNumber)}
                />
              );
            })
          ) : (
            <PageSheet
              $loading
              aria-hidden="true"
              style={{
                left: layout.left,
                top: TOP_GUTTER,
                width: layout.pageWidth,
                height: layout.heights[0],
              }}
            />
          )}
        </Stage>
      </Scroll>
      {status === 'ready' && (
        <Overlay>
          <PageIndicator>
            {currentPage} / {pageCount}
          </PageIndicator>
          <ZoomPill>
            <ZoomButton
              type="button"
              onClick={() => applyZoom(zoomRef.current / ZOOM_STEP)}
              disabled={zoom <= MIN_ZOOM}
              aria-label={t('modal.filePreview.zoomOut')}
            >
              <ZoomOutIcon color="currentColor" />
            </ZoomButton>
            <ZoomLevel>{zoomPercent}%</ZoomLevel>
            <ZoomButton
              type="button"
              onClick={() => applyZoom(zoomRef.current * ZOOM_STEP)}
              disabled={zoom >= MAX_ZOOM}
              aria-label={t('modal.filePreview.zoomIn')}
            >
              <ZoomInIcon color="currentColor" />
            </ZoomButton>
            <ZoomButton
              type="button"
              onClick={() => applyZoom(1)}
              disabled={zoom === 1}
              aria-label={t('modal.filePreview.resetZoom')}
            >
              <ZoomResetIcon color="currentColor" />
            </ZoomButton>
          </ZoomPill>
        </Overlay>
      )}
    </Viewer>
  );
};

export default PdfViewer;
