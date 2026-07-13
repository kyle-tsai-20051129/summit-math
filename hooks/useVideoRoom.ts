"use client";

import {
  ConnectionQuality,
  ConnectionState,
  LocalTrackPublication,
  Participant,
  RemoteParticipant,
  Room,
  RoomEvent,
  ScreenSharePresets,
  Track,
  TrackPublication,
} from "livekit-client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RoomAccessMode } from "@/lib/roomAccess";

const chatTopic = "summit-video-chat";
const maxChatMessageLength = 500;

type TokenResponse = {
  token?: string;
  url?: string;
  identity?: string;
  isHost?: boolean;
  isRoomLocked?: boolean;
  isPasswordProtected?: boolean;
  status?: "waiting";
  requestId?: string;
  error?: string;
};

type WaitingRoomStatusResponse = {
  status?: "pending" | "admitted" | "denied";
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

async function readWaitingRoomStatus(roomName: string, requestId: string) {
  const response = await fetch(
    `/api/waiting-room?roomName=${encodeURIComponent(roomName)}&requestId=${encodeURIComponent(requestId)}`,
    { cache: "no-store" },
  );
  const result = (await response.json()) as WaitingRoomStatusResponse;

  if (!response.ok || result.error || !result.status) {
    throw new Error(result.error || "Unable to check host approval.");
  }

  return result.status;
}

type MediaErrorKind =
  | "camera"
  | "microphone"
  | "connect"
  | "room-exists"
  | "room-full"
  | "room-locked"
  | "room-password"
  | "waiting-room-denied"
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

export type ActiveScreenShare = {
  participant: Participant;
  label: string;
  isLocal: boolean;
};

export type ChatMessage = {
  id: string;
  senderIdentity: string;
  senderName: string;
  text: string;
  sentAt: number;
  isLocal: boolean;
};

type ChatPayload = {
  id: string;
  senderName: string;
  text: string;
  sentAt: number;
};

function getParticipantNoticeName(participant: Participant) {
  return participant.name || "Participant";
}

function createClientId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function normalizeChatText(text: string) {
  return text.trim().slice(0, maxChatMessageLength);
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

  if (lowerMessage.includes("room already exists")) {
    return { kind: "room-exists", message };
  }

  if (lowerMessage.includes("room is locked")) {
    return { kind: "room-locked", message };
  }

  if (lowerMessage.includes("did not admit")) {
    return { kind: "waiting-room-denied", message };
  }

  if (
    lowerMessage.includes("room requires a password") ||
    lowerMessage.includes("incorrect room password")
  ) {
    return { kind: "room-password", message };
  }

  return { kind: "connect", message };
}

function getEnabledState(
  participant: Participant,
  source: Track.Source,
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

function isScreenSharePublication(publication: TrackPublication) {
  return publication.source === Track.Source.ScreenShare;
}

function readChatPayload(payload: Uint8Array): ChatPayload | null {
  try {
    const parsedPayload = JSON.parse(new TextDecoder().decode(payload)) as
      | Partial<ChatPayload>
      | null;

    if (
      !parsedPayload ||
      typeof parsedPayload.id !== "string" ||
      typeof parsedPayload.senderName !== "string" ||
      typeof parsedPayload.text !== "string" ||
      typeof parsedPayload.sentAt !== "number"
    ) {
      return null;
    }

    const text = normalizeChatText(parsedPayload.text);

    if (!text) {
      return null;
    }

    return {
      id: parsedPayload.id,
      senderName: normalizeChatText(parsedPayload.senderName) || "Participant",
      text,
      sentAt: parsedPayload.sentAt,
    };
  } catch {
    return null;
  }
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
  roomPassword: string,
  roomAccessMode: RoomAccessMode,
  hostKey: string,
  waitingRoomEnabled: boolean,
) {
  const roomRef = useRef<Room | null>(null);
  const connectionIdRef = useRef(0);
  const waitingRequestIdRef = useRef("");
  const noticeTimeoutsRef = useRef<Map<string, number>>(new Map());
  const screenTrackEndCleanupRef = useRef<(() => void) | null>(null);
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
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [screenShareOwners, setScreenShareOwners] = useState<string[]>([]);
  const [isConnecting, setIsConnecting] = useState(true);
  const [participantNotices, setParticipantNotices] = useState<
    ParticipantNotice[]
  >([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [isHost, setIsHost] = useState(false);
  const [isRoomLocked, setIsRoomLocked] = useState(false);
  const [isPasswordProtected, setIsPasswordProtected] = useState(false);
  const [isWaitingForApproval, setIsWaitingForApproval] = useState(false);

  const localParticipant = room?.localParticipant ?? null;
  const remoteParticipant = remoteParticipants[0] ?? null;
  const visibleRemoteParticipants = remoteParticipants.slice(0, 3);
  const allParticipants = [
    ...(localParticipant ? [localParticipant] : []),
    ...visibleRemoteParticipants,
  ];
  const activeScreenShare = [...screenShareOwners]
    .reverse()
    .reduce<Participant | null>((selectedParticipant, participantIdentity) => {
      if (selectedParticipant) {
        return selectedParticipant;
      }

      const matchingParticipant = allParticipants.find(
        (participant) => participant.identity === participantIdentity,
      );

      return matchingParticipant &&
        getEnabledState(matchingParticipant, Track.Source.ScreenShare)
        ? matchingParticipant
        : null;
    }, null);
  const activeScreenShareDetails: ActiveScreenShare | null = activeScreenShare
    ? {
        participant: activeScreenShare,
        label: `${getParticipantNoticeName(activeScreenShare)} is sharing`,
        isLocal: activeScreenShare.identity === localParticipant?.identity,
      }
    : null;
  const hasRemoteScreenShare = allParticipants.some(
    (participant) =>
      participant.identity !== localParticipant?.identity &&
      getEnabledState(participant, Track.Source.ScreenShare),
  );

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
    const nextRemoteParticipants = Array.from(
      currentRoom.remoteParticipants.values(),
    );

    setRemoteParticipants(nextRemoteParticipants);
    setIsMicEnabled(
      getEnabledState(currentRoom.localParticipant, Track.Source.Microphone),
    );
    setIsCameraEnabled(
      getEnabledState(currentRoom.localParticipant, Track.Source.Camera),
    );
    setIsScreenSharing(
      getEnabledState(currentRoom.localParticipant, Track.Source.ScreenShare),
    );
    setScreenShareOwners((currentOwners) => {
      const activeOwnerIds = [
        currentRoom.localParticipant,
        ...nextRemoteParticipants,
      ]
        .filter((participant) =>
          getEnabledState(participant, Track.Source.ScreenShare),
        )
        .map((participant) => participant.identity);

      return [
        ...currentOwners.filter((identity) =>
          activeOwnerIds.includes(identity),
        ),
        ...activeOwnerIds.filter(
          (identity) => !currentOwners.includes(identity),
        ),
      ];
    });
  }, []);

  const rememberScreenShareOwner = useCallback((participant: Participant) => {
    setScreenShareOwners((currentOwners) => [
      ...currentOwners.filter((identity) => identity !== participant.identity),
      participant.identity,
    ]);
  }, []);

  const forgetScreenShareOwner = useCallback((participant: Participant) => {
    setScreenShareOwners((currentOwners) =>
      currentOwners.filter((identity) => identity !== participant.identity),
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

  const addChatMessage = useCallback((message: ChatMessage) => {
    setChatMessages((currentMessages) => {
      if (currentMessages.some((currentMessage) => currentMessage.id === message.id)) {
        return currentMessages;
      }

      return [...currentMessages.slice(-99), message];
    });
  }, []);

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

    screenTrackEndCleanupRef.current?.();
    screenTrackEndCleanupRef.current = null;

    if (currentRoom) {
      currentRoom.disconnect(true);
    }

    roomRef.current = null;
    setRoom(null);
    setRemoteParticipants([]);
    setConnectionState(ConnectionState.Disconnected);
    setConnectionQuality(ConnectionQuality.Unknown);
    setIsScreenSharing(false);
    setScreenShareOwners([]);
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

    const handleScreenShareStarted = (
      publication: TrackPublication,
      participant: Participant,
    ) => {
      if (!isCurrentConnection()) {
        return;
      }

      if (!isScreenSharePublication(publication)) {
        syncRoomStateSoon();
        return;
      }

      rememberScreenShareOwner(participant);
      if (hasCompletedInitialSync) {
        const localParticipantIsSharing = getEnabledState(
          nextRoom.localParticipant,
          Track.Source.ScreenShare,
        );
        addParticipantNotice(
          participant.identity === nextRoom.localParticipant.identity
            ? "You started sharing"
            : `${getParticipantNoticeName(participant)} started sharing${
                localParticipantIsSharing ? ". Their screen is now on stage." : ""
              }`,
        );
      }

      syncRoomStateSoon();
    };

    const handleScreenShareStopped = (
      publication: TrackPublication,
      participant: Participant,
    ) => {
      if (!isCurrentConnection()) {
        return;
      }

      if (!isScreenSharePublication(publication)) {
        syncRoomStateSoon();
        return;
      }

      forgetScreenShareOwner(participant);
      if (hasCompletedInitialSync) {
        addParticipantNotice(
          `${getParticipantNoticeName(participant)} stopped sharing`,
        );
      }

      syncRoomStateSoon();
    };

    const handleDataReceived = (
      payload: Uint8Array,
      participant?: RemoteParticipant,
      _kind?: unknown,
      topic?: string,
    ) => {
      if (!isCurrentConnection() || topic !== chatTopic || !participant) {
        return;
      }

      const chatPayload = readChatPayload(payload);

      if (!chatPayload) {
        return;
      }

      addChatMessage({
        id: chatPayload.id,
        senderIdentity: participant.identity,
        senderName:
          participant.name || chatPayload.senderName || "Participant",
        text: chatPayload.text,
        sentAt: chatPayload.sentAt,
        isLocal: false,
      });
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

        const requestToken = (admissionRequestId = "") =>
          fetch("/api/livekit-token", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              roomName,
              displayName,
              roomPassword,
              roomAccessMode,
              hostKey,
              admissionRequestId,
              waitingRoomEnabled,
            }),
          });
        let tokenResponse = await requestToken();
        let tokenData = await readTokenResponse(tokenResponse);

        if (tokenResponse.status === 202 && tokenData.status === "waiting" && tokenData.requestId) {
          waitingRequestIdRef.current = tokenData.requestId;
          setIsWaitingForApproval(true);
          setIsConnecting(false);

          let approvalStatus: WaitingRoomStatusResponse["status"] = "pending";

          while (isMounted && connectionIdRef.current === connectionId && approvalStatus === "pending") {
            await new Promise<void>((resolve) => window.setTimeout(resolve, 1800));

            if (!isMounted || connectionIdRef.current !== connectionId) {
              return;
            }

            approvalStatus = await readWaitingRoomStatus(roomName, tokenData.requestId);
          }

          if (approvalStatus === "denied") {
            throw new Error("The host did not admit this request.");
          }

          if (!isMounted || connectionIdRef.current !== connectionId) {
            return;
          }

          setIsWaitingForApproval(false);
          waitingRequestIdRef.current = "";
          setIsConnecting(true);
          tokenResponse = await requestToken(tokenData.requestId);
          tokenData = await readTokenResponse(tokenResponse);
        }

        if (!tokenResponse.ok || tokenData.error) {
          throw new Error(tokenData.error || "Failed to create room token.");
        }

        if (!tokenData.token || !tokenData.url) {
          throw new Error("Failed to create room token.");
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
          .on(RoomEvent.TrackPublished, handleScreenShareStarted)
          .on(RoomEvent.TrackUnpublished, handleScreenShareStopped)
          .on(RoomEvent.TrackSubscribed, syncRoomStateSoon)
          .on(RoomEvent.TrackUnsubscribed, syncRoomStateSoon)
          .on(RoomEvent.TrackMuted, handleScreenShareStopped)
          .on(RoomEvent.TrackUnmuted, handleScreenShareStarted)
          .on(RoomEvent.LocalTrackPublished, handleScreenShareStarted)
          .on(RoomEvent.LocalTrackUnpublished, handleScreenShareStopped)
          .on(RoomEvent.DataReceived, handleDataReceived)
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
        setIsHost(Boolean(tokenData.isHost));
        setIsRoomLocked(Boolean(tokenData.isRoomLocked));
        setIsPasswordProtected(Boolean(tokenData.isPasswordProtected));
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
          setIsHost(false);
          setIsPasswordProtected(false);
          setIsWaitingForApproval(false);
          waitingRequestIdRef.current = "";
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
      screenTrackEndCleanupRef.current?.();
      screenTrackEndCleanupRef.current = null;
    };
  }, [
    roomName,
    displayName,
    initialMediaSettings.isMicEnabled,
    initialMediaSettings.isCameraEnabled,
    initialMediaSettings.microphoneDeviceId,
    initialMediaSettings.cameraDeviceId,
    initialMediaSettings.speakerDeviceId,
    roomPassword,
    roomAccessMode,
    hostKey,
    waitingRoomEnabled,
    connectionRevision,
    updateParticipants,
    addParticipantNotice,
    addChatMessage,
    forgetScreenShareOwner,
    rememberScreenShareOwner,
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

  const cancelWaitingRoomRequest = useCallback(async () => {
    const requestId = waitingRequestIdRef.current;

    if (!requestId) {
      return;
    }

    waitingRequestIdRef.current = "";
    setIsWaitingForApproval(false);

    await fetch(
      `/api/waiting-room?roomName=${encodeURIComponent(roomName)}&requestId=${encodeURIComponent(requestId)}`,
      { method: "DELETE", keepalive: true },
    ).catch(() => undefined);
  }, [roomName]);

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

  const stopScreenShare = useCallback(async () => {
    const currentRoom = roomRef.current;

    screenTrackEndCleanupRef.current?.();
    screenTrackEndCleanupRef.current = null;

    if (!currentRoom) {
      setIsScreenSharing(false);
      return;
    }

    try {
      await currentRoom.localParticipant.setScreenShareEnabled(false);
      forgetScreenShareOwner(currentRoom.localParticipant);
      setIsScreenSharing(false);
      updateParticipants();
    } catch {
      addParticipantNotice("Unable to stop screen sharing.");
    }
  }, [addParticipantNotice, forgetScreenShareOwner, updateParticipants]);

  const toggleScreenShare = useCallback(async () => {
    const currentRoom = roomRef.current;

    if (!currentRoom) {
      return;
    }

    if (isScreenSharing) {
      await stopScreenShare();
      return;
    }

    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices ||
      !("getDisplayMedia" in navigator.mediaDevices)
    ) {
      addParticipantNotice("This browser does not support screen sharing.");
      return;
    }

    try {
      const publication =
        await currentRoom.localParticipant.setScreenShareEnabled(
          true,
          {
            audio: false,
            contentHint: "detail",
            resolution: ScreenSharePresets.original.resolution,
          },
          {
            screenShareEncoding: ScreenSharePresets.original.encoding,
          },
        );

      if (!publication) {
        addParticipantNotice("Unable to start screen sharing. Please try again.");
        return;
      }

      screenTrackEndCleanupRef.current?.();
      const nativeTrack = publication.track?.mediaStreamTrack;

      if (nativeTrack) {
        const handleNativeTrackEnded = () => {
          void stopScreenShare();
        };

        nativeTrack.addEventListener("ended", handleNativeTrackEnded, {
          once: true,
        });
        screenTrackEndCleanupRef.current = () => {
          nativeTrack.removeEventListener("ended", handleNativeTrackEnded);
        };
      }

      rememberScreenShareOwner(currentRoom.localParticipant);
      setIsScreenSharing(true);
      updateParticipants();
    } catch (caughtError) {
      const message =
        caughtError instanceof Error ? caughtError.message.toLowerCase() : "";

      if (
        message.includes("permission") ||
        message.includes("denied") ||
        message.includes("cancel") ||
        message.includes("notallowed")
      ) {
        addParticipantNotice("Screen sharing was cancelled or blocked.");
        return;
      }

      addParticipantNotice("Unable to start screen sharing. Please try again.");
    }
  }, [
    addParticipantNotice,
    isScreenSharing,
    rememberScreenShareOwner,
    stopScreenShare,
    updateParticipants,
  ]);

  const sendChatMessage = useCallback(
    async (text: string) => {
      const currentRoom = roomRef.current;
      const normalizedText = normalizeChatText(text);

      if (!currentRoom || !normalizedText) {
        return false;
      }

      const chatPayload: ChatPayload = {
        id: createClientId(),
        senderName:
          currentRoom.localParticipant.name || displayName || "You",
        text: normalizedText,
        sentAt: Date.now(),
      };

      try {
        await currentRoom.localParticipant.publishData(
          new TextEncoder().encode(JSON.stringify(chatPayload)),
          {
            reliable: true,
            topic: chatTopic,
          },
        );

        addChatMessage({
          ...chatPayload,
          senderIdentity: currentRoom.localParticipant.identity,
          isLocal: true,
        });

        return true;
      } catch {
        addParticipantNotice("Unable to send chat message.");
        return false;
      }
    },
    [addChatMessage, addParticipantNotice, displayName],
  );

  return useMemo(
    () => ({
      room,
      localParticipant,
      remoteParticipant,
      remoteParticipants: visibleRemoteParticipants,
      activeScreenShare: activeScreenShareDetails,
      hasRemoteScreenShare,
      connectionState,
      connectionQuality,
      error,
      isConnecting,
      isMicEnabled,
      isCameraEnabled,
      isScreenSharing,
      isHost,
      isRoomLocked,
      isPasswordProtected,
      setIsRoomLocked,
      isWaitingForApproval,
      cancelWaitingRoomRequest,
      hasRemoteParticipant: remoteParticipants.length > 0,
      participantNotices,
      chatMessages,
      participantCount:
        visibleRemoteParticipants.length + (localParticipant ? 1 : 0),
      dismissParticipantNotice,
      sendChatMessage,
      toggleMicrophone,
      toggleCamera,
      toggleScreenShare,
      stopScreenShare,
      disconnect,
    }),
    [
      room,
      localParticipant,
      remoteParticipant,
      visibleRemoteParticipants,
      activeScreenShareDetails,
      hasRemoteScreenShare,
      connectionState,
      connectionQuality,
      error,
      isConnecting,
      isMicEnabled,
      isCameraEnabled,
      isScreenSharing,
      isHost,
      isRoomLocked,
      isPasswordProtected,
      isWaitingForApproval,
      cancelWaitingRoomRequest,
      remoteParticipants.length,
      participantNotices,
      chatMessages,
      dismissParticipantNotice,
      sendChatMessage,
      toggleMicrophone,
      toggleCamera,
      toggleScreenShare,
      stopScreenShare,
      disconnect,
    ],
  );
}
