const roomNamePattern = /^[A-Za-z0-9_-]{1,64}$/;

export function normalizeRoomName(roomName: string) {
  return roomName.trim();
}

export function isValidRoomName(roomName: string) {
  return roomNamePattern.test(normalizeRoomName(roomName));
}
