"use client";

import { Copy } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  displayNameStorageKey,
  isValidDisplayName,
  normalizeDisplayName,
} from "@/lib/displayName";
import { isValidRoomName, normalizeRoomName } from "@/lib/room";
import {
  getRoomAccessModeStorageKey,
  getRoomPasswordStorageKey,
  isValidRoomPassword,
  normalizeRoomPassword,
  RoomAccessMode,
} from "@/lib/roomAccess";
import { copyText, getRoomUrl } from "@/lib/share";

export function JoinRoomForm() {
  const [accessMode, setAccessMode] = useState<RoomAccessMode>("join");
  const [roomName, setRoomName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [isPasswordProtected, setIsPasswordProtected] = useState(false);
  const [roomPassword, setRoomPassword] = useState("");
  const [error, setError] = useState("");
  const [copyStatus, setCopyStatus] = useState("Copy room link");

  const normalizedRoomName = useMemo(() => normalizeRoomName(roomName), [roomName]);
  const normalizedDisplayName = useMemo(
    () => normalizeDisplayName(displayName),
    [displayName],
  );

  useEffect(() => {
    const storedDisplayName = window.localStorage.getItem(displayNameStorageKey);

    if (storedDisplayName && isValidDisplayName(storedDisplayName)) {
      setDisplayName(normalizeDisplayName(storedDisplayName));
    }
  }, []);

  function enterRoom(
    nextRoomName: string,
    nextAccessMode: RoomAccessMode = accessMode,
  ) {
    const normalized = normalizeRoomName(nextRoomName);
    const normalizedPassword = normalizeRoomPassword(roomPassword);
    const shouldUsePassword =
      nextAccessMode === "join" || isPasswordProtected;

    if (!isValidDisplayName(normalizedDisplayName)) {
      setError("Enter a display name between 1 and 40 characters.");
      return;
    }

    if (!isValidRoomName(normalized)) {
      setError("Use 1-64 letters, numbers, hyphens, or underscores.");
      return;
    }

    if (nextAccessMode === "create" && isPasswordProtected && !normalizedPassword) {
      setError("Enter a password or turn password protection off.");
      return;
    }

    if (shouldUsePassword && !isValidRoomPassword(normalizedPassword)) {
      setError("Room passwords must be 128 characters or fewer.");
      return;
    }

    window.localStorage.setItem(displayNameStorageKey, normalizedDisplayName);
    window.sessionStorage.setItem(
      getRoomAccessModeStorageKey(normalized),
      nextAccessMode,
    );

    if (shouldUsePassword && normalizedPassword) {
      window.sessionStorage.setItem(
        getRoomPasswordStorageKey(normalized),
        normalizedPassword,
      );
    } else {
      window.sessionStorage.removeItem(getRoomPasswordStorageKey(normalized));
    }

    window.location.href = `/room/${encodeURIComponent(normalized)}`;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    enterRoom(normalizedRoomName);
  }

  async function copyRoomLink() {
    if (!isValidRoomName(normalizedRoomName)) {
      setError("Enter a valid room name before copying the link.");
      return;
    }

    await copyText(getRoomUrl(normalizedRoomName));
    setCopyStatus("Copied");
    window.setTimeout(() => setCopyStatus("Copy room link"), 1600);
  }

  return (
    <form className="join-panel" onSubmit={handleSubmit}>
      <div className="room-access-tabs" aria-label="Room action">
        <button
          type="button"
          className={accessMode === "join" ? "active" : ""}
          onClick={() => {
            setAccessMode("join");
            setError("");
          }}
        >
          Join room
        </button>
        <button
          type="button"
          className={accessMode === "create" ? "active" : ""}
          onClick={() => {
            setAccessMode("create");
            setError("");
          }}
        >
          Create room
        </button>
      </div>
      <label htmlFor="display-name">Display name</label>
      <input
        id="display-name"
        name="displayName"
        autoComplete="name"
        inputMode="text"
        placeholder="Kyle"
        value={displayName}
        onChange={(event) => {
          setDisplayName(event.target.value);
          setError("");
        }}
      />
      <label htmlFor="room-name">Room name</label>
      <input
        id="room-name"
        name="roomName"
        autoComplete="off"
        inputMode="text"
        placeholder="test"
        value={roomName}
        onChange={(event) => {
          setRoomName(event.target.value);
          setError("");
          setCopyStatus("Copy room link");
        }}
      />
      {accessMode === "create" ? (
        <label className="password-toggle">
          <input
            checked={isPasswordProtected}
            type="checkbox"
            onChange={(event) => {
              setIsPasswordProtected(event.target.checked);
              setError("");
            }}
          />
          Require a room password
        </label>
      ) : null}
      {accessMode === "join" || isPasswordProtected ? (
        <>
          <label htmlFor="room-password">
            {accessMode === "join" ? "Room password if required" : "Room password"}
          </label>
          <input
            id="room-password"
            name="roomPassword"
            autoComplete="off"
            type="password"
            placeholder={
              accessMode === "join"
                ? "Leave blank for public rooms"
                : "Create a room password"
            }
            value={roomPassword}
            onChange={(event) => {
              setRoomPassword(event.target.value);
              setError("");
            }}
          />
        </>
      ) : null}
      {error ? <p className="form-error">{error}</p> : null}
      {isValidRoomName(normalizedRoomName) ? (
        <p className="room-link-preview">
          Room code: <strong>{normalizedRoomName}</strong>
          {accessMode === "create" && isPasswordProtected ? (
            <span> Password protected</span>
          ) : null}
        </p>
      ) : null}
      <button type="submit" disabled={!normalizedRoomName || !normalizedDisplayName}>
        {accessMode === "join" ? "Join Room" : "Create Room"}
      </button>
      <button
        className="secondary-button copy-room-button"
        type="button"
        onClick={copyRoomLink}
        disabled={!normalizedRoomName}
      >
        <Copy aria-hidden="true" size={18} />
        {copyStatus}
      </button>
      <button
        className="secondary-button"
        type="button"
        onClick={() => enterRoom(`demo-${createDemoRoomSuffix()}`, "create")}
      >
        Create Demo Room
      </button>
    </form>
  );
}

function createDemoRoomSuffix() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().slice(0, 8);
  }

  return Math.random().toString(36).slice(2, 10);
}
