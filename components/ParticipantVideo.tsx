"use client";

import { Participant, Track } from "livekit-client";
import { ReactNode, useEffect, useRef } from "react";

type ParticipantVideoProps = {
  participant: Participant | null;
  label: string;
  isLocal: boolean;
  isMuted?: boolean;
  audioOutputDeviceId?: string;
  className?: string;
  placeholder: ReactNode;
};

export function ParticipantVideo({
  participant,
  label,
  isLocal,
  isMuted = false,
  audioOutputDeviceId = "",
  className = "",
  placeholder,
}: ParticipantVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const videoPublication = participant?.getTrackPublication(Track.Source.Camera);
  const audioPublication = participant?.getTrackPublication(Track.Source.Microphone);
  const videoTrack = videoPublication?.track;
  const audioTrack = audioPublication?.track;
  const hasVideo = Boolean(videoTrack && !videoPublication?.isMuted);

  useEffect(() => {
    const videoElement = videoRef.current;

    if (!videoElement || !videoTrack) {
      return;
    }

    videoTrack.attach(videoElement);

    return () => {
      videoTrack.detach(videoElement);
    };
  }, [videoTrack]);

  useEffect(() => {
    const audioElement = audioRef.current;

    if (!audioElement || !audioTrack || isLocal) {
      return;
    }

    audioTrack.attach(audioElement);

    return () => {
      audioTrack.detach(audioElement);
    };
  }, [audioTrack, isLocal]);

  useEffect(() => {
    const audioElement = audioRef.current;

    if (!audioElement || !audioOutputDeviceId || !("setSinkId" in audioElement)) {
      return;
    }

    audioElement
      .setSinkId(audioOutputDeviceId)
      .catch(() => {
        // Some browsers only allow speaker selection in secure contexts.
      });
  }, [audioOutputDeviceId]);

  return (
    <article
      className={`video-tile ${isLocal ? "local-tile" : "remote-tile"} ${className}`}
    >
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isMuted}
        className={hasVideo ? "video-visible" : "video-hidden"}
      />
      {!isLocal ? <audio ref={audioRef} autoPlay /> : null}
      {!hasVideo ? <div className="video-placeholder">{placeholder}</div> : null}
      <div className="tile-label">{label}</div>
    </article>
  );
}
