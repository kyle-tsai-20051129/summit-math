import { createHmac, timingSafeEqual } from "crypto";

const lessonAccessTokenLifetimeMs = 4 * 60 * 60 * 1000;

type LessonAccessPayload = {
  roomName: string;
  expiresAt: number;
};

function sign(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createLessonAccessToken(roomName: string, secret: string) {
  const payload = Buffer.from(
    JSON.stringify({ roomName, expiresAt: Date.now() + lessonAccessTokenLifetimeMs }),
  ).toString("base64url");

  return `${payload}.${sign(payload, secret)}`;
}

export function hasValidLessonAccessToken(
  token: string,
  roomName: string,
  secret: string,
) {
  const [payload, signature] = token.split(".");

  if (!payload || !signature) {
    return false;
  }

  const expectedSignature = sign(payload, secret);
  const expectedBuffer = Buffer.from(expectedSignature);
  const suppliedBuffer = Buffer.from(signature);

  if (
    expectedBuffer.length !== suppliedBuffer.length ||
    !timingSafeEqual(expectedBuffer, suppliedBuffer)
  ) {
    return false;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as Partial<LessonAccessPayload>;

    return (
      parsed.roomName === roomName &&
      typeof parsed.expiresAt === "number" &&
      parsed.expiresAt > Date.now()
    );
  } catch {
    return false;
  }
}
