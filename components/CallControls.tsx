"use client";

import { Mic, MicOff, MonitorUp, PhoneOff, Video, VideoOff } from "lucide-react";

type CallControlsProps = {
  isMicEnabled: boolean;
  isCameraEnabled: boolean;
  isScreenSharing: boolean;
  isDisabled: boolean;
  onToggleMicrophone: () => void;
  onToggleCamera: () => void;
  onToggleScreenShare: () => void;
  onLeave: () => void;
};

export function CallControls({
  isMicEnabled,
  isCameraEnabled,
  isScreenSharing,
  isDisabled,
  onToggleMicrophone,
  onToggleCamera,
  onToggleScreenShare,
  onLeave,
}: CallControlsProps) {
  return (
    <nav className="call-controls" aria-label="Call controls">
      <button
        type="button"
        className={`control-button ${isMicEnabled ? "" : "control-off"}`}
        onClick={onToggleMicrophone}
        disabled={isDisabled}
        title={isMicEnabled ? "Mute microphone" : "Unmute microphone"}
        aria-pressed={!isMicEnabled}
      >
        {isMicEnabled ? <Mic aria-hidden="true" /> : <MicOff aria-hidden="true" />}
        <span className="sr-only">
          {isMicEnabled ? "Mute microphone" : "Unmute microphone"}
        </span>
        <span aria-hidden="true">Audio</span>
      </button>
      <button
        type="button"
        className={`control-button ${isCameraEnabled ? "" : "control-off"}`}
        onClick={onToggleCamera}
        disabled={isDisabled}
        title={isCameraEnabled ? "Turn camera off" : "Turn camera on"}
        aria-pressed={!isCameraEnabled}
      >
        {isCameraEnabled ? (
          <Video aria-hidden="true" />
        ) : (
          <VideoOff aria-hidden="true" />
        )}
        <span className="sr-only">
          {isCameraEnabled ? "Turn camera off" : "Turn camera on"}
        </span>
        <span aria-hidden="true">Video</span>
      </button>
      <button
        type="button"
        className={`control-button ${isScreenSharing ? "control-active" : ""}`}
        onClick={onToggleScreenShare}
        disabled={isDisabled}
        title={isScreenSharing ? "Stop sharing screen" : "Share screen"}
        aria-pressed={isScreenSharing}
      >
        <MonitorUp aria-hidden="true" />
        <span className="sr-only">
          {isScreenSharing ? "Stop sharing screen" : "Share screen"}
        </span>
        <span aria-hidden="true">{isScreenSharing ? "Stop share" : "Share"}</span>
      </button>
      <button type="button" className="leave-button" onClick={onLeave}>
        <PhoneOff aria-hidden="true" />
        <span>End</span>
      </button>
    </nav>
  );
}
