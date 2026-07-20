"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { PDFDocumentLoadingTask } from "pdfjs-dist";

type PdfPageRendererProps = {
  source: string;
  page: number;
  title: string;
  onPageCount: (pageCount: number) => void;
};

export function PdfPageRenderer({
  source,
  page,
  title,
  onPageCount,
}: PdfPageRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;
    let loadingTask: PDFDocumentLoadingTask | null = null;
    let renderTask: { cancel: () => void } | null = null;

    async function renderPage() {
      setStatus("loading");
      setErrorMessage("");

      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();

        const nextLoadingTask = pdfjs.getDocument(source);
        loadingTask = nextLoadingTask;
        const document = await nextLoadingTask.promise;
        if (cancelled) {
          document.destroy();
          return;
        }

        onPageCount(document.numPages);
        const safePage = Math.min(Math.max(1, page), document.numPages);
        const pdfPage = await document.getPage(safePage);

        const draw = () => {
          const container = containerRef.current;
          const canvas = canvasRef.current;
          if (!container || !canvas || cancelled) {
            return;
          }

          renderTask?.cancel();
          const bounds = container.getBoundingClientRect();
          const baseViewport = pdfPage.getViewport({ scale: 1 });
          const scale = Math.min(
            Math.max(bounds.width - 24, 1) / baseViewport.width,
            Math.max(bounds.height - 24, 1) / baseViewport.height,
          );
          const viewport = pdfPage.getViewport({ scale });
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
          const nextRenderTask = pdfPage.render({
            canvasContext: context,
            viewport,
          });
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
          setErrorMessage("Unable to load this PDF lesson.");
        }
      }
    }

    void renderPage();
    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      renderTask?.cancel();
      loadingTask?.destroy();
    };
  }, [onPageCount, page, source]);

  return (
    <div className="pdf-page-renderer" ref={containerRef} aria-label={title}>
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
