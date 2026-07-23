"use client";

import { Copy, Loader2, Send, ShieldCheck, UsersRound } from "lucide-react";
import { Track } from "livekit-client";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { CallControls } from "@/components/CallControls";
import { ChatPanel } from "@/components/ChatPanel";
import {
  HostControlsPanel,
  HostLesson,
  HostParticipant,
} from "@/components/HostControlsPanel";
import {
  ConnectionStatus,
  getCallConnectionStatus,
} from "@/components/ConnectionStatus";
import { JoinMediaSettings, JoinPreview } from "@/components/JoinPreview";
import { MeetingInvitePanel } from "@/components/MeetingInvitePanel";
import { MeetingTimer } from "@/components/MeetingTimer";
import {
  CallParticipantStatus,
  ParticipantListPanel,
} from "@/components/ParticipantListPanel";
import { ParticipantVideo } from "@/components/ParticipantVideo";
import { ReconnectOverlay } from "@/components/ReconnectOverlay";
import { LessonStage } from "@/components/LessonStage";
import { ScreenShareStage } from "@/components/ScreenShareStage";
import { useVideoRoom } from "@/hooks/useVideoRoom";
import {
  displayNameStorageKey,
  getInitials,
  isValidDisplayName,
  normalizeDisplayName,
} from "@/lib/displayName";
import { isValidRoomName, normalizeRoomName } from "@/lib/room";
import {
  getRoomAccessModeStorageKey,
  getRoomHostKeyStorageKey,
  getRoomHostRecoveryNoticeStorageKey,
  getRoomPasswordStorageKey,
  getRoomWaitingRoomStorageKey,
  isRoomAccessMode,
  isValidRoomPassword,
  normalizeRoomPassword,
  RoomAccessMode,
} from "@/lib/roomAccess";
import { copyText, getRoomUrl } from "@/lib/share";

type VideoRoomProps = {
  roomId: string;
};

export function VideoRoom({ roomId }: VideoRoomProps) {
  const router = useRouter();
  const roomName = useMemo(() => normalizeRoomName(roomId), [roomId]);
  const isValid = isValidRoomName(roomName);
  const [displayName, setDisplayName] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [nameError, setNameError] = useState("");
  const [joinSettings, setJoinSettings] = useState<JoinMediaSettings | null>(
    null,
  );
  const [roomPassword, setRoomPassword] = useState("");
  const [roomAccessMode, setRoomAccessMode] =
    useState<RoomAccessMode>("join");
  const [hostKey, setHostKey] = useState("");
  const [showHostRecoveryKey, setShowHostRecoveryKey] = useState(false);
  const [waitingRoomEnabled, setWaitingRoomEnabled] = useState(false);

  useEffect(() => {
    const storedDisplayName = window.localStorage.getItem(displayNameStorageKey);

    if (storedDisplayName && isValidDisplayName(storedDisplayName)) {
      const normalizedDisplayName = normalizeDisplayName(storedDisplayName);
      setDisplayName(normalizedDisplayName);
      setNameInput(normalizedDisplayName);
    }
  }, []);

  useEffect(() => {
    if (!isValid) {
      return;
    }

    const storedRoomPassword = window.sessionStorage.getItem(
      getRoomPasswordStorageKey(roomName),
    );
    const storedAccessMode = window.sessionStorage.getItem(
      getRoomAccessModeStorageKey(roomName),
    );
    const hostKeyStorageKey = getRoomHostKeyStorageKey(roomName);
    const storedHostKey = window.sessionStorage.getItem(hostKeyStorageKey);
    const hostRecoveryNoticeStorageKey =
      getRoomHostRecoveryNoticeStorageKey(roomName);
    const hasPendingHostRecoveryNotice =
      window.sessionStorage.getItem(hostRecoveryNoticeStorageKey) === "pending";
    const storedWaitingRoomEnabled = window.sessionStorage.getItem(
      getRoomWaitingRoomStorageKey(roomName),
    );

    if (storedRoomPassword && isValidRoomPassword(storedRoomPassword)) {
      setRoomPassword(normalizeRoomPassword(storedRoomPassword));
    }

    const nextRoomAccessMode =
      storedAccessMode && isRoomAccessMode(storedAccessMode)
        ? storedAccessMode
        : "join";

    if (nextRoomAccessMode === "create") {
      setRoomAccessMode(nextRoomAccessMode);
    }
    window.sessionStorage.removeItem(getRoomAccessModeStorageKey(roomName));

    if (storedHostKey) {
      setHostKey(storedHostKey);
    }

    setShowHostRecoveryKey(
      nextRoomAccessMode === "create" &&
        Boolean(storedHostKey) &&
        hasPendingHostRecoveryNotice,
    );

    // Remove credentials created by older versions that shared host access across tabs.
    window.localStorage.removeItem(hostKeyStorageKey);

    // This setting only applies to the immediately preceding Create-room flow.
    setWaitingRoomEnabled(
      nextRoomAccessMode === "create" && storedWaitingRoomEnabled === "true",
    );
    window.sessionStorage.removeItem(getRoomWaitingRoomStorageKey(roomName));
  }, [isValid, roomName]);

  function saveDisplayName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedDisplayName = normalizeDisplayName(nameInput);

    if (!isValidDisplayName(normalizedDisplayName)) {
      setNameError("Enter a display name between 1 and 40 characters.");
      return;
    }

    window.localStorage.setItem(displayNameStorageKey, normalizedDisplayName);
    setDisplayName(normalizedDisplayName);
    setNameError("");
  }

  if (!isValid) {
    return (
      <main className="room-page">
        <section className="room-message">
          <h1>Invalid room name</h1>
          <p>Use 1-64 letters, numbers, hyphens, or underscores.</p>
          <button type="button" onClick={() => router.push("/")}>
            Return home
          </button>
        </section>
      </main>
    );
  }

  if (!displayName) {
    return (
      <main className="call-page">
        <section className="name-gate" aria-labelledby="name-gate-title">
          <h1 id="name-gate-title">Enter your name</h1>
          <p>
            Room code: <strong>{roomName}</strong>
          </p>
          <form onSubmit={saveDisplayName}>
            <label htmlFor="room-display-name">Display name</label>
            <input
              id="room-display-name"
              autoComplete="name"
              autoFocus
              value={nameInput}
              onChange={(event) => {
                setNameInput(event.target.value);
                setNameError("");
              }}
              placeholder="Kyle"
            />
            {nameError ? <p className="form-error">{nameError}</p> : null}
            <button type="submit" disabled={!normalizeDisplayName(nameInput)}>
              Continue
            </button>
          </form>
        </section>
      </main>
    );
  }

  if (showHostRecoveryKey && hostKey) {
    return (
      <HostRecoveryKeyScreen
        roomName={roomName}
        hostRecoveryKey={hostKey}
        onContinue={() => {
          window.sessionStorage.removeItem(
            getRoomHostRecoveryNoticeStorageKey(roomName),
          );
          setShowHostRecoveryKey(false);
        }}
      />
    );
  }

  if (!joinSettings) {
    return (
      <JoinPreview
        displayName={displayName}
        roomName={roomName}
        onJoin={setJoinSettings}
      />
    );
  }

  return (
    <VideoRoomCall
      roomName={roomName}
      displayName={displayName}
      initialMediaSettings={joinSettings}
      roomPassword={roomPassword}
      roomAccessMode={roomAccessMode}
      hostKey={hostKey}
      waitingRoomEnabled={waitingRoomEnabled}
      onRoomPasswordChange={setRoomPassword}
    />
  );
}

type VideoRoomCallProps = {
  roomName: string;
  displayName: string;
  initialMediaSettings: JoinMediaSettings;
  roomPassword: string;
  roomAccessMode: RoomAccessMode;
  hostKey: string;
  waitingRoomEnabled: boolean;
  onRoomPasswordChange: (roomPassword: string) => void;
};

function VideoRoomCall({
  roomName,
  displayName,
  initialMediaSettings,
  roomPassword,
  roomAccessMode,
  hostKey,
  waitingRoomEnabled,
  onRoomPasswordChange,
}: VideoRoomCallProps) {
  const router = useRouter();
  const videoRoom = useVideoRoom(
    roomName,
    displayName,
    initialMediaSettings,
    roomPassword,
    roomAccessMode,
    hostKey,
    waitingRoomEnabled,
  );
  const [isInvitePanelOpen, setIsInvitePanelOpen] = useState(false);
  const [isParticipantListOpen, setIsParticipantListOpen] = useState(false);
  const [inviteCopyStatus, setInviteCopyStatus] = useState<
    "link" | "code" | "password" | "invite" | ""
  >("");
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isHostPanelOpen, setIsHostPanelOpen] = useState(false);
  const [isHostActionBusy, setIsHostActionBusy] = useState(false);
  const [hostActionError, setHostActionError] = useState("");
  const [waitingParticipants, setWaitingParticipants] = useState<
    { id: string; label: string }[]
  >([]);
  const [lessons, setLessons] = useState<HostLesson[]>([]);
  const [lessonError, setLessonError] = useState("");
  const [isLessonUploadBusy, setIsLessonUploadBusy] = useState(false);
  const [isLessonActionBusy, setIsLessonActionBusy] = useState(false);
  const [activeLesson, setActiveLesson] = useState<{
    lesson: Pick<HostLesson, "id" | "fileName">;
    page: number;
  } | null>(null);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const seenChatMessageCountRef = useRef(0);
  const callStatus = getCallConnectionStatus(
    videoRoom.connectionState,
    videoRoom.connectionQuality,
    videoRoom.error?.message,
  );
  const callParticipants = [
    ...(videoRoom.localParticipant
      ? [
          {
            id: "local",
            participant: videoRoom.localParticipant,
            label: videoRoom.localParticipant.name || displayName,
            isLocal: true,
            placeholderLabel: getInitials(
              videoRoom.localParticipant.name || displayName,
              "Y",
            ),
          },
        ]
      : []),
    ...videoRoom.remoteParticipants.map((participant, index) => ({
      id: participant.identity,
      participant,
      label: participant.name || `Participant ${index + 2}`,
      isLocal: false,
      placeholderLabel: getInitials(participant.name ?? "", String(index + 2)),
    })),
  ];
  const visibleCount = callParticipants.length;
  const hasActiveScreenShare = Boolean(videoRoom.activeScreenShare);
  const hostParticipants: HostParticipant[] = videoRoom.remoteParticipants.map(
    (participant, index) => ({
      identity: participant.identity,
      label: participant.name || `Participant ${index + 2}`,
      isMicrophoneEnabled: !participant.getTrackPublication(
        Track.Source.Microphone,
      )?.isMuted,
    }),
  );
  const participantStatuses: CallParticipantStatus[] = callParticipants.map(
    (callParticipant) => ({
      id: callParticipant.id,
      label: callParticipant.label,
      isLocal: callParticipant.isLocal,
      isHost:
        callParticipant.isLocal
          ? videoRoom.isHost
          : isHostParticipant(callParticipant.participant.metadata ?? ""),
      isMicrophoneEnabled: !callParticipant.participant.getTrackPublication(
        Track.Source.Microphone,
      )?.isMuted,
      isCameraEnabled: !callParticipant.participant.getTrackPublication(
        Track.Source.Camera,
      )?.isMuted,
      connectionQuality: callParticipant.isLocal
        ? videoRoom.connectionQuality
        : callParticipant.participant.connectionQuality,
    }),
  );

  function leaveRoom() {
    void videoRoom.cancelWaitingRoomRequest();
    videoRoom.disconnect();
    window.sessionStorage.removeItem(getRoomHostKeyStorageKey(roomName));
    router.push("/");
  }

  function toggleChat() {
    setIsChatOpen((currentValue) => {
      const nextValue = !currentValue;

      if (nextValue) {
        setUnreadChatCount(0);
      }

      return nextValue;
    });
  }

  async function copyInviteValue(
    value: string,
    status: "link" | "code" | "password" | "invite",
  ) {
    await copyText(value);
    setInviteCopyStatus(status);
    window.setTimeout(() => setInviteCopyStatus(""), 1600);
  }

  function getInvitationText() {
    const lines = [
      "Join my Summit Video call",
      `Room code: ${roomName}`,
      `Room link: ${getRoomUrl(roomName)}`,
    ];

    if (videoRoom.isPasswordProtected) {
      lines.push(
        videoRoom.isHost && roomPassword
          ? `Password: ${roomPassword}`
          : "Password: Ask the host for the room password.",
      );
    }

    return lines.join("\n");
  }

  async function runHostAction(
    action: "lock" | "remove" | "mute" | "admit" | "deny",
    options: { targetIdentity?: string; locked?: boolean } = {},
  ) {
    if (!videoRoom.isHost || !hostKey) {
      setHostActionError("Host controls are only available to the room creator.");
      return;
    }

    setIsHostActionBusy(true);
    setHostActionError("");

    try {
      const response = await fetch("/api/host-controls", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          roomName,
          hostKey,
          action,
          ...options,
        }),
      });
      const result = (await response.json()) as {
        locked?: boolean;
        message?: string;
        error?: string;
      };

      if (!response.ok || result.error) {
        throw new Error(result.error || "Host action failed.");
      }

      if (typeof result.locked === "boolean") {
        videoRoom.setIsRoomLocked(result.locked);
      }

      if (result.message) {
        window.setTimeout(() => setHostActionError(""), 2200);
      }

      if (action === "admit" || action === "deny") {
        setWaitingParticipants((currentParticipants) =>
          currentParticipants.filter(
            (participant) => participant.id !== options.targetIdentity,
          ),
        );
      }
    } catch (caughtError) {
      setHostActionError(
        caughtError instanceof Error
          ? caughtError.message
          : "Host action failed.",
      );
    } finally {
      setIsHostActionBusy(false);
    }
  }

  async function uploadLesson(file: File) {
    if (!videoRoom.isHost || !hostKey) {
      setLessonError("Only the room host can upload teaching materials.");
      return;
    }

    if (file.size > 25 * 1024 * 1024 || !file.name.toLowerCase().endsWith(".pdf")) {
      setLessonError("Select a PDF no larger than 25 MB.");
      return;
    }

    const signature = await file.slice(0, 5).text();
    if (signature !== "%PDF-") {
      setLessonError("Select a valid PDF file.");
      return;
    }

    setIsLessonUploadBusy(true);
    setLessonError("");

    try {
      const uploadResponse = await fetch("/api/lessons/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomName,
          hostKey,
          fileName: file.name,
          contentType: file.type || "application/pdf",
          sizeBytes: file.size,
        }),
      });
      const uploadResult = (await uploadResponse.json()) as {
        uploadId?: string;
        uploadUrl?: string;
        uploadMode?: "local" | "s3";
        error?: string;
      };

      if (!uploadResponse.ok || !uploadResult.uploadId || !uploadResult.uploadUrl) {
        throw new Error(uploadResult.error || "Unable to prepare the PDF upload.");
      }

      const objectResponse = await fetch(uploadResult.uploadUrl, {
        method: "PUT",
        headers:
          uploadResult.uploadMode === "local"
            ? {
                "Content-Type": "application/pdf",
                "x-room-name": roomName,
                "x-host-key": hostKey,
                "x-upload-id": uploadResult.uploadId,
              }
            : { "Content-Type": "application/pdf" },
        body: file,
      });

      if (!objectResponse.ok) {
        throw new Error("The PDF upload failed. Check the storage CORS settings and try again.");
      }

      const finalizeResponse = await fetch("/api/lessons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomName,
          hostKey,
          action: "finalize",
          uploadId: uploadResult.uploadId,
        }),
      });
      const finalizeResult = (await finalizeResponse.json()) as {
        lesson?: HostLesson;
        error?: string;
      };

      if (!finalizeResponse.ok || !finalizeResult.lesson) {
        throw new Error(finalizeResult.error || "Unable to save the uploaded PDF.");
      }

      setLessons((currentLessons) => [finalizeResult.lesson!, ...currentLessons]);
    } catch (error) {
      setLessonError(
        error instanceof Error ? error.message : "Unable to upload the PDF.",
      );
    } finally {
      setIsLessonUploadBusy(false);
    }
  }

  async function updateLessonPresentation(
    action: "show" | "page" | "hide",
    lessonId = activeLesson?.lesson.id ?? "",
    page = activeLesson?.page ?? 1,
  ) {
    if (!videoRoom.isHost || !hostKey) {
      return;
    }

    setLessonError("");
    try {
      const response = await fetch("/api/lesson-presentation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomName, hostKey, action, lessonId, page }),
      });
      const result = (await response.json()) as {
        presentation?: { lesson: Pick<HostLesson, "id" | "fileName">; page: number } | null;
        error?: string;
      };
      if (!response.ok || result.error) {
        throw new Error(result.error || "Unable to update the presented lesson.");
      }
      setActiveLesson(result.presentation ?? null);
      await videoRoom.notifyLessonPresentationUpdated();
    } catch (error) {
      setLessonError(
        error instanceof Error ? error.message : "Unable to update the presented lesson.",
      );
    }
  }

  function downloadLesson(lessonId: string) {
    if (!videoRoom.lessonAccessToken) {
      setLessonError("Lesson access is not ready yet. Please try again.");
      return;
    }

    // Load the PDF engine before a host starts presenting, reducing first-page delay.
    void import("pdfjs-dist");

    const source = `/api/lessons/view?roomName=${encodeURIComponent(roomName)}&lessonId=${encodeURIComponent(lessonId)}&accessToken=${encodeURIComponent(videoRoom.lessonAccessToken)}&download=1`;
    window.open(source, "_blank", "noopener,noreferrer");
  }

  async function removeLesson(lessonId: string) {
    if (!videoRoom.isHost || !hostKey) {
      return;
    }

    const lesson = lessons.find((currentLesson) => currentLesson.id === lessonId);
    if (!lesson || !window.confirm(`Remove ${lesson.fileName}? This cannot be undone.`)) {
      return;
    }

    setIsLessonActionBusy(true);
    setLessonError("");
    try {
      const response = await fetch("/api/lessons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomName, hostKey, action: "remove", lessonId }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok || result.error) {
        throw new Error(result.error || "Unable to remove the PDF.");
      }

      setLessons((currentLessons) =>
        currentLessons.filter((currentLesson) => currentLesson.id !== lessonId),
      );
      if (activeLesson?.lesson.id === lessonId) {
        setActiveLesson(null);
      }
    } catch (error) {
      setLessonError(error instanceof Error ? error.message : "Unable to remove the PDF.");
    } finally {
      setIsLessonActionBusy(false);
    }
  }

  useEffect(() => {
    const previousMessageCount = seenChatMessageCountRef.current;
    const nextMessages = videoRoom.chatMessages.slice(previousMessageCount);

    if (!isChatOpen) {
      const remoteUnreadMessages = nextMessages.filter(
        (message) => !message.isLocal,
      ).length;

      if (remoteUnreadMessages > 0) {
        setUnreadChatCount((currentCount) =>
          Math.min(99, currentCount + remoteUnreadMessages),
        );
      }
    }

    seenChatMessageCountRef.current = videoRoom.chatMessages.length;
  }, [isChatOpen, videoRoom.chatMessages]);

  useEffect(() => {
    if (isChatOpen) {
      setUnreadChatCount(0);
    }
  }, [isChatOpen]);

  useEffect(() => {
    let active = true;

    if (!videoRoom.isHost || !hostKey) {
      setLessons([]);
      return () => {
        active = false;
      };
    }

    const loadLessons = async () => {
      const response = await fetch("/api/lessons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomName, hostKey, action: "list" }),
      });
      const result = (await response.json()) as {
        lessons?: HostLesson[];
        error?: string;
      };

      if (!response.ok || result.error) {
        throw new Error(result.error || "Unable to load teaching materials.");
      }

      if (active) {
        setLessons(result.lessons ?? []);
      }
    };

    void loadLessons().catch((error) => {
      if (active) {
        setLessonError(
          error instanceof Error ? error.message : "Unable to load teaching materials.",
        );
      }
    });

    return () => {
      active = false;
    };
  }, [hostKey, roomName, videoRoom.isHost]);

  useEffect(() => {
    let active = true;

    if (!videoRoom.lessonAccessToken) {
      setActiveLesson(null);
      return () => {
        active = false;
      };
    }

    const loadPresentation = async () => {
      const response = await fetch(
        `/api/lesson-presentation?roomName=${encodeURIComponent(roomName)}&accessToken=${encodeURIComponent(videoRoom.lessonAccessToken)}`,
        { cache: "no-store" },
      );
      const result = (await response.json()) as {
        presentation?: { lesson: Pick<HostLesson, "id" | "fileName">; page: number } | null;
      };
      if (response.ok && active) {
        setActiveLesson(result.presentation ?? null);
      }
    };

    void loadPresentation();
    const intervalId = window.setInterval(() => void loadPresentation(), 5000);
    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [
    roomName,
    videoRoom.lessonAccessToken,
    videoRoom.lessonPresentationRevision,
  ]);

  useEffect(() => {
    if (!videoRoom.isHost || !hostKey) {
      setWaitingParticipants([]);
      return;
    }

    let active = true;

    const loadWaitingParticipants = async () => {
      try {
        const response = await fetch("/api/host-controls", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomName, hostKey, action: "waiting" }),
        });
        const result = (await response.json()) as {
          requests?: { id: string; label: string }[];
        };

        if (active && response.ok && result.requests) {
          setWaitingParticipants(result.requests);
        }
      } catch {
        // Keep the last visible waiting-room list if a refresh briefly fails.
      }
    };

    void loadWaitingParticipants();
    const interval = window.setInterval(loadWaitingParticipants, 1800);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [hostKey, roomName, videoRoom.isHost]);

  if (videoRoom.isWaitingForApproval) {
    return (
      <main className="call-page call-access-page">
        <section className="room-full-screen" aria-labelledby="waiting-room-title">
          <p className="room-full-eyebrow">Room code: {roomName}</p>
          <h1 id="waiting-room-title">Waiting for host approval</h1>
          <p>The host will let you into the call when they are ready.</p>
          <button type="button" className="room-secondary-action" onClick={leaveRoom}>
            Return home
          </button>
        </section>
      </main>
    );
  }

  if (videoRoom.error?.kind === "waiting-room-denied") {
    return (
      <main className="call-page call-access-page">
        <section className="room-full-screen" aria-labelledby="waiting-room-denied-title">
          <p className="room-full-eyebrow">Room code: {roomName}</p>
          <h1 id="waiting-room-denied-title">Unable to join this call</h1>
          <p>{videoRoom.error.message}</p>
          <button type="button" onClick={leaveRoom}>
            Return home
          </button>
        </section>
      </main>
    );
  }

  if (videoRoom.error?.kind === "room-full") {
    return (
      <main className="call-page call-access-page">
        <section className="room-full-screen" aria-labelledby="room-full-title">
          <p className="room-full-eyebrow">Room code: {roomName}</p>
          <h1 id="room-full-title">This room is full</h1>
          <p>
            Up to 4 people can join this video room at the same time. Ask
            someone to leave, or create a different room.
          </p>
          <button type="button" onClick={leaveRoom}>
            Return home
          </button>
        </section>
      </main>
    );
  }

  if (videoRoom.error?.kind === "room-password") {
    return (
      <RoomPasswordScreen
        roomName={roomName}
        errorMessage={videoRoom.error.message}
        onSubmit={(nextPassword) => {
          const normalizedPassword = normalizeRoomPassword(nextPassword);

          window.sessionStorage.setItem(
            getRoomPasswordStorageKey(roomName),
            normalizedPassword,
          );
          onRoomPasswordChange(normalizedPassword);
        }}
        onReturnHome={leaveRoom}
      />
    );
  }

  if (videoRoom.error?.kind === "room-exists") {
    return (
      <main className="call-page call-access-page">
        <section className="room-full-screen" aria-labelledby="room-exists-title">
          <p className="room-full-eyebrow">Room code: {roomName}</p>
          <h1 id="room-exists-title">Room already exists</h1>
          <p>
            A room with this code is already active. Return home and choose
            Join room, or create a different room code.
          </p>
          <button type="button" onClick={leaveRoom}>
            Return home
          </button>
        </section>
      </main>
    );
  }

  if (videoRoom.error?.kind === "room-locked") {
    return (
      <main className="call-page call-access-page">
        <section className="room-full-screen" aria-labelledby="room-locked-title">
          <p className="room-full-eyebrow">Room code: {roomName}</p>
          <h1 id="room-locked-title">Room locked</h1>
          <p>The host locked this room. Ask the host to unlock it before joining.</p>
          <button type="button" onClick={leaveRoom}>
            Return home
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="call-page">
      <header className="call-topbar">
        <strong>Summit Video</strong>
        <span className="room-code">
          Room code: <strong>{roomName}</strong>
        </span>
        <MeetingTimer startedAt={videoRoom.callStartedAt} />
        <ConnectionStatus
          state={videoRoom.connectionState}
          quality={videoRoom.connectionQuality}
          errorMessage={videoRoom.error?.message}
        />
        {videoRoom.isHost ? (
          <button
            className="topbar-copy-button host-topbar-button"
            type="button"
            onClick={() => setIsHostPanelOpen((isOpen) => !isOpen)}
            title="Host controls"
          >
            <ShieldCheck aria-hidden="true" size={16} />
            Host
          </button>
        ) : null}
        <button
          className="topbar-copy-button people-topbar-button"
          type="button"
          onClick={() => setIsParticipantListOpen((isOpen) => !isOpen)}
          title="People in this call"
        >
          <UsersRound aria-hidden="true" size={16} />
          People
        </button>
        <button
          className="topbar-copy-button invite-topbar-button"
          type="button"
          onClick={() => setIsInvitePanelOpen(true)}
          title="Invite participants"
        >
          <Send aria-hidden="true" size={16} />
          Invite
        </button>
      </header>

      <MeetingInvitePanel
        isOpen={isInvitePanelOpen}
        roomCode={roomName}
        roomLink={getRoomUrl(roomName)}
        isPasswordProtected={videoRoom.isPasswordProtected}
        password={roomPassword}
        canSharePassword={videoRoom.isHost && Boolean(roomPassword)}
        copyStatus={inviteCopyStatus}
        onClose={() => setIsInvitePanelOpen(false)}
        onCopyLink={() => void copyInviteValue(getRoomUrl(roomName), "link")}
        onCopyCode={() => void copyInviteValue(roomName, "code")}
        onCopyPassword={() => void copyInviteValue(roomPassword, "password")}
        onCopyInvite={() => void copyInviteValue(getInvitationText(), "invite")}
      />

      <ParticipantListPanel
        isOpen={isParticipantListOpen}
        participants={participantStatuses}
        onClose={() => setIsParticipantListOpen(false)}
      />

      {videoRoom.isRecoveringConnection ? (
        <ReconnectOverlay
          isRetrying={videoRoom.isRetrying}
          onRetry={videoRoom.retryConnection}
        />
      ) : null}

      {callStatus.showToast ? (
        <div
          className={`call-status-toast call-status-toast-${callStatus.tone}`}
          role={videoRoom.error ? "alert" : "status"}
        >
          <strong>{callStatus.label}</strong>
          <span>{callStatus.message}</span>
        </div>
      ) : null}

      {videoRoom.participantNotices.length > 0 ? (
        <div className="participant-event-toasts" aria-live="polite">
          {videoRoom.participantNotices.map((notice) => (
            <div className="participant-event-toast" key={notice.id}>
              <span>{notice.message}</span>
              <button
                type="button"
                onClick={() => videoRoom.dismissParticipantNotice(notice.id)}
                aria-label="Dismiss notification"
              >
                Dismiss
              </button>
            </div>
          ))}
        </div>
      ) : null}

      <ChatPanel
        messages={videoRoom.chatMessages}
        isOpen={isChatOpen}
        isDisabled={videoRoom.isConnecting}
        onClose={() => setIsChatOpen(false)}
        onSendMessage={videoRoom.sendChatMessage}
      />

      {videoRoom.isHost ? (
        <HostControlsPanel
          participants={hostParticipants}
          waitingParticipants={waitingParticipants}
          isOpen={isHostPanelOpen}
          isLocked={videoRoom.isRoomLocked}
          isBusy={isHostActionBusy}
          errorMessage={hostActionError}
          lessons={lessons}
          lessonError={lessonError}
          isLessonUploadBusy={isLessonUploadBusy}
          isLessonActionBusy={isLessonActionBusy}
          activeLessonId={activeLesson?.lesson.id ?? null}
          onClose={() => setIsHostPanelOpen(false)}
          onToggleLock={() =>
            runHostAction("lock", { locked: !videoRoom.isRoomLocked })
          }
          onMuteParticipant={(targetIdentity) =>
            runHostAction("mute", { targetIdentity })
          }
          onRemoveParticipant={(targetIdentity) =>
            runHostAction("remove", { targetIdentity })
          }
          onAdmitParticipant={(targetIdentity) =>
            runHostAction("admit", { targetIdentity })
          }
          onDeclineParticipant={(targetIdentity) =>
            runHostAction("deny", { targetIdentity })
          }
          onUploadLesson={(file) => void uploadLesson(file)}
          onPresentLesson={(lessonId) => void updateLessonPresentation("show", lessonId, 1)}
          onStopPresenting={() => void updateLessonPresentation("hide")}
          onDownloadLesson={downloadLesson}
          onRemoveLesson={(lessonId) => void removeLesson(lessonId)}
        />
      ) : null}

      {activeLesson && videoRoom.lessonAccessToken ? (
        <section className="call-stage lesson-layout" aria-label="Presented lesson">
          <LessonStage
            roomName={roomName}
            lessonId={activeLesson.lesson.id}
            lessonName={activeLesson.lesson.fileName}
            page={activeLesson.page}
            accessToken={videoRoom.lessonAccessToken}
            isHost={videoRoom.isHost}
            onSetPage={(page) => void updateLessonPresentation("page", activeLesson.lesson.id, page)}
            onStopPresenting={() => void updateLessonPresentation("hide")}
          />
          <div className={`screen-share-participant-strip strip-count-${visibleCount || 1}`} aria-label="Participants">
            {callParticipants.map((callParticipant) => (
              <ParticipantVideo
                key={callParticipant.id}
                participant={callParticipant.participant}
                label={callParticipant.label}
                isLocal={callParticipant.isLocal}
                isMuted={callParticipant.isLocal}
                audioOutputDeviceId={initialMediaSettings.speakerDeviceId}
                className="compact-call-tile"
                placeholder={<span className="participant-avatar compact-avatar">{callParticipant.placeholderLabel}</span>}
              />
            ))}
          </div>
        </section>
      ) : hasActiveScreenShare && videoRoom.activeScreenShare ? (
        <section className="call-stage screen-share-layout" aria-label="Video call">
          <ScreenShareStage
            participant={videoRoom.activeScreenShare.participant}
            label={videoRoom.activeScreenShare.label}
            isLocal={videoRoom.activeScreenShare.isLocal}
          />
          <div
            className={`screen-share-participant-strip strip-count-${visibleCount || 1}`}
            aria-label="Participants"
          >
            {callParticipants.map((callParticipant) => (
              <ParticipantVideo
                key={callParticipant.id}
                participant={callParticipant.participant}
                label={callParticipant.label}
                isLocal={callParticipant.isLocal}
                isMuted={callParticipant.isLocal}
                audioOutputDeviceId={initialMediaSettings.speakerDeviceId}
                className="compact-call-tile"
                placeholder={
                  <span className="participant-avatar compact-avatar">
                    {callParticipant.placeholderLabel}
                  </span>
                }
              />
            ))}
          </div>
          {videoRoom.participantCount >= 4 ? (
            <p className="room-limit-message">Room full: showing 4 participants</p>
          ) : null}
        </section>
      ) : (
        <section
          className={`call-stage participant-grid participant-grid-${visibleCount || 1}`}
          aria-label="Video call"
        >
          {visibleCount > 0 ? (
            callParticipants.map((callParticipant) => (
              <ParticipantVideo
                key={callParticipant.id}
                participant={callParticipant.participant}
                label={callParticipant.label}
                isLocal={callParticipant.isLocal}
                isMuted={callParticipant.isLocal}
                audioOutputDeviceId={initialMediaSettings.speakerDeviceId}
                className="equal-call-tile"
                placeholder={
                  <span className="participant-avatar">
                    {callParticipant.placeholderLabel}
                  </span>
                }
              />
            ))
          ) : (
            <ParticipantVideo
              participant={videoRoom.localParticipant}
              label="You"
              isLocal
              isMuted
              audioOutputDeviceId={initialMediaSettings.speakerDeviceId}
              className="main-call-tile"
              placeholder={
                videoRoom.isConnecting ? (
                  <span className="waiting-inline">
                    <Loader2 aria-hidden="true" size={20} />
                    Connecting...
                  </span>
                ) : (
                  <span className="participant-avatar">Y</span>
                )
              }
            />
          )}
          {videoRoom.remoteParticipants.length === 0 && !videoRoom.isConnecting ? (
            <p className="waiting-message">
              Waiting for another participant to join...
            </p>
          ) : null}
          {videoRoom.participantCount >= 4 ? (
            <p className="room-limit-message">Room full: showing 4 participants</p>
          ) : null}
        </section>
      )}

      <CallControls
        isCameraEnabled={videoRoom.isCameraEnabled}
        isMicEnabled={videoRoom.isMicEnabled}
        isScreenSharing={videoRoom.isScreenSharing}
        activeScreenShareLabel={videoRoom.activeScreenShare?.label ?? null}
        isActiveScreenShareLocal={Boolean(videoRoom.activeScreenShare?.isLocal)}
        hasRemoteScreenShare={videoRoom.hasRemoteScreenShare}
        isChatOpen={isChatOpen}
        unreadChatCount={unreadChatCount}
        isDisabled={videoRoom.isConnecting}
        onToggleCamera={videoRoom.toggleCamera}
        onToggleMicrophone={videoRoom.toggleMicrophone}
        onToggleScreenShare={videoRoom.toggleScreenShare}
        onStopScreenShare={videoRoom.stopScreenShare}
        onToggleChat={toggleChat}
        onLeave={leaveRoom}
      />
    </main>
  );
}

type HostRecoveryKeyScreenProps = {
  roomName: string;
  hostRecoveryKey: string;
  onContinue: () => void;
};

function HostRecoveryKeyScreen({
  roomName,
  hostRecoveryKey,
  onContinue,
}: HostRecoveryKeyScreenProps) {
  const [copyStatus, setCopyStatus] = useState("Copy key");

  async function copyRecoveryKey() {
    await copyText(hostRecoveryKey);
    setCopyStatus("Copied");
    window.setTimeout(() => setCopyStatus("Copy key"), 1600);
  }

  return (
    <main className="call-page call-access-page">
      <section
        className="room-full-screen host-recovery-screen"
        aria-labelledby="host-recovery-title"
      >
        <p className="room-full-eyebrow">Room code: {roomName}</p>
        <h1 id="host-recovery-title">Save your host recovery key</h1>
        <p>
          Use this key to recover host controls in a new browser or after leaving
          the call. Keep it private.
        </p>
        <output className="host-recovery-key-value">{hostRecoveryKey}</output>
        <button type="button" className="host-recovery-copy" onClick={() => void copyRecoveryKey()}>
          <Copy aria-hidden="true" size={18} />
          {copyStatus}
        </button>
        <button type="button" onClick={onContinue}>Continue to preview</button>
      </section>
    </main>
  );
}

function isHostParticipant(metadata: string) {
  try {
    const value = JSON.parse(metadata) as { role?: unknown };

    return value.role === "host";
  } catch {
    return false;
  }
}

type RoomPasswordScreenProps = {
  roomName: string;
  errorMessage: string;
  onSubmit: (roomPassword: string) => void;
  onReturnHome: () => void;
};

function RoomPasswordScreen({
  roomName,
  errorMessage,
  onSubmit,
  onReturnHome,
}: RoomPasswordScreenProps) {
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState("");

  function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedPassword = normalizeRoomPassword(passwordInput);

    if (!normalizedPassword) {
      setPasswordError("Enter the room password to continue.");
      return;
    }

    if (!isValidRoomPassword(normalizedPassword)) {
      setPasswordError("Room passwords must be 128 characters or fewer.");
      return;
    }

    setPasswordError("");
    onSubmit(normalizedPassword);
  }

  return (
    <main className="call-page call-access-page">
      <section className="room-full-screen" aria-labelledby="room-password-title">
        <p className="room-full-eyebrow">Room code: {roomName}</p>
        <h1 id="room-password-title">Room password required</h1>
        <p>{errorMessage}</p>
        <form className="room-password-form" onSubmit={submitPassword}>
          <label htmlFor="room-access-password">Password</label>
          <input
            id="room-access-password"
            autoComplete="off"
            autoFocus
            type="password"
            value={passwordInput}
            onChange={(event) => {
              setPasswordInput(event.target.value);
              setPasswordError("");
            }}
          />
          {passwordError ? <p className="form-error">{passwordError}</p> : null}
          <button type="submit">Join room</button>
        </form>
        <button type="button" className="room-secondary-action" onClick={onReturnHome}>
          Return home
        </button>
      </section>
    </main>
  );
}
