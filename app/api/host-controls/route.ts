import { TrackSource } from "@livekit/protocol";
import { RoomServiceClient } from "livekit-server-sdk";
import { NextResponse } from "next/server";
import { isValidRoomName } from "@/lib/room";
import { isValidRoomHostKey } from "@/lib/roomAccess";
import {
  readRoomAccessMetadata,
  verifyHostKey,
} from "@/lib/serverRoomAccess";
import {
  getOrMigrateRoomSettings,
  getWaitingRoomRequestsForRoom,
  setRoomLocked,
  setWaitingRoomRequestStatus,
  toRoomAccessMetadata,
} from "@/lib/roomDatabase";
import {
  getLiveKitConfig,
  liveKitConfigurationError,
  toRoomServiceUrl,
} from "@/lib/livekitConfig";

type HostAction = "lock" | "remove" | "mute" | "admit" | "deny" | "waiting";

export const runtime = "nodejs";

function readStringField(body: unknown, fieldName: string) {
  return typeof body === "object" &&
    body !== null &&
    fieldName in body &&
    typeof body[fieldName as keyof typeof body] === "string"
    ? (body[fieldName as keyof typeof body] as string).trim()
    : "";
}

function readHostAction(body: unknown): HostAction | "" {
  const action = readStringField(body, "action");

  return action === "lock" ||
    action === "remove" ||
    action === "mute" ||
    action === "admit" ||
    action === "deny" ||
    action === "waiting"
    ? action
    : "";
}

export async function POST(request: Request) {
  const config = getLiveKitConfig();

  if (!config) {
    return NextResponse.json({ error: liveKitConfigurationError }, { status: 503 });
  }

  const { apiKey, apiSecret, livekitUrl } = config;

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const roomName = readStringField(body, "roomName");
  const hostKey = readStringField(body, "hostKey");
  const targetIdentity = readStringField(body, "targetIdentity");
  const action = readHostAction(body);
  const locked =
    typeof body === "object" &&
    body !== null &&
    "locked" in body &&
    typeof body.locked === "boolean"
      ? body.locked
      : false;

  if (!isValidRoomName(roomName)) {
    return NextResponse.json(
      { error: "Invalid room name." },
      { status: 400 },
    );
  }

  if (!action) {
    return NextResponse.json(
      { error: "Invalid host action." },
      { status: 400 },
    );
  }

  if (!isValidRoomHostKey(hostKey)) {
    return NextResponse.json(
      { error: "Host controls are only available to the room creator." },
      { status: 403 },
    );
  }

  if (
    (action === "remove" || action === "mute" || action === "admit" || action === "deny") &&
    !targetIdentity
  ) {
    return NextResponse.json(
      { error: "Choose a participant first." },
      { status: 400 },
    );
  }

  try {
    const roomService = new RoomServiceClient(
      toRoomServiceUrl(livekitUrl),
      apiKey,
      apiSecret,
    );
    const rooms = await roomService.listRooms([roomName]);
    const room = rooms[0];

    if (!room) {
      return NextResponse.json({ error: "Room not found." }, { status: 404 });
    }

    const storedSettings = getOrMigrateRoomSettings(
      roomName,
      readRoomAccessMetadata(room.metadata),
    );

    if (!storedSettings) {
      throw new Error("Unable to load the saved room settings.");
    }

    const metadata = toRoomAccessMetadata(storedSettings);

    if (!verifyHostKey(hostKey, metadata)) {
      return NextResponse.json(
        { error: "Host controls are only available to the room creator." },
        { status: 403 },
      );
    }

    if (action === "lock") {
      setRoomLocked(roomName, locked);

      return NextResponse.json({
        locked,
        message: locked ? "Room locked." : "Room unlocked.",
      });
    }

    if (action === "waiting") {
      return NextResponse.json({
        requests: getWaitingRoomRequestsForRoom(roomName)
          .filter((request) => request.status === "pending")
          .map((request) => ({ id: request.id, label: request.displayName })),
      });
    }

    if (action === "remove") {
      await roomService.removeParticipant(roomName, targetIdentity);

      return NextResponse.json({ message: "Participant removed." });
    }

    if (action === "admit" || action === "deny") {
      const requests = getWaitingRoomRequestsForRoom(roomName);
      const request = requests.find((item) => item.id === targetIdentity);

      if (!request || request.status !== "pending") {
        return NextResponse.json(
          { error: "This waiting-room request is no longer available." },
          { status: 404 },
        );
      }

      const wasUpdated = setWaitingRoomRequestStatus(
        roomName,
        targetIdentity,
        action === "admit" ? "admitted" : "denied",
      );

      if (!wasUpdated) {
        return NextResponse.json(
          { error: "This waiting-room request is no longer available." },
          { status: 404 },
        );
      }

      return NextResponse.json({
        message: action === "admit" ? "Participant admitted." : "Participant declined.",
      });
    }

    const participant = await roomService.getParticipant(roomName, targetIdentity);
    const microphoneTrack = participant.tracks.find(
      (track) => track.source === TrackSource.MICROPHONE,
    );

    if (!microphoneTrack) {
      return NextResponse.json(
        { error: "That participant does not have a microphone track yet." },
        { status: 404 },
      );
    }

    await roomService.mutePublishedTrack(
      roomName,
      targetIdentity,
      microphoneTrack.sid,
      true,
    );

    return NextResponse.json({ message: "Participant muted." });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Host control action failed.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
