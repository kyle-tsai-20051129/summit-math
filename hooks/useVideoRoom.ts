"use client";

import {
  ConnectionQuality,
  ConnectionState,
  LocalTrackPublication,
  Participant,
  RemoteParticipant,
  Room,
  RoomEvent,
  Track,
} from "livekit-client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type TokenResponse = {
  token: string;
  url: string;
  identity: string;
  error?: string;
};

type RoomStateResponse = {
  participantCount: number;
  identities: string[];
  error?: string;
};

async function readTokenResponse(response: Response): Promise<TokenResponse> {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return (await response.json()) as TokenResponse;
  }

  const responseText = await response.text();
  const details = responseText.includes("<!DOCTYPE")
    ? "The server returned an HTML error page instead of a LiveKit token."
    : responseText.slice(0, 200);

  throw new Error(
    `${details} Restart the local dev server and try joining again.`,
  );
}

async function readRoomState(roomName: string): Promise<RoomStateResponse> {
  const response = await fetch(
    `/api/livekit-room-state?roomName=${encodeURIComponent(roomName)}`,
    { cache: "no-store" },
  );
  const roomState = (await response.json()) as RoomStateResponse;

  if (!response.ok || roomState.error) {
    throw new Error(roomState.error || "Failed to check the room state.");
  }

  return roomState;
}

type MediaErrorKind =
  | "camera"
  | "microphone"
  | "connect"
  | "room-full"
  | "unsupported"
  | "invalid-room"
  | "configuration";

export type VideoRoomError = {
  kind: MediaErrorKind;
  message: string;
};

export type ParticipantNotice = {
  id: string;
  message: string;
};

function getParticipantNoticeName(participant: Participant) {
  return participant.name || "Participant";
}

function toVideoRoomError(error: unknown, fallback: string): VideoRoomError {
  const message = error instanceof Error ? error.message : fallback;
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes("permission") || lowerMessage.includes("denied")) {
    return {
      kind: "camera",
      message:
        "Camera or microphone permission was denied. Allow access in your browser and try again.",
    };
  }

  if (lowerMessage.includes("livekit is not configured")) {
    return { kind: "configuration", message };
  }

  if (lowerMessage.includes("invalid room")) {
    return { kind: "invalid-room", message };
  }

  if (
    lowerMessage.includes("room is full") ||
    lowerMessage.includes("room full") ||
    lowerMessage.includes("up to 4 people")
  ) {
    return { kind: "room-full", message };
  }

  return { kind: "connect", message };
}

function getEnabledState(
  participant: Participant,
  source: Track.Source.Camera | Track.Source.Microphone,
) {
  const publication = participant.getTrackPublication(source);

  if (!publication) {
    return false;
  }

  if (publication instanceof LocalTrackPublication) {
    return !publication.isMuted;
  }

  return !publication.isMuted;
}

type InitialMediaSettings = {
  isMicEnabled: boolean;
  isCameraEnabled: boolean;
  microphoneDeviceId: string;
  cameraDeviceId: string;
  speakerDeviceId: string;
};

export function useVideoRoom(
  roomName: string,
  displayName: string,
  initialMediaSettings: InitialMediaSettings,
) {
  const roomRef = useRef<Room | null>(null);
  const connectionIdRef = useRef(0);
  const noticeTimeoutsRef = useRef<Map<string, number>>(new Map());
  const [connectionRevision, setConnectionRevision] = useState(0);
  const [room, setRoom] = useState<Room | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>(
    ConnectionState.Disconnected,
  );
  const [connectionQuality, setConnectionQuality] = useState<ConnectionQuality>(
    ConnectionQuality.Unknown,
  );
  const [remoteParticipants, setRemoteParticipants] = useState<
    RemoteParticipant[]
  >([]);
  const [error, setError] = useState<VideoRoomError | null>(null);
  const [isMicEnabled, setIsMicEnabled] = useState(
    initialMediaSettings.isMicEnabled,
  );
  const [isCameraEnabled, setIsCameraEnabled] = useState(
    initialMediaSettings.isCameraEnabled,
  );
  const [isConnecting, setIsConnecting] = useState(true);
  const [participantNotices, setParticipantNotices] = useState<
    ParticipantNotice[]
  >([]);

  const localParticipant = room?.localParticipant ?? null;
  const remoteParticipant = remoteParticipants[0] ?? null;
  const visibleRemoteParticipants = remoteParticipants.slice(0, 3);

  const updateParticipants = useCallback(() => {
    const currentRoom = roomRef.current;

    if (!currentRoom) {
      setRemoteParticipants([]);
      setConnectionState(ConnectionState.Disconnected);
      setConnectionQuality(ConnectionQuality.Unknown);
      return;
    }

    setConnectionState(currentRoom.state);
    setConnectionQuality(currentRoom.localParticipant.connectionQuality);
    setRemoteParticipants(Array.from(currentRoom.remoteParticipants.values()));
    setIsMicEnabled(
      getEnabledState(currentRoom.localParticipant, Track.Source.Microphone),
    );
    setIsCameraEnabled(
      getEnabledState(currentRoom.localParticipant, Track.Source.Camera),
    );
  }, []);

  const dismissParticipantNotice = useCallback((noticeId: string) => {
    const timeoutId = noticeTimeoutsRef.current.get(noticeId);

    if (timeoutId) {
      window.clearTimeout(timeoutId);
      noticeTimeoutsRef.current.delete(noticeId);
    }

    setParticipantNotices((currentNotices) =>
      currentNotices.filter((notice) => notice.id !== noticeId),
    );
  }, []);

  const addParticipantNotice = useCallback(
    (message: string) => {
      const noticeId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

      setParticipantNotices((currentNotices) => [
        ...currentNotices.slice(-2),
        { id: noticeId, message },
      ]);

      const timeoutId = window.setTimeout(() => {
        dismissParticipantNotice(noticeId);
      }, 3600);

      noticeTimeoutsRef.current.set(noticeId, timeoutId);
    },
    [dismissParticipantNotice],
  );

  useEffect(
    () => () => {
      noticeTimeoutsRef.current.forEach((timeoutId) => {
        window.clearTimeout(timeoutId);
      });
      noticeTimeoutsRef.current.clear();
    },
    [],
  );

  const disconnect = useCallback(() => {
    const currentRoom = roomRef.current;

    if (currentRoom) {
      currentRoom.disconnect(true);
    }

    roomRef.current = null;
    setRoom(null);
    setRemoteParticipants([]);
    setConnectionState(ConnectionState.Disconnected);
    setConnectionQuality(ConnectionQuality.Unknown);
  }, []);

  useEffect(() => {
    let isMounted = true;
    let participantSyncInterval: number | null = null;
    let recoveryInterval: number | null = null;
    let staleRoomChecks = 0;
    let isCheckingRoomState = false;
    let hasCompletedInitialSync = false;
    const connectionId = connectionIdRef.current + 1;
    connectionIdRef.current = connectionId;
    const nextRoom = new Room({
      adaptiveStream: true,
      dynacast: true,
    });
    const isCurrentConnection = () =>
      isMounted &&
      connectionIdRef.current === connectionId &&
      roomRef.current === nextRoom;

    const syncRoomState = () => {
      if (isCurrentConnection()) {
        updateParticipants();
      }
    };

    const syncRoomStateSoon = () => {
      syncRoomState();
      window.setTimeout(syncRoomState, 250);
      window.setTimeout(syncRoomState, 1000);
    };

    const handleConnected = () => {
      if (!isCurrentConnection()) {
        return;
      }

      syncRoomStateSoon();
    };

    const handleDisconnected = () => {
      if (!isCurrentConnection()) {
        return;
      }

      setConnectionState(ConnectionState.Disconnected);
      setConnectionQuality(ConnectionQuality.Unknown);
      syncRoomStateSoon();
    };

    const handleConnectionStateChanged = (state: ConnectionState) => {
      if (!isCurrentConnection()) {
        return;
      }

      setConnectionState(state);
      syncRoomStateSoon();
    };

    const handleConnectionQualityChanged = (
      quality: ConnectionQuality,
      participant: Participant,
    ) => {
      if (
        isCurrentConnection() &&
        participant.identity === nextRoom.localParticipant.identity
      ) {
        setConnectionQuality(quality);
      }
    };

    const handleParticipantConnected = (participant: RemoteParticipant) => {
      if (!isCurrentConnection()) {
        return;
      }

      if (hasCompletedInitialSync) {
        addParticipantNotice(`${getParticipantNoticeName(participant)} joined`);
      }

      syncRoomStateSoon();
    };

    const handleParticipantDisconnected = (participant: RemoteParticipant) => {
      if (!isCurrentConnection()) {
        return;
      }

      if (hasCompletedInitialSync) {
        addParticipantNotice(`${getParticipantNoticeName(participant)} left`);
      }

      syncRoomStateSoon();
    };

    const recoverIfRoomStateIsStale = async () => {
      if (!isCurrentConnection() || isCheckingRoomState) {
        return;
      }

      const currentRoom = roomRef.current;

      if (!currentRoom) {
        return;
      }

      isCheckingRoomState = true;

      try {
        const roomState = await readRoomState(roomName);

        if (!isCurrentConnection()) {
          return;
        }

        const localParticipantCount = currentRoom.remoteParticipants.size + 1;
        const serverHasMoreParticipants =
          roomState.participantCount > localParticipantCount;
        const serverStillSeesThisParticipant = roomState.identities.includes(
          currentRoom.localParticipant.identity,
        );
        const localConnectionLooksStale =
          currentRoom.state === ConnectionState.Disconnected &&
          serverStillSeesThisParticipant;

        if (serverHasMoreParticipants || localConnectionLooksStale) {
          staleRoomChecks += 1;
        } else {
          staleRoomChecks = 0;
        }

        if (staleRoomChecks >= 2) {
          staleRoomChecks = 0;
          setConnectionRevision((revision) => revision + 1);
        }
      } catch {
        staleRoomChecks = 0;
      } finally {
        isCheckingRoomState = false;
      }
    };

    async function connect() {
      if (
        typeof navigator === "undefined" ||
        !navigator.mediaDevices?.getUserMedia
      ) {
        setError({
          kind: "unsupported",
          message:
            "This browser does not support camera and microphone access. Try a current version of Chrome, Edge, Firefox, or Safari.",
        });
        setIsConnecting(false);
        return;
      }

      try {
        setError(null);
        setConnectionState(ConnectionState.Connecting);

        const tokenResponse = await fetch("/api/livekit-token", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ roomName, displayName }),
        });
        const tokenData = await readTokenResponse(tokenResponse);

        if (!tokenResponse.ok || tokenData.error) {
          throw new Error(tokenData.error || "Failed to create room token.");
        }

        if (!isMounted || connectionIdRef.current !== connectionId) {
          return;
        }

        roomRef.current = nextRoom;
        nextRoom
          .on(RoomEvent.Connected, handleConnected)
          .on(RoomEvent.Reconnected, handleConnected)
          .on(RoomEvent.ConnectionStateChanged, handleConnectionStateChanged)
          .on(
            RoomEvent.ConnectionQualityChanged,
            handleConnectionQualityChanged,
          )
          .on(RoomEvent.ParticipantConnected, handleParticipantConnected)
          .on(RoomEvent.ParticipantDisconnected, handleParticipantDisconnected)
          .on(RoomEvent.ParticipantActive, syncRoomStateSoon)
          .on(RoomEvent.ParticipantNameChanged, syncRoomStateSoon)
          .on(RoomEvent.TrackPublished, syncRoomStateSoon)
          .on(RoomEvent.TrackUnpublished, syncRoomStateSoon)
          .on(RoomEvent.TrackSubscribed, syncRoomStateSoon)
          .on(RoomEvent.TrackUnsubscribed, syncRoomStateSoon)
          .on(RoomEvent.TrackMuted, syncRoomStateSoon)
          .on(RoomEvent.TrackUnmuted, syncRoomStateSoon)
          .on(RoomEvent.LocalTrackPublished, syncRoomStateSoon)
          .on(RoomEvent.LocalTrackUnpublished, syncRoomStateSoon)
          .on(RoomEvent.Disconnected, handleDisconnected);

        await nextRoom.connect(tokenData.url, tokenData.token);

        if (!isCurrentConnection()) {
          nextRoom.disconnect(true);
          return;
        }

        syncRoomState();

        if (initialMediaSettings.speakerDeviceId) {
          await nextRoom
            .switchActiveDevice("audiooutput", initialMediaSettings.speakerDeviceId)
            .catch(() => undefined);
        }

        await nextRoom.localParticipant.setMicrophoneEnabled(
          initialMediaSettings.isMicEnabled,
          initialMediaSettings.microphoneDeviceId
            ? { deviceId: { exact: initialMediaSettings.microphoneDeviceId } }
            : undefined,
        );
        await nextRoom.localParticipant.setCameraEnabled(
          initialMediaSettings.isCameraEnabled,
          initialMediaSettings.cameraDeviceId
            ? { deviceId: { exact: initialMediaSettings.cameraDeviceId } }
            : undefined,
        );

        if (!isCurrentConnection()) {
          nextRoom.disconnect(true);
          return;
        }

        setRoom(nextRoom);
        setConnectionQuality(nextRoom.localParticipant.connectionQuality);
        syncRoomState();
        hasCompletedInitialSync = true;
        participantSyncInterval = window.setInterval(syncRoomState, 1000);
        recoveryInterval = window.setInterval(recoverIfRoomStateIsStale, 2500);
      } catch (caughtError) {
        if (isMounted && connectionIdRef.current === connectionId) {
          setError(
            toVideoRoomError(caughtError, "Failed to connect to the room."),
          );
          nextRoom.disconnect(true);
          if (roomRef.current === nextRoom) {
            roomRef.current = null;
          }
          setRoom(null);
          setConnectionState(ConnectionState.Disconnected);
          setConnectionQuality(ConnectionQuality.Unknown);
        }
      } finally {
        if (isMounted) {
          setIsConnecting(false);
        }
      }
    }

    connect();

    return () => {
      isMounted = false;
      if (participantSyncInterval) {
        window.clearInterval(participantSyncInterval);
      }
      if (recoveryInterval) {
        window.clearInterval(recoveryInterval);
      }
      nextRoom.removeAllListeners();
      nextRoom.disconnect(true);
      if (roomRef.current === nextRoom) {
        roomRef.current = null;
      }
    };
  }, [
    roomName,
    displayName,
    initialMediaSettings.isMicEnabled,
    initialMediaSettings.isCameraEnabled,
    initialMediaSettings.microphoneDeviceId,
    initialMediaSettings.cameraDeviceId,
    initialMediaSettings.speakerDeviceId,
    connectionRevision,
    updateParticipants,
  ]);

  const toggleMicrophone = useCallback(async () => {
    const currentRoom = roomRef.current;

    if (!currentRoom) {
      return;
    }

    try {
      await currentRoom.localParticipant.setMicrophoneEnabled(!isMicEnabled);
      updateParticipants();
    } catch (caughtError) {
      setError({
        kind: "microphone",
        message:
          caughtError instanceof Error
            ? caughtError.message
            : "Unable to update the microphone.",
      });
    }
  }, [isMicEnabled, updateParticipants]);

  const toggleCamera = useCallback(async () => {
    const currentRoom = roomRef.current;

    if (!currentRoom) {
      return;
    }

    try {
      await currentRoom.localParticipant.setCameraEnabled(!isCameraEnabled);
      updateParticipants();
    } catch (caughtError) {
      setError({
        kind: "camera",
        message:
          caughtError instanceof Error
            ? caughtError.message
            : "Unable to update the camera.",
      });
    }
  }, [isCameraEnabled, updateParticipants]);

  return useMemo(
    () => ({
      room,
      localParticipant,
      remoteParticipant,
      remoteParticipants: visibleRemoteParticipants,
      connectionState,
      connectionQuality,
      error,
      isConnecting,
      isMicEnabled,
      isCameraEnabled,
      hasRemoteParticipant: remoteParticipants.length > 0,
      participantNotices,
      participantCount:
        visibleRemoteParticipants.length + (localParticipant ? 1 : 0),
      dismissParticipantNotice,
      toggleMicrophone,
      toggleCamera,
      disconnect,
    }),
    [
      room,
      localParticipant,
      remoteParticipant,
      visibleRemoteParticipants,
      connectionState,
      connectionQuality,
      error,
      isConnecting,
      isMicEnabled,
      isCameraEnabled,
      remoteParticipants.length,
      participantNotices,
      dismissParticipantNotice,
      toggleMicrophone,
      toggleCamera,
      disconnect,
    ],
  );
}
