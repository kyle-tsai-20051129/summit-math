"use client";

import {
  Camera,
  CameraOff,
  Crown,
  Mic,
  MicOff,
  UsersRound,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { ConnectionQuality } from "livekit-client";

export type CallParticipantStatus = {
  id: string;
  label: string;
  isHost: boolean;
  isLocal: boolean;
  isMicrophoneEnabled: boolean;
  isCameraEnabled: boolean;
  connectionQuality: ConnectionQuality;
};

type ParticipantListPanelProps = {
  isOpen: boolean;
  participants: CallParticipantStatus[];
  onClose: () => void;
};

function getQualityDetails(quality: ConnectionQuality) {
  if (quality === ConnectionQuality.Excellent) {
    return { label: "Excellent", tone: "good" };
  }

  if (quality === ConnectionQuality.Good) {
    return { label: "Good", tone: "good" };
  }

  if (quality === ConnectionQuality.Poor) {
    return { label: "Poor", tone: "warning" };
  }

  if (quality === ConnectionQuality.Lost) {
    return { label: "Lost", tone: "danger" };
  }

  return { label: "Checking", tone: "neutral" };
}

export function ParticipantListPanel({
  isOpen,
  participants,
  onClose,
}: ParticipantListPanelProps) {
  if (!isOpen) {
    return null;
  }

  return (
    <aside className="participant-list-panel" aria-label="People in this call">
      <header className="participant-list-header">
        <div>
          <p>People</p>
          <h2>{participants.length} in the call</h2>
        </div>
        <button type="button" onClick={onClose} aria-label="Close people panel">
          <X aria-hidden="true" />
        </button>
      </header>

      <div className="participant-list-rows">
        {participants.map((participant) => {
          const quality = getQualityDetails(participant.connectionQuality);

          return (
            <div className="participant-list-row" key={participant.id}>
              <div className="participant-list-name">
                <span>{participant.label}{participant.isLocal ? " (You)" : ""}</span>
                {participant.isHost ? (
                  <span className="participant-host-badge">
                    <Crown aria-hidden="true" />
                    Host
                  </span>
                ) : null}
              </div>
              <div className="participant-list-statuses">
                <span title={participant.isMicrophoneEnabled ? "Microphone on" : "Microphone off"}>
                  {participant.isMicrophoneEnabled ? (
                    <Mic aria-hidden="true" />
                  ) : (
                    <MicOff className="status-off" aria-hidden="true" />
                  )}
                </span>
                <span title={participant.isCameraEnabled ? "Camera on" : "Camera off"}>
                  {participant.isCameraEnabled ? (
                    <Camera aria-hidden="true" />
                  ) : (
                    <CameraOff className="status-off" aria-hidden="true" />
                  )}
                </span>
                <span
                  className={`participant-quality participant-quality-${quality.tone}`}
                  title={`Connection quality: ${quality.label}`}
                >
                  {quality.tone === "danger" ? (
                    <WifiOff aria-hidden="true" />
                  ) : (
                    <Wifi aria-hidden="true" />
                  )}
                  {quality.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {participants.length === 0 ? (
        <div className="participant-list-empty">
          <UsersRound aria-hidden="true" />
          No participants connected yet.
        </div>
      ) : null}
    </aside>
  );
}
