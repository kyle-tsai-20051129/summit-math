"use client";

import { Mic, MicOff, Video, VideoOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getInitials } from "@/lib/displayName";

export type JoinMediaSettings = {
  isMicEnabled: boolean;
  isCameraEnabled: boolean;
  microphoneDeviceId: string;
  cameraDeviceId: string;
  speakerDeviceId: string;
};

type JoinPreviewProps = {
  displayName: string;
  roomName: string;
  onJoin: (settings: JoinMediaSettings) => void;
};

export function JoinPreview({ displayName, roomName, onJoin }: JoinPreviewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isMicEnabled, setIsMicEnabled] = useState(true);
  const [isCameraEnabled, setIsCameraEnabled] = useState(true);
  const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([]);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [speakers, setSpeakers] = useState<MediaDeviceInfo[]>([]);
  const [microphoneDeviceId, setMicrophoneDeviceId] = useState("");
  const [cameraDeviceId, setCameraDeviceId] = useState("");
  const [speakerDeviceId, setSpeakerDeviceId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function startPreview() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("This browser does not support camera and microphone access.");
        setIsMicEnabled(false);
        setIsCameraEnabled(false);
        return;
      }

      try {
        const previewStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: true,
        });

        if (!isMounted) {
          stopStream(previewStream);
          return;
        }

        streamRef.current = previewStream;
        setStream(previewStream);
        await refreshDevices();
      } catch {
        if (isMounted) {
          setError("Camera or microphone permission was denied.");
          setIsMicEnabled(false);
          setIsCameraEnabled(false);
        }
      }
    }

    startPreview();

    return () => {
      isMounted = false;
      stopStream(streamRef.current);
      streamRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  async function refreshDevices() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const nextMicrophones = devices.filter(
      (device) => device.kind === "audioinput",
    );
    const nextCameras = devices.filter((device) => device.kind === "videoinput");
    const nextSpeakers = devices.filter(
      (device) => device.kind === "audiooutput",
    );

    setMicrophones(nextMicrophones);
    setCameras(nextCameras);
    setSpeakers(nextSpeakers);

    setMicrophoneDeviceId((currentDeviceId) =>
      currentDeviceId || nextMicrophones[0]?.deviceId || "",
    );
    setCameraDeviceId((currentDeviceId) =>
      currentDeviceId || nextCameras[0]?.deviceId || "",
    );
    setSpeakerDeviceId((currentDeviceId) =>
      currentDeviceId || nextSpeakers[0]?.deviceId || "",
    );
  }

  async function addTrack(kind: "audio" | "video", deviceId?: string) {
    try {
      const nextStream = await navigator.mediaDevices.getUserMedia({
        audio:
          kind === "audio"
            ? createDeviceConstraint(deviceId || microphoneDeviceId)
            : false,
        video:
          kind === "video"
            ? createDeviceConstraint(deviceId || cameraDeviceId)
            : false,
      });
      const currentStream = streamRef.current ?? new MediaStream();

      nextStream.getTracks().forEach((track) => currentStream.addTrack(track));
      streamRef.current = currentStream;
      setStream(new MediaStream(currentStream.getTracks()));
      setError("");
      return true;
    } catch {
      setError(
        kind === "audio"
          ? "Microphone permission was denied."
          : "Camera permission was denied.",
      );
      return false;
    }
  }

  function removeTracks(kind: "audio" | "video") {
    const currentStream = streamRef.current;

    if (!currentStream) {
      return;
    }

    currentStream
      .getTracks()
      .filter((track) => track.kind === kind)
      .forEach((track) => {
        track.stop();
        currentStream.removeTrack(track);
      });
    setStream(new MediaStream(currentStream.getTracks()));
  }

  async function toggleMicrophone() {
    if (isMicEnabled) {
      removeTracks("audio");
      setIsMicEnabled(false);
      return;
    }

    setIsMicEnabled(await addTrack("audio"));
  }

  async function toggleCamera() {
    if (isCameraEnabled) {
      removeTracks("video");
      setIsCameraEnabled(false);
      return;
    }

    setIsCameraEnabled(await addTrack("video"));
  }

  async function changeMicrophone(deviceId: string) {
    setMicrophoneDeviceId(deviceId);

    if (isMicEnabled) {
      removeTracks("audio");
      setIsMicEnabled(await addTrack("audio", deviceId));
    }
  }

  async function changeCamera(deviceId: string) {
    setCameraDeviceId(deviceId);

    if (isCameraEnabled) {
      removeTracks("video");
      setIsCameraEnabled(await addTrack("video", deviceId));
    }
  }

  function joinRoom() {
    stopStream(streamRef.current);
    streamRef.current = null;
    onJoin({
      isMicEnabled,
      isCameraEnabled,
      microphoneDeviceId,
      cameraDeviceId,
      speakerDeviceId,
    });
  }

  return (
    <main className="prejoin-page">
      <section className="prejoin-panel" aria-labelledby="prejoin-title">
        <div className="prejoin-copy">
          <p>Room code: {roomName}</p>
          <h1 id="prejoin-title">Ready to join?</h1>
        </div>

        <div className="prejoin-video">
          {isCameraEnabled && stream?.getVideoTracks().length ? (
            <video ref={videoRef} autoPlay muted playsInline />
          ) : (
            <span className="participant-avatar">
              {getInitials(displayName, "Y")}
            </span>
          )}
          <span className="prejoin-name">{displayName}</span>
        </div>

        {error ? <p className="prejoin-error">{error}</p> : null}

        <div className="prejoin-controls" aria-label="Preview controls">
          <button
            type="button"
            className={isMicEnabled ? "" : "control-off"}
            onClick={toggleMicrophone}
            title={isMicEnabled ? "Mute microphone" : "Unmute microphone"}
          >
            {isMicEnabled ? <Mic aria-hidden="true" /> : <MicOff aria-hidden="true" />}
            Audio
          </button>
          <button
            type="button"
            className={isCameraEnabled ? "" : "control-off"}
            onClick={toggleCamera}
            title={isCameraEnabled ? "Turn camera off" : "Turn camera on"}
          >
            {isCameraEnabled ? (
              <Video aria-hidden="true" />
            ) : (
              <VideoOff aria-hidden="true" />
            )}
            Video
          </button>
        </div>

        <div className="device-selectors">
          <label>
            Microphone
            <select
              value={microphoneDeviceId}
              onChange={(event) => changeMicrophone(event.target.value)}
            >
              {microphones.map((device, index) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label || `Microphone ${index + 1}`}
                </option>
              ))}
            </select>
          </label>
          <label>
            Camera
            <select
              value={cameraDeviceId}
              onChange={(event) => changeCamera(event.target.value)}
            >
              {cameras.map((device, index) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label || `Camera ${index + 1}`}
                </option>
              ))}
            </select>
          </label>
          <label>
            Speaker
            <select
              value={speakerDeviceId}
              onChange={(event) => setSpeakerDeviceId(event.target.value)}
              disabled={speakers.length === 0}
            >
              {speakers.length ? (
                speakers.map((device, index) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `Speaker ${index + 1}`}
                  </option>
                ))
              ) : (
                <option>Default speaker</option>
              )}
            </select>
          </label>
        </div>

        <button className="prejoin-submit" type="button" onClick={joinRoom}>
          Join Room
        </button>
      </section>
    </main>
  );
}

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

function createDeviceConstraint(deviceId: string): MediaTrackConstraints | true {
  if (!deviceId) {
    return true;
  }

  return {
    deviceId: { exact: deviceId },
  };
}
