"use client";

import { Check, FileText, FileUp, Lock, MicOff, UserMinus, X } from "lucide-react";

export type HostParticipant = {
  identity: string;
  label: string;
  isMicrophoneEnabled: boolean;
};

export type WaitingRoomParticipant = {
  id: string;
  label: string;
};

export type HostLesson = {
  id: string;
  fileName: string;
  sizeBytes: number;
};

type HostControlsPanelProps = {
  participants: HostParticipant[];
  waitingParticipants: WaitingRoomParticipant[];
  isOpen: boolean;
  isLocked: boolean;
  isBusy: boolean;
  errorMessage: string;
  lessons: HostLesson[];
  lessonError: string;
  isLessonUploadBusy: boolean;
  onClose: () => void;
  onToggleLock: () => void;
  onMuteParticipant: (identity: string) => void;
  onRemoveParticipant: (identity: string) => void;
  onAdmitParticipant: (requestId: string) => void;
  onDeclineParticipant: (requestId: string) => void;
  onUploadLesson: (file: File) => void;
};

export function HostControlsPanel({
  participants,
  waitingParticipants,
  isOpen,
  isLocked,
  isBusy,
  errorMessage,
  lessons,
  lessonError,
  isLessonUploadBusy,
  onClose,
  onToggleLock,
  onMuteParticipant,
  onRemoveParticipant,
  onAdmitParticipant,
  onDeclineParticipant,
  onUploadLesson,
}: HostControlsPanelProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <aside className="host-panel" aria-label="Host controls">
      <header className="host-panel-header">
        <div>
          <p>Host controls</p>
          <h2>{isLocked ? "Room locked" : "Room open"}</h2>
        </div>
        <button type="button" onClick={onClose} aria-label="Close host controls">
          <X aria-hidden="true" />
        </button>
      </header>

      <button
        type="button"
        className={`host-lock-button ${isLocked ? "host-lock-active" : ""}`}
        onClick={onToggleLock}
        disabled={isBusy}
      >
        <Lock aria-hidden="true" />
        {isLocked ? "Unlock room" : "Lock room"}
      </button>

      {errorMessage ? <p className="host-panel-error">{errorMessage}</p> : null}

      <div className="host-lesson-list">
        <div className="host-lesson-heading">
          <p className="host-section-label">Teaching materials</p>
          <label className={`host-upload-button ${isLessonUploadBusy ? "is-busy" : ""}`}>
            <FileUp aria-hidden="true" />
            {isLessonUploadBusy ? "Uploading" : "Upload PDF"}
            <input
              type="file"
              accept="application/pdf,.pdf"
              disabled={isLessonUploadBusy}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) {
                  onUploadLesson(file);
                }
              }}
            />
          </label>
        </div>
        {lessonError ? <p className="host-panel-error">{lessonError}</p> : null}
        {lessons.length > 0 ? (
          lessons.map((lesson) => (
            <div className="host-lesson-row" key={lesson.id}>
              <FileText aria-hidden="true" />
              <span title={lesson.fileName}>{lesson.fileName}</span>
              <small>{formatLessonSize(lesson.sizeBytes)}</small>
            </div>
          ))
        ) : (
          <p className="host-panel-empty">No PDFs uploaded yet.</p>
        )}
      </div>

      <div className="host-waiting-list">
        <p className="host-section-label">Waiting to join</p>
        {waitingParticipants.length > 0 ? (
          waitingParticipants.map((participant) => (
            <div className="host-participant-row" key={participant.id}>
              <span>{participant.label}</span>
              <div>
                <button
                  type="button"
                  onClick={() => onAdmitParticipant(participant.id)}
                  disabled={isBusy}
                >
                  <Check aria-hidden="true" />
                  Admit
                </button>
                <button
                  type="button"
                  className="host-danger-button"
                  onClick={() => onDeclineParticipant(participant.id)}
                  disabled={isBusy}
                >
                  <X aria-hidden="true" />
                  Decline
                </button>
              </div>
            </div>
          ))
        ) : (
          <p className="host-panel-empty">No one is waiting to join.</p>
        )}
      </div>

      <div className="host-participant-list">
        <p className="host-section-label">In the call</p>
        {participants.length > 0 ? (
          participants.map((participant) => (
            <div className="host-participant-row" key={participant.identity}>
              <span>{participant.label}</span>
              <div>
                <button
                  type="button"
                  onClick={() => onMuteParticipant(participant.identity)}
                  disabled={isBusy || !participant.isMicrophoneEnabled}
                  title={
                    participant.isMicrophoneEnabled
                      ? "Mute participant"
                      : "Participant is already muted"
                  }
                >
                  <MicOff aria-hidden="true" />
                  Mute
                </button>
                <button
                  type="button"
                  className="host-danger-button"
                  onClick={() => onRemoveParticipant(participant.identity)}
                  disabled={isBusy}
                >
                  <UserMinus aria-hidden="true" />
                  Remove
                </button>
              </div>
            </div>
          ))
        ) : (
          <p className="host-panel-empty">No other participants yet.</p>
        )}
      </div>
    </aside>
  );
}

function formatLessonSize(sizeBytes: number) {
  return `${(sizeBytes / (1024 * 1024)).toFixed(sizeBytes < 1024 * 1024 ? 1 : 0)} MB`;
}
