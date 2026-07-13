import { AccessToken, RoomServiceClient } from "livekit-server-sdk";
import { NextResponse } from "next/server";
import { isValidDisplayName, normalizeDisplayName } from "@/lib/displayName";
import { isValidRoomName } from "@/lib/room";
import {
  isRoomAccessMode,
  isValidRoomHostKey,
  isValidRoomPassword,
  normalizeRoomPassword,
} from "@/lib/roomAccess";
import {
  createHostMetadata,
  createPasswordMetadata,
  readRoomAccessMetadata,
  verifyHostKey,
  verifyRoomPassword,
} from "@/lib/serverRoomAccess";
import {
  createRoomSettings,
  createWaitingRoomRequest,
  getOrMigrateRoomSettings,
  getWaitingRoomRequestsForRoom,
  toRoomAccessMetadata,
} from "@/lib/roomDatabase";

const missingEnvMessage =
  "LiveKit is not configured. Set LIVEKIT_API_KEY, LIVEKIT_API_SECRET, and LIVEKIT_URL.";
const maxParticipants = 4;

function toRoomServiceUrl(livekitUrl: string) {
  return livekitUrl.replace(/^wss:\/\//, "https://").replace(/^ws:\/\//, "http://");
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
  const hostKey =
    typeof body === "object" &&
    body !== null &&
    "hostKey" in body &&
    typeof body.hostKey === "string"
      ? body.hostKey.trim()
      : "";
  const admissionRequestId =
    typeof body === "object" &&
    body !== null &&
    "admissionRequestId" in body &&
    typeof body.admissionRequestId === "string"
      ? body.admissionRequestId.trim()
      : "";
  const waitingRoomEnabled =
    typeof body === "object" &&
    body !== null &&
    "waitingRoomEnabled" in body &&
    typeof body.waitingRoomEnabled === "boolean"
      ? body.waitingRoomEnabled
      : false;

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

  if (hostKey && !isValidRoomHostKey(hostKey)) {
    return NextResponse.json(
      { error: "Invalid host key." },
      { status: 400 },
    );
  }

  let isHost = false;
  let isRoomLocked = false;

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

      const storedSettings = getOrMigrateRoomSettings(
        roomName,
        readRoomAccessMetadata(existingRoom.metadata),
      );

      if (!storedSettings) {
        throw new Error("Unable to load the saved room settings.");
      }

      const metadata = toRoomAccessMetadata(storedSettings);
      isHost = verifyHostKey(hostKey, metadata);
      isRoomLocked = storedSettings.locked;

      if (isRoomLocked && !isHost) {
        return NextResponse.json(
          { error: "This room is locked by the host." },
          { status: 423 },
        );
      }

      if (metadata.access?.passwordHash && !roomPassword && !isHost) {
        return NextResponse.json(
          { error: "This room requires a password." },
          { status: 401 },
        );
      }

      if (!isHost && !verifyRoomPassword(roomPassword, metadata)) {
        return NextResponse.json(
          { error: "Incorrect room password." },
          { status: 401 },
        );
      }

      if (storedSettings.waitingRoomEnabled && !isHost) {
        const requests = getWaitingRoomRequestsForRoom(roomName);
        const admissionRequest = requests.find(
          (request) => request.id === admissionRequestId,
        );

        if (admissionRequest?.status === "denied") {
          return NextResponse.json(
            { error: "The host did not admit this request." },
            { status: 403 },
          );
        }

        if (admissionRequest?.status !== "admitted") {
          const requestId = admissionRequest?.id || crypto.randomUUID();
          if (!admissionRequest) {
            createWaitingRoomRequest(roomName, requestId, displayName);
          }

          return NextResponse.json(
            {
              status: "waiting",
              requestId,
              message: "Waiting for the host to admit you.",
            },
            { status: 202 },
          );
        }
      }
    } else {
      const roomMetadata = {
        access: roomPassword ? createPasswordMetadata(roomPassword) : undefined,
        host: hostKey ? createHostMetadata(hostKey) : undefined,
        settings: {
          locked: false,
          waitingRoomEnabled,
        },
      };

      await roomService.createRoom({
        name: roomName,
        maxParticipants,
        metadata: JSON.stringify({ version: 1 }),
      });
      createRoomSettings(roomName, roomMetadata);
      isHost = Boolean(hostKey);
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
    isHost,
    isRoomLocked,
  });
}
