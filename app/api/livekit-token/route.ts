import { AccessToken, RoomServiceClient } from "livekit-server-sdk";
import { NextResponse } from "next/server";
import { isValidDisplayName, normalizeDisplayName } from "@/lib/displayName";
import { isValidRoomName } from "@/lib/room";

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

  try {
    const roomService = new RoomServiceClient(
      toRoomServiceUrl(livekitUrl),
      apiKey,
      apiSecret,
    );
    const rooms = await roomService.listRooms([roomName]);

    if (rooms.length === 0) {
      await roomService.createRoom({
        name: roomName,
        maxParticipants,
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
    canSubscribe: true,
  });

  return NextResponse.json({
    token: await token.toJwt(),
    url: livekitUrl,
    identity,
  });
}
