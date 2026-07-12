import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { AccessToken, RoomServiceClient } from "livekit-server-sdk";
import { NextResponse } from "next/server";
import { isValidDisplayName, normalizeDisplayName } from "@/lib/displayName";
import { isValidRoomName } from "@/lib/room";
import {
  isRoomAccessMode,
  isValidRoomPassword,
  normalizeRoomPassword,
} from "@/lib/roomAccess";

const missingEnvMessage =
  "LiveKit is not configured. Set LIVEKIT_API_KEY, LIVEKIT_API_SECRET, and LIVEKIT_URL.";
const maxParticipants = 4;
const passwordMetadataVersion = 1;

type RoomAccessMetadata = {
  access?: {
    version?: number;
    salt?: string;
    passwordHash?: string;
  };
};

function toRoomServiceUrl(livekitUrl: string) {
  return livekitUrl.replace(/^wss:\/\//, "https://").replace(/^ws:\/\//, "http://");
}

function hashRoomPassword(password: string, salt: string) {
  return createHash("sha256").update(`${salt}:${password}`).digest("hex");
}

function createPasswordMetadata(password: string): RoomAccessMetadata {
  const salt = randomBytes(16).toString("hex");

  return {
    access: {
      version: passwordMetadataVersion,
      salt,
      passwordHash: hashRoomPassword(password, salt),
    },
  };
}

function readRoomAccessMetadata(metadata?: string): RoomAccessMetadata {
  if (!metadata) {
    return {};
  }

  try {
    const parsed = JSON.parse(metadata) as RoomAccessMetadata;

    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function verifyRoomPassword(password: string, metadata: RoomAccessMetadata) {
  const access = metadata.access;

  if (!access?.salt || !access.passwordHash) {
    return true;
  }

  const attemptedHash = hashRoomPassword(password, access.salt);
  const expectedHash = Buffer.from(access.passwordHash, "hex");
  const actualHash = Buffer.from(attemptedHash, "hex");

  return (
    expectedHash.length === actualHash.length &&
    timingSafeEqual(expectedHash, actualHash)
  );
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

  const roomName =
    typeof body === "object" &&
    body !== null &&
    "roomName" in body &&
    typeof body.roomName === "string"
      ? body.roomName.trim()
      : "";
  const displayName =
    typeof body === "object" &&
    body !== null &&
    "displayName" in body &&
    typeof body.displayName === "string"
      ? normalizeDisplayName(body.displayName)
      : "";
  const roomPassword =
    typeof body === "object" &&
    body !== null &&
    "roomPassword" in body &&
    typeof body.roomPassword === "string"
      ? normalizeRoomPassword(body.roomPassword)
      : "";
  const roomAccessMode =
    typeof body === "object" &&
    body !== null &&
    "roomAccessMode" in body &&
    typeof body.roomAccessMode === "string" &&
    isRoomAccessMode(body.roomAccessMode)
      ? body.roomAccessMode
      : "join";

  if (!isValidRoomName(roomName)) {
    return NextResponse.json(
      {
        error:
          "Invalid room name. Use 1-64 letters, numbers, hyphens, or underscores.",
      },
      { status: 400 },
    );
  }

  if (!isValidDisplayName(displayName)) {
    return NextResponse.json(
      { error: "Invalid display name. Use 1-40 characters." },
      { status: 400 },
    );
  }

  if (!isValidRoomPassword(roomPassword)) {
    return NextResponse.json(
      { error: "Room passwords must be 128 characters or fewer." },
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
    const existingRoom = rooms[0];

    if (existingRoom) {
      if (roomAccessMode === "create") {
        return NextResponse.json(
          {
            error:
              "Room already exists. Choose Join room or create a different room code.",
          },
          { status: 409 },
        );
      }

      const metadata = readRoomAccessMetadata(existingRoom.metadata);

      if (metadata.access?.passwordHash && !roomPassword) {
        return NextResponse.json(
          { error: "This room requires a password." },
          { status: 401 },
        );
      }

      if (!verifyRoomPassword(roomPassword, metadata)) {
        return NextResponse.json(
          { error: "Incorrect room password." },
          { status: 401 },
        );
      }
    } else {
      await roomService.createRoom({
        name: roomName,
        maxParticipants,
        metadata: roomPassword
          ? JSON.stringify(createPasswordMetadata(roomPassword))
          : undefined,
      });
    }

    const participants = await roomService.listParticipants(roomName);

    if (participants.length >= maxParticipants) {
      return NextResponse.json(
        { error: "This room is full. Up to 4 people can join at the same time." },
        { status: 403 },
      );
    }
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to check the LiveKit room.";

    return NextResponse.json(
      { error: `Failed to prepare the LiveKit room. ${message}` },
      { status: 500 },
    );
  }

  const identity = `guest-${crypto.randomUUID()}`;
  const token = new AccessToken(apiKey, apiSecret, {
    identity,
    name: displayName,
  });

  token.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canPublishData: true,
    canSubscribe: true,
  });

  return NextResponse.json({
    token: await token.toJwt(),
    url: livekitUrl,
    identity,
  });
}
