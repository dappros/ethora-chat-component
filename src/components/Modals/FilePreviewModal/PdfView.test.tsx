import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../../../test/renderWithProviders';
import { loadPdfjs } from '../../../helpers/pdf/loadPdfjs';
import PdfViewer from './PdfView';

vi.mock('../../../helpers/pdf/loadPdfjs', () => ({
  loadPdfjs: vi.fn(),
}));

type Observer = {
  callback: (entries: Array<{ target: Element; isIntersecting: boolean }>) => void;
  targets: Set<Element>;
};

// Records every observer so a test can say which pages are "in the viewport".
const observers: Observer[] = [];

class FakeIntersectionObserver {
  private readonly record: Observer;

  constructor(callback: Observer['callback']) {
    this.record = { callback, targets: new Set() };
    observers.push(this.record);
  }

  observe(target: Element) {
    this.record.targets.add(target);
  }

  unobserve(target: Element) {
    this.record.targets.delete(target);
  }

  disconnect() {
    this.record.targets.clear();
  }
}

const reportVisibility = (pages: number[], isIntersecting: boolean) => {
  const observer = observers[observers.length - 1];
  const entries = [...observer.targets]
    .filter((el) => pages.includes(Number((el as HTMLElement).dataset.pdfPage)))
    .map((target) => ({ target, isIntersecting }));
  observer.callback(entries);
};

const reportIntersecting = (pages: number[]) => reportVisibility(pages, true);

interface FakeDocumentOptions {
  holdRenders?: boolean;
}

// pdf.js stand-in: 612x792 pages, and a log of which pages were rendered and
// how each render task was cancelled.
const makeDocument = (numPages: number, options: FakeDocumentOptions = {}) => {
  const renders: Array<{ page: number; cancel: ReturnType<typeof vi.fn> }> = [];

  const getPage = vi.fn(async (pageNumber: number) => ({
    getViewport: ({ scale }: { scale: number }) => ({
      width: 612 * scale,
      height: 792 * scale,
    }),
    render: vi.fn(() => {
      const cancel = vi.fn();
      renders.push({ page: pageNumber, cancel });
      return {
        promise: options.holdRenders ? new Promise<void>(() => undefined) : Promise.resolve(),
        cancel,
      };
    }),
    cleanup: vi.fn(),
  }));

  return {
    numPages,
    getPage,
    destroy: vi.fn(() => Promise.resolve()),
    renders,
    renderedPages: () => [...new Set(renders.map((r) => r.page))].sort((a, b) => a - b),
  };
};

const installPdfjs = (doc: ReturnType<typeof makeDocument> | null) => {
  vi.mocked(loadPdfjs).mockResolvedValue(
    (doc
      ? {
          getDocument: vi.fn(() => ({
            promise: Promise.resolve(doc),
            destroy: vi.fn(() => Promise.resolve()),
          })),
          GlobalWorkerOptions: { workerSrc: '' },
        }
      : null) as never
  );
};

const pageElements = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLElement>('[data-pdf-page]'));

const renderViewer = () =>
  renderWithProviders(<PdfViewer pdfUrl="blob:test-document" />);

describe('PdfViewer continuous scroll', () => {
  beforeEach(() => {
    observers.length = 0;
    vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    // Run frame callbacks synchronously so scroll-driven state is testable.
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({})) as never;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders one placeholder per page', async () => {
    installPdfjs(makeDocument(20));
    const { container } = renderViewer();

    await waitFor(() => expect(pageElements(container)).toHaveLength(20));
    expect(pageElements(container).map((el) => el.dataset.pdfPage)).toEqual(
      Array.from({ length: 20 }, (_, i) => String(i + 1))
    );
  });

  it('renders only the pages that intersect the viewport', async () => {
    const doc = makeDocument(20);
    installPdfjs(doc);
    const { container } = renderViewer();
    await waitFor(() => expect(pageElements(container)).toHaveLength(20));

    await waitFor(() => expect(observers.length).toBeGreaterThan(0));
    act(() => reportIntersecting([1, 2]));

    await waitFor(() => expect(doc.renderedPages()).toEqual([1, 2]));
    expect(doc.renderedPages()).not.toContain(5);
  });

  it('caps rendered pages and keeps the ones nearest the reader', async () => {
    const doc = makeDocument(30);
    installPdfjs(doc);
    const { container } = renderViewer();
    await waitFor(() => expect(pageElements(container)).toHaveLength(30));

    await waitFor(() => expect(observers.length).toBeGreaterThan(0));
    act(() => reportIntersecting(Array.from({ length: 30 }, (_, i) => i + 1)));

    await waitFor(() => expect(doc.renderedPages()).toHaveLength(7));
    // Page 1 is the current page, so the nearest seven are pages 1 to 7.
    expect(doc.renderedPages()).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('updates the page indicator as the reader scrolls', async () => {
    installPdfjs(makeDocument(20));
    const { container } = renderViewer();
    await waitFor(() => expect(pageElements(container)).toHaveLength(20));
    expect(screen.getByText('1 / 20')).toBeInTheDocument();

    const scroll = screen.getByTestId('pdf-scroll');
    Object.defineProperty(scroll, 'clientHeight', { configurable: true, value: 500 });
    Object.defineProperty(scroll, 'scrollTop', {
      configurable: true,
      writable: true,
      value: 0,
    });

    // Put the top of page 7 just below the top edge of the viewport.
    const pageSevenTop = parseFloat(pageElements(container)[6].style.top);
    scroll.scrollTop = pageSevenTop - 10;
    fireEvent.scroll(scroll);

    await waitFor(() => expect(screen.getByText('7 / 20')).toBeInTheDocument());
  });

  it('zooms in with the zoom control and widens the pages', async () => {
    installPdfjs(makeDocument(5));
    const { container } = renderViewer();
    await waitFor(() => expect(pageElements(container)).toHaveLength(5));
    const initialWidth = parseFloat(pageElements(container)[0].style.width);

    fireEvent.click(screen.getByLabelText('Zoom in'));

    expect(screen.getByText('125%')).toBeInTheDocument();
    expect(parseFloat(pageElements(container)[0].style.width)).toBeCloseTo(
      initialWidth * 1.25
    );
  });

  it('cancels in-flight render tasks when the viewer unmounts', async () => {
    const doc = makeDocument(10, { holdRenders: true });
    installPdfjs(doc);
    const { container, unmount } = renderViewer();
    await waitFor(() => expect(pageElements(container)).toHaveLength(10));

    await waitFor(() => expect(observers.length).toBeGreaterThan(0));
    act(() => reportIntersecting([1]));
    await waitFor(() => expect(doc.renders).toHaveLength(1));

    unmount();

    expect(doc.renders[0].cancel).toHaveBeenCalled();
    expect(doc.destroy).toHaveBeenCalled();
  });

  it('cancels a page render when the page scrolls out of range', async () => {
    const doc = makeDocument(20, { holdRenders: true });
    installPdfjs(doc);
    const { container } = renderViewer();
    await waitFor(() => expect(pageElements(container)).toHaveLength(20));

    await waitFor(() => expect(observers.length).toBeGreaterThan(0));
    act(() => reportIntersecting([1]));
    await waitFor(() => expect(doc.renders).toHaveLength(1));

    // Page 1 leaves the viewport and page 15 arrives: page 1 gives up its canvas.
    act(() => reportVisibility([1], false));
    act(() => reportIntersecting([15]));

    await waitFor(() => expect(doc.renders[0].cancel).toHaveBeenCalled());
    expect(doc.renderedPages()).toEqual([1, 15]);
  });

  it('moves through pages with the Page Down key when focus is outside the scroll region', async () => {
    installPdfjs(makeDocument(20));
    const { container } = renderViewer();
    await waitFor(() => expect(pageElements(container)).toHaveLength(20));

    const scroll = screen.getByTestId('pdf-scroll');
    Object.defineProperty(scroll, 'clientHeight', { configurable: true, value: 500 });
    Object.defineProperty(scroll, 'scrollTop', {
      configurable: true,
      writable: true,
      value: 0,
    });

    fireEvent.keyDown(document.body, { key: 'PageDown' });

    expect(scroll.scrollTop).toBeCloseTo(450);
  });

  it('shows the fallback box when the document cannot be opened', async () => {
    installPdfjs(null);
    renderViewer();

    await waitFor(() =>
      expect(screen.getByText(/cannot be displayed here/)).toBeInTheDocument()
    );
    expect(screen.getByRole('link', { name: 'Open in a new tab' })).toBeInTheDocument();
  });
});
