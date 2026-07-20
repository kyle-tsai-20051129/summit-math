import { RoomServiceClient } from "livekit-server-sdk";
import { NextResponse } from "next/server";
import { isValidRoomName } from "@/lib/room";
import {
  readRoomAccessMetadata,
} from "@/lib/serverRoomAccess";
import {
  getOrMigrateRoomSettings,
  getWaitingRoomRequestsForRoom,
  removeWaitingRoomRequest,
} from "@/lib/roomDatabase";
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
  const requestId = searchParams.get("requestId")?.trim() ?? "";

  if (!isValidRoomName(roomName) || !requestId) {
    return NextResponse.json({ error: "Invalid waiting-room request." }, { status: 400 });
  }

  try {
    const roomService = new RoomServiceClient(
      toRoomServiceUrl(livekitUrl),
      apiKey,
      apiSecret,
    );
    const room = (await roomService.listRooms([roomName]))[0];

    if (!room) {
      return NextResponse.json({ error: "Room not found." }, { status: 404 });
    }

    getOrMigrateRoomSettings(roomName, readRoomAccessMetadata(room.metadata));
    const requestState = getWaitingRoomRequestsForRoom(roomName).find(
      (item) => item.id === requestId,
    );

    if (!requestState) {
      return NextResponse.json(
        { error: "This waiting-room request has expired." },
        { status: 404 },
      );
    }

    return NextResponse.json({ status: requestState.status });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to check approval status." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  const config = getLiveKitConfig();

  if (!config) {
    return NextResponse.json({ error: liveKitConfigurationError }, { status: 503 });
  }

  const { apiKey, apiSecret, livekitUrl } = config;

  const { searchParams } = new URL(request.url);
  const roomName = searchParams.get("roomName")?.trim() ?? "";
  const requestId = searchParams.get("requestId")?.trim() ?? "";

  if (!isValidRoomName(roomName) || !requestId) {
    return NextResponse.json({ error: "Invalid waiting-room request." }, { status: 400 });
  }

  try {
    const roomService = new RoomServiceClient(
      toRoomServiceUrl(livekitUrl),
      apiKey,
      apiSecret,
    );
    const room = (await roomService.listRooms([roomName]))[0];

    if (!room) {
      return NextResponse.json({ ok: true });
    }

    getOrMigrateRoomSettings(roomName, readRoomAccessMetadata(room.metadata));
    removeWaitingRoomRequest(roomName, requestId);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to leave the waiting room." },
      { status: 500 },
    );
  }
}
