"use client";

import { Mic, MicOff, PhoneOff, Video, VideoOff } from "lucide-react";

type CallControlsProps = {
  isMicEnabled: boolean;
  isCameraEnabled: boolean;
  isDisabled: boolean;
  onToggleMicrophone: () => void;
  onToggleCamera: () => void;
  onLeave: () => void;
};

export function CallControls({
  isMicEnabled,
  isCameraEnabled,
  isDisabled,
  onToggleMicrophone,
  onToggleCamera,
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
      <button type="button" className="leave-button" onClick={onLeave}>
        <PhoneOff aria-hidden="true" />
        <span>End</span>
      </button>
    </nav>
  );
}
