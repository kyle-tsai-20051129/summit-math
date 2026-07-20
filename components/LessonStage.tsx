"use client";

import { ChevronLeft, ChevronRight, FileText, Square } from "lucide-react";
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
  const source = `/api/lessons/view?roomName=${encodeURIComponent(roomName)}&lessonId=${encodeURIComponent(lessonId)}&accessToken=${encodeURIComponent(accessToken)}`;

  useEffect(() => {
    setPageCount(null);
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
            <span>Page {page}</span>
            <button
              type="button"
              aria-label="Next page"
              title="Next page"
              onClick={() => onSetPage(page + 1)}
              disabled={pageCount !== null && page >= pageCount}
            >
              <ChevronRight aria-hidden="true" />
            </button>
            <button type="button" className="lesson-stop-button" onClick={onStopPresenting}>
              <Square aria-hidden="true" />
              Stop lesson
            </button>
          </>
        ) : (
            <span>Page {page}{pageCount ? ` of ${pageCount}` : ""}</span>
        )}
      </footer>
    </section>
  );
}
