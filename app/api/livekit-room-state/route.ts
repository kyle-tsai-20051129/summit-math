import { RoomServiceClient } from "livekit-server-sdk";
import { NextResponse } from "next/server";
import { isValidRoomName } from "@/lib/room";

const missingEnvMessage =
  "LiveKit is not configured. Set LIVEKIT_API_KEY, LIVEKIT_API_SECRET, and LIVEKIT_URL.";

function toRoomServiceUrl(livekitUrl: string) {
  return livekitUrl.replace(/^wss:\/\//, "https://").replace(/^ws:\/\//, "http://");
}

export async function GET(request: Request) {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const livekitUrl = process.env.LIVEKIT_URL;

  if (!apiKey || !apiSecret || !livekitUrl) {
    return NextResponse.json({ error: missingEnvMessage }, { status: 500 });
  }

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
    const rooms = await roomService.listRooms([roomName]);

    if (rooms.length === 0) {
      return NextResponse.json({
        participantCount: 0,
        identities: [],
      });
    }

    const participants = await roomService.listParticipants(roomName);

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
