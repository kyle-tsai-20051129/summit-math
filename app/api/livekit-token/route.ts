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
  touchRoomActivity,
  toRoomAccessMetadata,
} from "@/lib/roomDatabase";
import { maybeCleanupExpiredRooms } from "@/lib/roomCleanup";
import {
  getLiveKitConfig,
  liveKitConfigurationError,
  toRoomServiceUrl,
} from "@/lib/livekitConfig";
import {
  checkRateLimit,
  getRequestClientKey,
} from "@/lib/requestRateLimit";

const maxParticipants = 4;

function readPositiveEnvironmentNumber(
  name: string,
  fallback: number,
  maximum: number,
) {
  const value = Number(process.env[name]);

  return Number.isInteger(value) && value > 0 && value <= maximum
    ? value
    : fallback;
}

const tokenRequestLimit = {
  maxRequests: readPositiveEnvironmentNumber(
    "TOKEN_RATE_LIMIT_MAX_REQUESTS",
    20,
    100,
  ),
  windowMs:
    readPositiveEnvironmentNumber("TOKEN_RATE_LIMIT_WINDOW_SECONDS", 60, 3600) *
    1000,
};
const passwordAttemptLimit = {
  maxRequests: readPositiveEnvironmentNumber(
    "PASSWORD_RATE_LIMIT_MAX_REQUESTS",
    5,
    20,
  ),
  windowMs:
    readPositiveEnvironmentNumber(
      "PASSWORD_RATE_LIMIT_WINDOW_SECONDS",
      900,
      86_400,
    ) * 1000,
};

export const runtime = "nodejs";

function rateLimitedResponse(retryAfterSeconds: number) {
  return NextResponse.json(
    { error: "Too many join attempts. Please wait a moment and try again." },
    {
      status: 429,
      headers: { "Retry-After": String(retryAfterSeconds) },
    },
  );
}

export async function POST(request: Request) {
  const config = getLiveKitConfig();

  if (!config) {
    return NextResponse.json({ error: liveKitConfigurationError }, { status: 503 });
  }

  const { apiKey, apiSecret, livekitUrl } = config;
  const clientKey = getRequestClientKey(request);
  const tokenRateLimit = checkRateLimit(
    `token:${clientKey}`,
    tokenRequestLimit.maxRequests,
    tokenRequestLimit.windowMs,
  );

  if (!tokenRateLimit.allowed) {
    return rateLimitedResponse(tokenRateLimit.retryAfterSeconds);
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
  let isPasswordProtected = false;

  try {
    const roomService = new RoomServiceClient(
      toRoomServiceUrl(livekitUrl),
      apiKey,
      apiSecret,
    );
    await maybeCleanupExpiredRooms(apiKey, apiSecret, livekitUrl);
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
      isPasswordProtected = Boolean(storedSettings.access?.passwordHash);

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
        const passwordRateLimit = checkRateLimit(
          `password:${clientKey}:${roomName}`,
          passwordAttemptLimit.maxRequests,
          passwordAttemptLimit.windowMs,
        );

        if (!passwordRateLimit.allowed) {
          return rateLimitedResponse(passwordRateLimit.retryAfterSeconds);
        }

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
      isPasswordProtected = Boolean(roomPassword);
    }

    const participants = await roomService.listParticipants(roomName);

    if (participants.length > 0) {
      touchRoomActivity(roomName);
    }

    if (participants.length >= maxParticipants) {
      return NextResponse.json(
        { error: "This room is full. Up to 4 people can join at the same time." },
        { status: 403 },
      );
    }
  } catch (error) {
    console.error("Unable to prepare LiveKit room", {
      roomName,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return NextResponse.json(
      { error: "Unable to prepare the room right now. Please try again." },
      { status: 500 },
    );
  }

  const identity = `guest-${crypto.randomUUID()}`;
  const token = new AccessToken(apiKey, apiSecret, {
    identity,
    name: displayName,
    metadata: JSON.stringify({ role: isHost ? "host" : "participant" }),
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
    isPasswordProtected,
  });
}
