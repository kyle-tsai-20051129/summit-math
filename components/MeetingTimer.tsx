"use client";

import { Clock3 } from "lucide-react";
import { useEffect, useState } from "react";

type MeetingTimerProps = {
  startedAt: number | null;
};

function formatDuration(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const time = [minutes, seconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");

  return hours > 0 ? `${String(hours).padStart(2, "0")}:${time}` : time;
}

export function MeetingTimer({ startedAt }: MeetingTimerProps) {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    if (!startedAt) {
      setNow(null);
      return;
    }

    const updateTime = () => setNow(Date.now());

    updateTime();
    const interval = window.setInterval(updateTime, 1000);

    return () => window.clearInterval(interval);
  }, [startedAt]);

  const elapsedSeconds = startedAt && now
    ? Math.max(0, Math.floor((now - startedAt) / 1000))
    : 0;

  return (
    <span className="meeting-timer" title="Call duration">
      <Clock3 aria-hidden="true" />
      {formatDuration(elapsedSeconds)}
    </span>
  );
}
