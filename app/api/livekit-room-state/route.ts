import { RoomServiceClient } from "livekit-server-sdk";
import { NextResponse } from "next/server";
import { isValidRoomName } from "@/lib/room";
import { touchRoomActivity } from "@/lib/roomDatabase";
import { maybeCleanupExpiredRooms } from "@/lib/roomCleanup";
import {
  getLiveKitConfig,
  liveKitConfigurationError,
  toRoomServiceUrl,
} from "@/lib/livekitConfig";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const config = getLiveKitConfig();

  if (!config) {
    return NextResponse.json({ error: liveKitConfigurationError }, { status: 503 });
  }

  const { apiKey, apiSecret, livekitUrl } = config;

  const { searchParams } = new URL(request.url);
  const roomName = searchParams.get("roomName")?.trim() ?? "";

  if (!isValidRoomName(roomName)) {
    return NextResponse.json(
      {
        error:
          "Invalid room name. Use 1-64 letters, numbers, hyphens, or underscores.",
      },
      { status: 400 },
    );
  }

  try {
    const roomService = new RoomServiceClient(
      toRoomServiceUrl(livekitUrl),
      apiKey,
      apiSecret,
    );
    await maybeCleanupExpiredRooms(apiKey, apiSecret, livekitUrl);
    const rooms = await roomService.listRooms([roomName]);

    if (rooms.length === 0) {
      return NextResponse.json({
        participantCount: 0,
        identities: [],
      });
    }

    const participants = await roomService.listParticipants(roomName);

    if (participants.length > 0) {
      touchRoomActivity(roomName);
    }

    return NextResponse.json({
      participantCount: participants.length,
      identities: participants.map((participant) => participant.identity),
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to check the LiveKit room.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
