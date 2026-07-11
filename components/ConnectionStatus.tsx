"use client";

import { ConnectionQuality, ConnectionState } from "livekit-client";

type ConnectionStatusProps = {
  state: ConnectionState;
  quality: ConnectionQuality;
  errorMessage?: string;
};

export type ConnectionStatusTone = "good" | "neutral" | "warning" | "danger";

export type CallConnectionStatus = {
  label: string;
  message: string;
  tone: ConnectionStatusTone;
  showToast: boolean;
};

export function getCallConnectionStatus(
  state: ConnectionState,
  quality: ConnectionQuality,
  errorMessage?: string,
): CallConnectionStatus {
  if (errorMessage) {
    return {
      label: "Connection issue",
      message: errorMessage,
      tone: "danger",
      showToast: true,
    };
  }

  if (
    state === ConnectionState.Reconnecting ||
    state === ConnectionState.SignalReconnecting
  ) {
    return {
      label: "Reconnecting",
      message: "Trying to restore the call connection...",
      tone: "warning",
      showToast: true,
    };
  }

  if (state === ConnectionState.Connecting) {
    return {
      label: "Connecting",
      message: "Connecting to the room...",
      tone: "neutral",
      showToast: true,
    };
  }

  if (state === ConnectionState.Disconnected) {
    return {
      label: "Disconnected",
      message: "The call is disconnected.",
      tone: "danger",
      showToast: true,
    };
  }

  if (quality === ConnectionQuality.Lost) {
    return {
      label: "Connection lost",
      message: "Your network connection to the call was lost.",
      tone: "danger",
      showToast: true,
    };
  }

  if (quality === ConnectionQuality.Poor) {
    return {
      label: "Poor connection",
      message: "Your connection is unstable. Video or audio may be choppy.",
      tone: "warning",
      showToast: true,
    };
  }

  return {
    label: "Connected",
    message: "Connected",
    tone: "good",
    showToast: false,
  };
}

export function ConnectionStatus({
  state,
  quality,
  errorMessage,
}: ConnectionStatusProps) {
  const status = getCallConnectionStatus(state, quality, errorMessage);

  return (
    <span
      className={`connection-status connection-status-${status.tone}`}
      title={status.message}
    >
      <span className="connection-status-dot" aria-hidden="true" />
      {status.label}
    </span>
  );
}
