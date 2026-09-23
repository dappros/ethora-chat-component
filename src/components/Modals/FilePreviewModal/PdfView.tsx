import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import Button from '../../styled/Button';
import Loader from '../../styled/Loader';

const ViewerContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  width: 100%;
  height: 100%;
  overflow: auto;
`;

const CanvasFrame = styled.div`
  display: flex;
  align-items: flex-start;
  justify-content: center;
  width: 100%;
  flex: 1 1 auto;
  min-height: 0;

  canvas {
    max-width: 100%;
    height: auto;
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.15);
    background-color: #fff;
  }
`;

const Pager = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 0 0 auto;
  font-size: 14px;
  color: var(--ethora-color-text, #141414);
`;

const PagerButton = styled(Button)`
  width: auto;
  min-width: 40px;
  padding: 0 12px;
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
 */
const PdfViewer: React.FC<PdfViewerProps> = ({ pdfUrl }) => {
  const t = useT();
  const { config } = useChatSettingState();
  const [frameRef, frameBounds] = useMeasure();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const documentRef = useRef<PdfDocumentProxy | null>(null);
  const renderTaskRef = useRef<PdfRenderTask | null>(null);

  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [pageCount, setPageCount] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);

  const width = Math.max(320, Math.floor(frameBounds.width || 0));

  useEffect(() => {
    let cancelled = false;
    let loadingTask: PdfDocumentLoadingTask | undefined;

    setStatus('loading');
    setPageNumber(1);
    setPageCount(0);

    (async () => {
      const pdfjs = await loadPdfjs(config?.pdfPreview?.workerSrc);
      if (cancelled) return;
      if (!pdfjs || !pdfUrl) {
        setStatus('error');
        return;
      }

      try {
        loadingTask = pdfjs.getDocument({ url: pdfUrl, isEvalSupported: false });
        const document = await loadingTask.promise;
        if (cancelled) {
          document.destroy().catch(() => undefined);
          return;
        }
        documentRef.current = document;
        setPageCount(document.numPages);
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
      renderTaskRef.current?.cancel();
      renderTaskRef.current = null;
      documentRef.current?.destroy?.().catch(() => undefined);
      documentRef.current = null;
      loadingTask?.destroy?.().catch(() => undefined);
    };
  }, [pdfUrl, config?.pdfPreview?.workerSrc]);

  useEffect(() => {
    const document = documentRef.current;
    const canvas = canvasRef.current;
    if (status !== 'ready' || !document || !canvas || width <= 0) return undefined;

    let cancelled = false;

    (async () => {
      try {
        const page = await document.getPage(pageNumber);
        if (cancelled) return;

        const baseViewport = page.getViewport({ scale: 1 });
        const scale = baseViewport.width ? width / baseViewport.width : 1;
        const viewport = page.getViewport({ scale });

        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));

        const context = canvas.getContext('2d');
        if (!context) {
          setStatus('error');
          return;
        }

        // A resize mid-render would otherwise paint two pages onto one canvas.
        renderTaskRef.current?.cancel();
        const task = page.render({ canvasContext: context, viewport });
        renderTaskRef.current = task;
        await task.promise;
        page.cleanup();
      } catch (error) {
        if (!cancelled) {
          console.warn('[Ethora] PDF page render failed:', error);
        }
      }
    })();

    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
      renderTaskRef.current = null;
    };
  }, [status, pageNumber, width]);

  const goPrevious = useCallback(
    () => setPageNumber((current) => Math.max(1, current - 1)),
    []
  );
  const goNext = useCallback(
    () => setPageNumber((current) => Math.min(pageCount || 1, current + 1)),
    [pageCount]
  );

  if (status === 'error') {
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

  return (
    <ViewerContainer>
      <CanvasFrame ref={frameRef}>
        {status === 'loading' ? (
          <Loader color={config?.colors?.primary} />
        ) : (
          <canvas ref={canvasRef} />
        )}
      </CanvasFrame>
      {pageCount > 1 && (
        <Pager>
          <PagerButton
            onClick={goPrevious}
            disabled={pageNumber <= 1}
            text="‹"
            aria-label={t('modal.filePreview.previousPage')}
          />
          <span>
            {pageNumber} / {pageCount}
          </span>
          <PagerButton
            onClick={goNext}
            disabled={pageNumber >= pageCount}
            text="›"
            aria-label={t('modal.filePreview.nextPage')}
          />
        </Pager>
      )}
    </ViewerContainer>
  );
};

export default PdfViewer;
