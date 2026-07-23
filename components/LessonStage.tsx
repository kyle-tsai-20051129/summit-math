"use client";

import {
  ChevronLeft,
  ChevronRight,
  FileText,
  Square,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useEffect, useState } from "react";
import { PdfPageRenderer } from "@/components/PdfPageRenderer";

type LessonStageProps = {
  roomName: string;
  lessonId: string;
  lessonName: string;
  page: number;
  accessToken: string;
  isHost: boolean;
  onSetPage: (page: number) => void;
  onStopPresenting: () => void;
};

export function LessonStage({
  roomName,
  lessonId,
  lessonName,
  page,
  accessToken,
  isHost,
  onSetPage,
  onStopPresenting,
}: LessonStageProps) {
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const source = `/api/lessons/view?roomName=${encodeURIComponent(roomName)}&lessonId=${encodeURIComponent(lessonId)}&accessToken=${encodeURIComponent(accessToken)}`;

  useEffect(() => {
    setPageCount(null);
    setZoom(1);
  }, [lessonId]);

  return (
    <section className="lesson-stage" aria-label={`Presented lesson: ${lessonName}`}>
      <header className="lesson-stage-header">
        <div>
          <FileText aria-hidden="true" />
          <span title={lessonName}>{lessonName}</span>
        </div>
        <span>{isHost ? "You are presenting" : "Host is presenting"}</span>
      </header>
      <PdfPageRenderer
        source={source}
        page={page}
        title={`${lessonName}, page ${page}`}
        zoom={zoom}
        onPageCount={setPageCount}
      />
      <footer className="lesson-stage-controls">
        {isHost ? (
          <>
            <button
              type="button"
              aria-label="Previous page"
              title="Previous page"
              onClick={() => onSetPage(Math.max(1, page - 1))}
              disabled={page <= 1}
            >
              <ChevronLeft aria-hidden="true" />
            </button>
            {pageCount ? (
              <label className="lesson-page-picker">
                <span>Page</span>
                <select
                  value={page}
                  onChange={(event) => onSetPage(Number(event.target.value))}
                  aria-label="Choose lesson page"
                >
                  {Array.from({ length: pageCount }, (_, index) => index + 1).map(
                    (pageNumber) => (
                      <option key={pageNumber} value={pageNumber}>
                        {pageNumber} of {pageCount}
                      </option>
                    ),
                  )}
                </select>
              </label>
            ) : (
              <span>Page {page}</span>
            )}
            <button
              type="button"
              aria-label="Next page"
              title="Next page"
              onClick={() => onSetPage(page + 1)}
              disabled={pageCount !== null && page >= pageCount}
            >
              <ChevronRight aria-hidden="true" />
            </button>
            <ZoomControls zoom={zoom} onZoomChange={setZoom} />
            <button type="button" className="lesson-stop-button" onClick={onStopPresenting}>
              <Square aria-hidden="true" />
              Stop lesson
            </button>
          </>
        ) : (
          <>
            <span>Page {page}{pageCount ? ` of ${pageCount}` : ""}</span>
            <ZoomControls zoom={zoom} onZoomChange={setZoom} />
          </>
        )}
      </footer>
    </section>
  );
}

function ZoomControls({
  zoom,
  onZoomChange,
}: {
  zoom: number;
  onZoomChange: (zoom: number) => void;
}) {
  const changeZoom = (change: number) => {
    onZoomChange(Math.min(2, Math.max(0.6, Number((zoom + change).toFixed(1)))));
  };

  return (
    <span className="lesson-zoom-controls">
      <button
        type="button"
        aria-label="Zoom out"
        title="Zoom out"
        onClick={() => changeZoom(-0.2)}
        disabled={zoom <= 0.6}
      >
        <ZoomOut aria-hidden="true" />
      </button>
      <button
        type="button"
        className="lesson-fit-button"
        title="Fit page to stage"
        onClick={() => onZoomChange(1)}
      >
        {Math.round(zoom * 100)}%
      </button>
      <button
        type="button"
        aria-label="Zoom in"
        title="Zoom in"
        onClick={() => changeZoom(0.2)}
        disabled={zoom >= 2}
      >
        <ZoomIn aria-hidden="true" />
      </button>
    </span>
  );
}
