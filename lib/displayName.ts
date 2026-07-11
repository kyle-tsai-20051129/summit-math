export const displayNameStorageKey = "summit-video-display-name";

export function normalizeDisplayName(displayName: string) {
  return displayName.trim().replace(/\s+/g, " ");
}

export function isValidDisplayName(displayName: string) {
  const normalizedDisplayName = normalizeDisplayName(displayName);

  return normalizedDisplayName.length >= 1 && normalizedDisplayName.length <= 40;
}

export function getInitials(displayName: string, fallback = "?") {
  const normalizedDisplayName = normalizeDisplayName(displayName);

  if (!normalizedDisplayName) {
    return fallback;
  }

  return normalizedDisplayName
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}
