"use client";

import { Loader2, RefreshCw, WifiOff } from "lucide-react";

type ReconnectOverlayProps = {
  isRetrying: boolean;
  onRetry: () => void;
};

export function ReconnectOverlay({ isRetrying, onRetry }: ReconnectOverlayProps) {
  return (
    <section className="reconnect-overlay" role="status" aria-live="assertive">
      {isRetrying ? (
        <Loader2 className="reconnect-spinner" aria-hidden="true" />
      ) : (
        <WifiOff aria-hidden="true" />
      )}
      <div>
        <h2>{isRetrying ? "Retrying connection" : "Reconnecting"}</h2>
        <p>
          {isRetrying
            ? "Trying to restore your call now..."
            : "Trying to restore your audio and video..."}
        </p>
      </div>
      <button type="button" onClick={onRetry} disabled={isRetrying}>
        <RefreshCw aria-hidden="true" />
        {isRetrying ? "Retrying" : "Retry now"}
      </button>
    </section>
  );
}
