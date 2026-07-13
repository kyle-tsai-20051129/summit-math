import { createHash, randomBytes, timingSafeEqual } from "crypto";

export const hostMetadataVersion = 1;
export const passwordMetadataVersion = 1;

export type RoomAccessMetadata = {
  access?: {
    version?: number;
    salt?: string;
    passwordHash?: string;
  };
  host?: {
    version?: number;
    salt?: string;
    keyHash?: string;
  };
  settings?: {
    locked?: boolean;
  };
};

export function createSecretHash(secret: string, salt: string) {
  return createHash("sha256").update(`${salt}:${secret}`).digest("hex");
}

export function createPasswordMetadata(password: string) {
  const salt = randomBytes(16).toString("hex");

  return {
    version: passwordMetadataVersion,
    salt,
    passwordHash: createSecretHash(password, salt),
  };
}

export function createHostMetadata(hostKey: string) {
  const salt = randomBytes(16).toString("hex");

  return {
    version: hostMetadataVersion,
    salt,
    keyHash: createSecretHash(hostKey, salt),
  };
}

export function readRoomAccessMetadata(metadata?: string): RoomAccessMetadata {
  if (!metadata) {
    return {};
  }

  try {
    const parsed = JSON.parse(metadata) as RoomAccessMetadata;

    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function verifySecret(secret: string, salt?: string, expectedHash?: string) {
  if (!salt || !expectedHash) {
    return false;
  }

  const attemptedHash = createSecretHash(secret, salt);
  const expected = Buffer.from(expectedHash, "hex");
  const actual = Buffer.from(attemptedHash, "hex");

  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function verifyRoomPassword(
  password: string,
  metadata: RoomAccessMetadata,
) {
  const access = metadata.access;

  if (!access?.salt || !access.passwordHash) {
    return true;
  }

  return verifySecret(password, access.salt, access.passwordHash);
}

export function verifyHostKey(hostKey: string, metadata: RoomAccessMetadata) {
  const host = metadata.host;

  if (!hostKey || !host?.salt || !host.keyHash) {
    return false;
  }

  return verifySecret(hostKey, host.salt, host.keyHash);
}
