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
  getRoomPasswordStorageKey,
  isValidRoomPassword,
  normalizeRoomPassword,
} from "@/lib/roomAccess";
import { copyText, getRoomUrl } from "@/lib/share";

export function JoinRoomForm() {
  const [roomName, setRoomName] = useState("");
  const [displayName, setDisplayName] = useState("");
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

  function joinRoom(nextRoomName: string) {
    const normalized = normalizeRoomName(nextRoomName);
    const normalizedPassword = normalizeRoomPassword(roomPassword);

    if (!isValidDisplayName(normalizedDisplayName)) {
      setError("Enter a display name between 1 and 40 characters.");
      return;
    }

    if (!isValidRoomName(normalized)) {
      setError("Use 1-64 letters, numbers, hyphens, or underscores.");
      return;
    }

    if (!isValidRoomPassword(normalizedPassword)) {
      setError("Room passwords must be 128 characters or fewer.");
      return;
    }

    window.localStorage.setItem(displayNameStorageKey, normalizedDisplayName);
    if (normalizedPassword) {
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
    joinRoom(normalizedRoomName);
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
      <label htmlFor="room-password">Room password (optional)</label>
      <input
        id="room-password"
        name="roomPassword"
        autoComplete="off"
        type="password"
        placeholder="Leave blank for a public room"
        value={roomPassword}
        onChange={(event) => {
          setRoomPassword(event.target.value);
          setError("");
        }}
      />
      {error ? <p className="form-error">{error}</p> : null}
      {isValidRoomName(normalizedRoomName) ? (
        <p className="room-link-preview">
          Room code: <strong>{normalizedRoomName}</strong>
        </p>
      ) : null}
      <button type="submit" disabled={!normalizedRoomName || !normalizedDisplayName}>
        Join Room
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
        onClick={() => joinRoom(`demo-${createDemoRoomSuffix()}`)}
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
