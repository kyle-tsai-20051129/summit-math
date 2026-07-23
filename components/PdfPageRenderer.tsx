"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist";

type PdfPageRendererProps = {
  source: string;
  page: number;
  title: string;
  zoom: number;
  onPageCount: (pageCount: number) => void;
};

export function PdfPageRenderer({
  source,
  page,
  title,
  zoom,
  onPageCount,
}: PdfPageRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    let loadingTask: PDFDocumentLoadingTask | null = null;

    async function loadDocument() {
      setDocument(null);
      setStatus("loading");
      setErrorMessage("");

      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();

        loadingTask = pdfjs.getDocument(source);
        const nextDocument = await loadingTask.promise;
        if (cancelled) {
          nextDocument.destroy();
          return;
        }

        onPageCount(nextDocument.numPages);
        setDocument(nextDocument);
      } catch {
        if (!cancelled) {
          setStatus("error");
          setErrorMessage("Unable to load this PDF lesson. Please try again.");
        }
      }
    }

    void loadDocument();
    return () => {
      cancelled = true;
      loadingTask?.destroy();
    };
  }, [onPageCount, source]);

  useEffect(() => {
    const activeDocument = document;
    if (!activeDocument) {
      return;
    }
    const pdfDocument = activeDocument;

    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;
    let renderTask: { cancel: () => void } | null = null;

    async function renderPage() {
      setStatus("loading");
      try {
        const safePage = Math.min(Math.max(1, page), pdfDocument.numPages);
        const pdfPage = await pdfDocument.getPage(safePage);
        if (cancelled) {
          return;
        }

        const draw = () => {
          const container = containerRef.current;
          const canvas = canvasRef.current;
          if (!container || !canvas || cancelled) {
            return;
          }

          renderTask?.cancel();
          const bounds = container.getBoundingClientRect();
          const baseViewport = pdfPage.getViewport({ scale: 1 });
          const fitScale = Math.min(
            Math.max(bounds.width - 24, 1) / baseViewport.width,
            Math.max(bounds.height - 24, 1) / baseViewport.height,
          );
          const viewport = pdfPage.getViewport({ scale: fitScale * zoom });
          const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
          const context = canvas.getContext("2d", { alpha: false });
          if (!context) {
            return;
          }

          canvas.width = Math.floor(viewport.width * pixelRatio);
          canvas.height = Math.floor(viewport.height * pixelRatio);
          canvas.style.width = `${viewport.width}px`;
          canvas.style.height = `${viewport.height}px`;
          context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
          context.fillStyle = "#ffffff";
          context.fillRect(0, 0, viewport.width, viewport.height);
          const nextRenderTask = pdfPage.render({ canvasContext: context, viewport });
          renderTask = nextRenderTask;
          void nextRenderTask.promise
            .then(() => {
              if (!cancelled) {
                setStatus("ready");
              }
            })
            .catch((error: unknown) => {
              if (!cancelled && !(error instanceof Error && error.name === "RenderingCancelledException")) {
                setStatus("error");
                setErrorMessage("Unable to render this PDF page.");
              }
            });
        };

        draw();
        resizeObserver = new ResizeObserver(draw);
        if (containerRef.current) {
          resizeObserver.observe(containerRef.current);
        }
      } catch {
        if (!cancelled) {
          setStatus("error");
          setErrorMessage("Unable to render this PDF page.");
        }
      }
    }

    void renderPage();
    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      renderTask?.cancel();
    };
  }, [document, page, zoom]);

  return (
    <div
      className={`pdf-page-renderer ${zoom > 1 ? "is-zoomed" : ""}`}
      ref={containerRef}
      aria-label={title}
    >
      <canvas ref={canvasRef} className="pdf-page-canvas" />
      {status === "loading" ? (
        <div className="pdf-page-status" role="status">
          <Loader2 aria-hidden="true" />
          Loading page...
        </div>
      ) : null}
      {status === "error" ? <p className="pdf-page-error">{errorMessage}</p> : null}
    </div>
  );
}
