"use client";

import {
  MessageSquare,
  Mic,
  MicOff,
  MonitorUp,
  MonitorX,
  PhoneOff,
  Video,
  VideoOff,
} from "lucide-react";

type CallControlsProps = {
  isMicEnabled: boolean;
  isCameraEnabled: boolean;
  isScreenSharing: boolean;
  activeScreenShareLabel: string | null;
  isActiveScreenShareLocal: boolean;
  hasRemoteScreenShare: boolean;
  isChatOpen: boolean;
  unreadChatCount: number;
  isDisabled: boolean;
  onToggleMicrophone: () => void;
  onToggleCamera: () => void;
  onToggleScreenShare: () => void;
  onStopScreenShare: () => void;
  onToggleChat: () => void;
  onLeave: () => void;
};

export function CallControls({
  isMicEnabled,
  isCameraEnabled,
  isScreenSharing,
  activeScreenShareLabel,
  isActiveScreenShareLocal,
  hasRemoteScreenShare,
  isChatOpen,
  unreadChatCount,
  isDisabled,
  onToggleMicrophone,
  onToggleCamera,
  onToggleScreenShare,
  onStopScreenShare,
  onToggleChat,
  onLeave,
}: CallControlsProps) {
  const activeShareOwner = activeScreenShareLabel?.replace(/ is sharing$/, "") ?? "Another participant";

  return (
    <div className="call-controls-shell">
      {activeScreenShareLabel ? (
        <div className="screen-share-control-banner" role="status">
          <MonitorUp aria-hidden="true" />
          <div>
            <strong>
              {isScreenSharing ? "You are sharing" : activeScreenShareLabel}
            </strong>
            <span>
              {isScreenSharing && !isActiveScreenShareLocal
                ? `${activeShareOwner}'s shared screen is on stage. Your screen is still shared.`
                : isScreenSharing
                  ? "Your screen is visible to everyone in this call."
                  : hasRemoteScreenShare
                    ? "Their shared screen is on stage."
                    : "Shared screen is active."}
            </span>
          </div>
          {isScreenSharing ? (
            <button type="button" onClick={onStopScreenShare} title="Stop sharing screen">
              <MonitorX aria-hidden="true" />
              Stop sharing
            </button>
          ) : null}
        </div>
      ) : null}
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
      <button
        type="button"
        className={`control-button chat-control-button ${isChatOpen ? "control-active" : ""}`}
        onClick={onToggleChat}
        title={isChatOpen ? "Close chat" : "Open chat"}
        aria-pressed={isChatOpen}
      >
        <MessageSquare aria-hidden="true" />
        {unreadChatCount > 0 ? (
          <span className="chat-unread-badge" aria-label={`${unreadChatCount} unread chat messages`}>
            {unreadChatCount > 9 ? "9+" : unreadChatCount}
          </span>
        ) : null}
        <span className="sr-only">{isChatOpen ? "Close chat" : "Open chat"}</span>
        <span aria-hidden="true">Chat</span>
      </button>
      <button type="button" className="leave-button" onClick={onLeave}>
        <PhoneOff aria-hidden="true" />
        <span>End</span>
      </button>
      </nav>
    </div>
  );
}
