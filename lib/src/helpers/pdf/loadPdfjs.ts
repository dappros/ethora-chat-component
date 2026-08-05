/**
 * Lazy, failure-tolerant access to pdf.js.
 *
 * Two things drive the shape of this module:
 *
 * 1. pdf.js is ~1.5 MB. It must never land in the chunk that a host pays for
 *    on first paint, so it is only ever reached through `import()` from
 *    here, and this module is itself only imported dynamically.
 *
 * 2. Wiring `GlobalWorkerOptions.workerSrc` from inside a library is a
 *    portability trap: the URL has to survive our Vite lib build AND the
 *    host's bundler (Vite, webpack, Next, CRA), and every published recipe
 *    for it is bundler-specific. So by default we do not use a worker file
 *    at all - importing the worker module and parking it on
 *    `globalThis.pdfjsWorker` makes pdf.js run its message handler on the
 *    main thread (see PDFWorker's `#mainThreadWorkerMessageHandler`). For a
 *    one-page thumbnail that is a few milliseconds of main-thread work, and
 *    it is bundler-agnostic. Hosts that render large PDFs can hand us a real
 *    `workerSrc` through `config.pdfPreview.workerSrc` and get the worker
 *    path back.
 *
 * Any failure (module missing, CSP blocking eval, unsupported browser)
 * resolves to `null`; callers fall back to the static document card.
 */

export interface PdfRenderTask {
  promise: Promise<void>;
  cancel: () => void;
}

export interface PdfViewport {
  width: number;
  height: number;
}

export interface PdfPageProxy {
  getViewport: (params: { scale: number }) => PdfViewport;
  render: (params: {
    canvasContext: CanvasRenderingContext2D;
    viewport: PdfViewport;
  }) => PdfRenderTask;
  cleanup: () => void;
}

export interface PdfDocumentProxy {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfPageProxy>;
  destroy: () => Promise<void>;
}

export interface PdfDocumentLoadingTask {
  promise: Promise<PdfDocumentProxy>;
  destroy: () => Promise<void>;
}

export interface PdfjsLib {
  getDocument: (params: {
    url: string;
    withCredentials?: boolean;
    isEvalSupported?: boolean;
  }) => PdfDocumentLoadingTask;
  GlobalWorkerOptions: { workerSrc: string };
}

let pdfjsPromise: Promise<PdfjsLib | null> | null = null;

/** Test seam - the module-level cache would otherwise leak between cases. */
export const resetPdfjsCache = () => {
  pdfjsPromise = null;
};

const setupWorker = async (lib: PdfjsLib, workerSrc?: string) => {
  if (workerSrc) {
    lib.GlobalWorkerOptions.workerSrc = workerSrc;
    return;
  }

  const scope = globalThis as unknown as { pdfjsWorker?: unknown };
  if (scope.pdfjsWorker) return;

  scope.pdfjsWorker = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs');
};

export const loadPdfjs = async (workerSrc?: string): Promise<PdfjsLib | null> => {
  if (typeof window === 'undefined') return null;

  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      try {
        const module = await import('pdfjs-dist/legacy/build/pdf.mjs');
        const lib = ((module as { default?: unknown })?.default ??
          module) as unknown as PdfjsLib;

        await setupWorker(lib, workerSrc);
        return lib;
      } catch (error) {
        console.warn('[Ethora] PDF preview unavailable:', error);
        return null;
      }
    })();
  }

  return pdfjsPromise;
};
