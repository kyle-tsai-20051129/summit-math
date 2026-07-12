"use client";

import { MonitorUp } from "lucide-react";
import { Participant, Track } from "livekit-client";
import { ParticipantVideo } from "@/components/ParticipantVideo";

type ScreenShareStageProps = {
  participant: Participant;
  label: string;
  isLocal: boolean;
};

export function ScreenShareStage({
  participant,
  label,
  isLocal,
}: ScreenShareStageProps) {
  return (
    <section className="screen-share-stage" aria-label="Shared screen">
      <ParticipantVideo
        participant={participant}
        label={label}
        isLocal={isLocal}
        isMuted
        videoSource={Track.Source.ScreenShare}
        className="screen-share-tile"
        placeholder={
          <span className="screen-share-placeholder">
            <MonitorUp aria-hidden="true" />
            Shared screen is loading...
          </span>
        }
      />
    </section>
  );
}
