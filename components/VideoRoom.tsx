"use client";

import { Copy, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { CallControls } from "@/components/CallControls";
import { ChatPanel } from "@/components/ChatPanel";
import {
  ConnectionStatus,
  getCallConnectionStatus,
} from "@/components/ConnectionStatus";
import { JoinMediaSettings, JoinPreview } from "@/components/JoinPreview";
import { ParticipantVideo } from "@/components/ParticipantVideo";
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
  getRoomPasswordStorageKey,
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

    if (storedRoomPassword && isValidRoomPassword(storedRoomPassword)) {
      setRoomPassword(normalizeRoomPassword(storedRoomPassword));
    }

    if (storedAccessMode && isRoomAccessMode(storedAccessMode)) {
      setRoomAccessMode(storedAccessMode);
      window.sessionStorage.removeItem(getRoomAccessModeStorageKey(roomName));
    }
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
  onRoomPasswordChange: (roomPassword: string) => void;
};

function VideoRoomCall({
  roomName,
  displayName,
  initialMediaSettings,
  roomPassword,
  roomAccessMode,
  onRoomPasswordChange,
}: VideoRoomCallProps) {
  const router = useRouter();
  const videoRoom = useVideoRoom(
    roomName,
    displayName,
    initialMediaSettings,
    roomPassword,
    roomAccessMode,
  );
  const [copyStatus, setCopyStatus] = useState("Copy link");
  const [isChatOpen, setIsChatOpen] = useState(false);
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

  function leaveRoom() {
    videoRoom.disconnect();
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

  async function copyRoomLink() {
    await copyText(getRoomUrl(roomName));
    setCopyStatus("Copied");
    window.setTimeout(() => setCopyStatus("Copy link"), 1600);
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

  return (
    <main className="call-page">
      <header className="call-topbar">
        <strong>Summit Video</strong>
        <span className="room-code">
          Room code: <strong>{roomName}</strong>
        </span>
        <ConnectionStatus
          state={videoRoom.connectionState}
          quality={videoRoom.connectionQuality}
          errorMessage={videoRoom.error?.message}
        />
        <button
          className="topbar-copy-button"
          type="button"
          onClick={copyRoomLink}
          title="Copy room link"
        >
          <Copy aria-hidden="true" size={16} />
          {copyStatus}
        </button>
      </header>

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

      {hasActiveScreenShare && videoRoom.activeScreenShare ? (
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
        isChatOpen={isChatOpen}
        unreadChatCount={unreadChatCount}
        isDisabled={videoRoom.isConnecting}
        onToggleCamera={videoRoom.toggleCamera}
        onToggleMicrophone={videoRoom.toggleMicrophone}
        onToggleScreenShare={videoRoom.toggleScreenShare}
        onToggleChat={toggleChat}
        onLeave={leaveRoom}
      />
    </main>
  );
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
