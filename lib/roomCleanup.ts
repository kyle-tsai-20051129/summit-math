import { RoomServiceClient } from "livekit-server-sdk";
import {
  deleteRoomSettings,
  getRoomNamesInactiveSince,
  touchRoomActivity,
} from "@/lib/roomDatabase";

const defaultEmptyRoomTtlHours = 24;
const cleanupIntervalMs = 5 * 60 * 1000;

let lastCleanupAt = 0;
let cleanupInFlight: Promise<void> | null = null;

function toRoomServiceUrl(livekitUrl: string) {
  return livekitUrl.replace(/^wss:\/\//, "https://").replace(/^ws:\/\//, "http://");
}

function getEmptyRoomTtlMs() {
  const configuredHours = Number(process.env.ROOM_EMPTY_TTL_HOURS);
  const hours =
    Number.isFinite(configuredHours) && configuredHours > 0
      ? configuredHours
      : defaultEmptyRoomTtlHours;

  return hours * 60 * 60 * 1000;
}

async function cleanupExpiredRooms(
  apiKey: string,
  apiSecret: string,
  livekitUrl: string,
) {
  const cutoff = Date.now() - getEmptyRoomTtlMs();
  const roomNames = getRoomNamesInactiveSince(cutoff);

  if (roomNames.length === 0) {
    return;
  }

  const roomService = new RoomServiceClient(
    toRoomServiceUrl(livekitUrl),
    apiKey,
    apiSecret,
  );

  for (const roomName of roomNames) {
    try {
      const rooms = await roomService.listRooms([roomName]);

      if (rooms.length === 0) {
        deleteRoomSettings(roomName);
        continue;
      }

      const participants = await roomService.listParticipants(roomName);
      if (participants.length > 0) {
        touchRoomActivity(roomName);
        continue;
      }

      await roomService.deleteRoom(roomName);
      deleteRoomSettings(roomName);
    } catch {
      // A later request retries cleanup; an individual stale room never blocks calls.
    }
  }
}

/**
 * Removes inactive, empty rooms at most once every five minutes per server process.
 * Cleanup runs lazily during normal room activity, so no external scheduler is needed.
 */
export async function maybeCleanupExpiredRooms(
  apiKey: string,
  apiSecret: string,
  livekitUrl: string,
) {
  const now = Date.now();
  if (cleanupInFlight) {
    return cleanupInFlight;
  }

  if (now - lastCleanupAt < cleanupIntervalMs) {
    return;
  }

  lastCleanupAt = now;
  cleanupInFlight = cleanupExpiredRooms(apiKey, apiSecret, livekitUrl).finally(() => {
    cleanupInFlight = null;
  });

  return cleanupInFlight;
}
