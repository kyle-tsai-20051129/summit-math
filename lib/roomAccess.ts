export const maxRoomPasswordLength = 128;

const roomPasswordSessionPrefix = "summit-video-room-password:";
const roomAccessModeSessionPrefix = "summit-video-room-access-mode:";
const roomHostKeySessionPrefix = "summit-video-room-host-key:";
const roomWaitingRoomSessionPrefix = "summit-video-room-waiting-room:";

export type RoomAccessMode = "join" | "create";

export function normalizeRoomPassword(password: string) {
  return password.trim();
}

export function isValidRoomPassword(password: string) {
  return normalizeRoomPassword(password).length <= maxRoomPasswordLength;
}

export function getRoomPasswordStorageKey(roomName: string) {
  return `${roomPasswordSessionPrefix}${roomName}`;
}

export function getRoomAccessModeStorageKey(roomName: string) {
  return `${roomAccessModeSessionPrefix}${roomName}`;
}

export function getRoomHostKeyStorageKey(roomName: string) {
  return `${roomHostKeySessionPrefix}${roomName}`;
}

export function getRoomWaitingRoomStorageKey(roomName: string) {
  return `${roomWaitingRoomSessionPrefix}${roomName}`;
}

export function isRoomAccessMode(value: string): value is RoomAccessMode {
  return value === "join" || value === "create";
}

export function createRoomHostKey() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function isValidRoomHostKey(hostKey: string) {
  return hostKey.length > 0 && hostKey.length <= 128;
}
