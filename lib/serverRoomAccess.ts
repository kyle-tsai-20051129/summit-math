import { createHash, randomBytes, scryptSync, timingSafeEqual } from "crypto";

export const hostMetadataVersion = 1;
export const passwordMetadataVersion = 2;
const passwordHashPrefix = "scrypt:";
const passwordHashKeyLength = 32;
const passwordHashOptions = { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

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
    waitingRoomEnabled?: boolean;
  };
  waitingRoom?: {
    requests?: WaitingRoomRequest[];
  };
};

export type WaitingRoomRequest = {
  id: string;
  displayName: string;
  createdAt: number;
  status: "pending" | "admitted" | "denied";
};

const waitingRoomRequestLifetimeMs = 2 * 60 * 60 * 1000;

export function getWaitingRoomRequests(metadata: RoomAccessMetadata) {
  const now = Date.now();

  return (metadata.waitingRoom?.requests ?? []).filter(
    (request): request is WaitingRoomRequest =>
      typeof request?.id === "string" &&
      typeof request.displayName === "string" &&
      typeof request.createdAt === "number" &&
      (request.status === "pending" ||
        request.status === "admitted" ||
        request.status === "denied") &&
      now - request.createdAt < waitingRoomRequestLifetimeMs,
  );
}

export function withWaitingRoomRequests(
  metadata: RoomAccessMetadata,
  requests: WaitingRoomRequest[],
): RoomAccessMetadata {
  return {
    ...metadata,
    waitingRoom: {
      ...metadata.waitingRoom,
      requests,
    },
  };
}

export function createSecretHash(secret: string, salt: string) {
  return createHash("sha256").update(`${salt}:${secret}`).digest("hex");
}

export function createPasswordMetadata(password: string) {
  const salt = randomBytes(16).toString("hex");
  const passwordHash = scryptSync(
    password,
    salt,
    passwordHashKeyLength,
    passwordHashOptions,
  ).toString("hex");

  return {
    version: passwordMetadataVersion,
    salt,
    passwordHash: `${passwordHashPrefix}${passwordHash}`,
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

  if (access.passwordHash.startsWith(passwordHashPrefix)) {
    const expectedHash = access.passwordHash.slice(passwordHashPrefix.length);
    const attemptedHash = scryptSync(
      password,
      access.salt,
      passwordHashKeyLength,
      passwordHashOptions,
    ).toString("hex");
    const expected = Buffer.from(expectedHash, "hex");
    const actual = Buffer.from(attemptedHash, "hex");

    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }

  // Rooms created before the stronger scrypt format remain joinable.
  return verifySecret(password, access.salt, access.passwordHash);
}

export function verifyHostKey(hostKey: string, metadata: RoomAccessMetadata) {
  const host = metadata.host;

  if (!hostKey || !host?.salt || !host.keyHash) {
    return false;
  }

  return verifySecret(hostKey, host.salt, host.keyHash);
}
