export const maxRoomPasswordLength = 128;

const roomPasswordSessionPrefix = "summit-video-room-password:";

export function normalizeRoomPassword(password: string) {
  return password.trim();
}

export function isValidRoomPassword(password: string) {
  return normalizeRoomPassword(password).length <= maxRoomPasswordLength;
}

export function getRoomPasswordStorageKey(roomName: string) {
  return `${roomPasswordSessionPrefix}${roomName}`;
}
