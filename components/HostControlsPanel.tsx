"use client";

import { Lock, MicOff, UserMinus, X } from "lucide-react";

export type HostParticipant = {
  identity: string;
  label: string;
  isMicrophoneEnabled: boolean;
};

type HostControlsPanelProps = {
  participants: HostParticipant[];
  isOpen: boolean;
  isLocked: boolean;
  isBusy: boolean;
  errorMessage: string;
  onClose: () => void;
  onToggleLock: () => void;
  onMuteParticipant: (identity: string) => void;
  onRemoveParticipant: (identity: string) => void;
};

export function HostControlsPanel({
  participants,
  isOpen,
  isLocked,
  isBusy,
  errorMessage,
  onClose,
  onToggleLock,
  onMuteParticipant,
  onRemoveParticipant,
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

      <div className="host-participant-list">
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
