export const maxRoomPasswordLength = 128;

const roomPasswordSessionPrefix = "summit-video-room-password:";
const roomAccessModeSessionPrefix = "summit-video-room-access-mode:";

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

export function isRoomAccessMode(value: string): value is RoomAccessMode {
  return value === "join" || value === "create";
}
