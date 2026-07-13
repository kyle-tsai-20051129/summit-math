import { TrackSource } from "@livekit/protocol";
import { RoomServiceClient } from "livekit-server-sdk";
import { NextResponse } from "next/server";
import { isValidRoomName } from "@/lib/room";
import { isValidRoomHostKey } from "@/lib/roomAccess";
import {
  readRoomAccessMetadata,
  verifyHostKey,
} from "@/lib/serverRoomAccess";

const missingEnvMessage =
  "LiveKit is not configured. Set LIVEKIT_API_KEY, LIVEKIT_API_SECRET, and LIVEKIT_URL.";

type HostAction = "lock" | "remove" | "mute";

function toRoomServiceUrl(livekitUrl: string) {
  return livekitUrl.replace(/^wss:\/\//, "https://").replace(/^ws:\/\//, "http://");
}

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

  return action === "lock" || action === "remove" || action === "mute"
    ? action
    : "";
}

export async function POST(request: Request) {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const livekitUrl = process.env.LIVEKIT_URL;

  if (!apiKey || !apiSecret || !livekitUrl) {
    return NextResponse.json({ error: missingEnvMessage }, { status: 500 });
  }

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

  if ((action === "remove" || action === "mute") && !targetIdentity) {
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

    const metadata = readRoomAccessMetadata(room.metadata);

    if (!verifyHostKey(hostKey, metadata)) {
      return NextResponse.json(
        { error: "Host controls are only available to the room creator." },
        { status: 403 },
      );
    }

    if (action === "lock") {
      const nextMetadata = {
        ...metadata,
        settings: {
          ...metadata.settings,
          locked,
        },
      };

      await roomService.updateRoomMetadata(roomName, JSON.stringify(nextMetadata));

      return NextResponse.json({
        locked,
        message: locked ? "Room locked." : "Room unlocked.",
      });
    }

    if (action === "remove") {
      await roomService.removeParticipant(roomName, targetIdentity);

      return NextResponse.json({ message: "Participant removed." });
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
