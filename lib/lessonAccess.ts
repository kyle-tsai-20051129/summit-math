import { isValidRoomHostKey } from "@/lib/roomAccess";
import { getRoomSettings, toRoomAccessMetadata } from "@/lib/roomDatabase";
import { verifyHostKey } from "@/lib/serverRoomAccess";

export function hasRoomHostAccess(roomName: string, hostKey: string) {
  if (!isValidRoomHostKey(hostKey)) {
    return false;
  }

  const settings = getRoomSettings(roomName);

  return settings
    ? verifyHostKey(hostKey, toRoomAccessMetadata(settings))
    : false;
}
