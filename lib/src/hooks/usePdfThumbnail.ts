import { useCallback, useEffect, useRef, useState } from 'react';
import {
  PdfDocumentLoadingTask,
  PdfDocumentProxy,
  loadPdfjs,
} from '../helpers/pdf/loadPdfjs';

export type PdfThumbnailStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'error'
  | 'skipped';

interface UsePdfThumbnailParams {
  url?: string;
  /** Gate: keep false until the bubble is on screen. */
  enabled: boolean;
  /** CSS pixels of the rendered bitmap's long edge. */
  width?: number;
  /** Files above this never auto-render; the card stays static. */
  maxBytes?: number;
  sizeInBytes?: number;
  workerSrc?: string;
}

interface UsePdfThumbnailResult {
  status: PdfThumbnailStatus;
  /** Object URL - owned by this hook, revoked on unmount/url change. */
  thumbnailUrl?: string;
  pageCount?: number;
  /** Re-runs a render that failed or was skipped for being too big. */
  retry: () => void;
}

/**
 * Rendering N documents at once on the main thread makes scrolling stutter,
 * and a chat history can easily hold a dozen. Two at a time keeps the
 * thumbnails filling in visibly without owning the frame budget.
 */
const MAX_CONCURRENT_RENDERS = 2;
let activeRenders = 0;
const renderQueue: Array<() => void> = [];

const acquireRenderSlot = (): Promise<void> =>
  new Promise((resolve) => {
    if (activeRenders < MAX_CONCURRENT_RENDERS) {
      activeRenders += 1;
      resolve();
      return;
    }
    renderQueue.push(resolve);
  });

const releaseRenderSlot = () => {
  const next = renderQueue.shift();
  if (next) {
    next();
    return;
  }
  activeRenders = Math.max(0, activeRenders - 1);
};

const canvasToObjectUrl = (canvas: HTMLCanvasElement): Promise<string | null> =>
  new Promise((resolve) => {
    if (typeof canvas.toBlob !== 'function') {
      resolve(null);
      return;
    }
    canvas.toBlob((blob) => {
      resolve(blob ? URL.createObjectURL(blob) : null);
    }, 'image/png');
  });

/** 25 MB: past this, parsing costs more than the thumbnail is worth. */
const DEFAULT_MAX_BYTES = 25 * 1024 * 1024;

export const usePdfThumbnail = ({
  url,
  enabled,
  width = 240,
  maxBytes = DEFAULT_MAX_BYTES,
  sizeInBytes,
  workerSrc,
}: UsePdfThumbnailParams): UsePdfThumbnailResult => {
  const [status, setStatus] = useState<PdfThumbnailStatus>('idle');
  const [thumbnailUrl, setThumbnailUrl] = useState<string | undefined>();
  const [pageCount, setPageCount] = useState<number | undefined>();
  const [attempt, setAttempt] = useState(0);
  const [forced, setForced] = useState(false);

  // Held outside state so cleanup can revoke the previous bitmap without
  // depending on a render having flushed.
  const objectUrlRef = useRef<string | undefined>(undefined);

  const publishThumbnail = useCallback((next?: string) => {
    if (objectUrlRef.current && objectUrlRef.current !== next) {
      URL.revokeObjectURL(objectUrlRef.current);
    }
    objectUrlRef.current = next;
    setThumbnailUrl(next);
  }, []);

  const retry = useCallback(() => {
    setForced(true);
    setAttempt((value) => value + 1);
  }, []);

  useEffect(
    () => () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = undefined;
      }
    },
    []
  );

  useEffect(() => {
    if (!url || !enabled) return undefined;

    const overSizeLimit =
      !forced && typeof sizeInBytes === 'number' && sizeInBytes > maxBytes;
    if (overSizeLimit) {
      setStatus('skipped');
      return undefined;
    }

    let cancelled = false;
    let slotHeld = false;
    let loadingTask: PdfDocumentLoadingTask | undefined;
    let document: PdfDocumentProxy | undefined;

    const run = async () => {
      setStatus('loading');

      const pdfjs = await loadPdfjs(workerSrc);
      if (cancelled) return;
      if (!pdfjs) {
        setStatus('error');
        return;
      }

      await acquireRenderSlot();
      slotHeld = true;
      if (cancelled) return;

      try {
        loadingTask = pdfjs.getDocument({ url, isEvalSupported: false });
        document = await loadingTask.promise;
        if (cancelled) return;

        setPageCount(document.numPages);

        const page = await document.getPage(1);
        if (cancelled) return;

        const baseViewport = page.getViewport({ scale: 1 });
        const scale = baseViewport.width ? width / baseViewport.width : 1;
        const viewport = page.getViewport({ scale });

        const canvas = window.document.createElement('canvas');
        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));

        const context = canvas.getContext('2d');
        if (!context) {
          setStatus('error');
          return;
        }

        const renderTask = page.render({ canvasContext: context, viewport });
        await renderTask.promise;
        if (cancelled) return;

        const nextUrl = await canvasToObjectUrl(canvas);
        page.cleanup();

        if (cancelled) {
          if (nextUrl) URL.revokeObjectURL(nextUrl);
          return;
        }

        if (!nextUrl) {
          setStatus('error');
          return;
        }

        publishThumbnail(nextUrl);
        setStatus('ready');
      } catch (error) {
        if (!cancelled) {
          console.warn('[Ethora] PDF thumbnail render failed:', error);
          setStatus('error');
        }
      } finally {
        if (slotHeld) {
          releaseRenderSlot();
          slotHeld = false;
        }
      }
    };

    run();

    return () => {
      cancelled = true;
      if (slotHeld) {
        releaseRenderSlot();
        slotHeld = false;
      }
      // destroy() tears the parse down mid-flight; both proxies reject
      // pending work, which the catch above swallows because `cancelled`.
      document?.destroy?.().catch(() => undefined);
      loadingTask?.destroy?.().catch(() => undefined);
    };
  }, [
    url,
    enabled,
    width,
    maxBytes,
    sizeInBytes,
    workerSrc,
    attempt,
    forced,
    publishThumbnail,
  ]);

  return { status, thumbnailUrl, pageCount, retry };
};
