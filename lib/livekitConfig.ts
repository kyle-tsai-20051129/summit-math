export type LiveKitConfig = {
  apiKey: string;
  apiSecret: string;
  livekitUrl: string;
};

export const liveKitConfigurationError =
  "Video calling is not configured on this deployment. Please contact the site owner.";

export function getLiveKitConfig(): LiveKitConfig | null {
  const apiKey = process.env.LIVEKIT_API_KEY?.trim();
  const apiSecret = process.env.LIVEKIT_API_SECRET?.trim();
  const livekitUrl = process.env.LIVEKIT_URL?.trim();

  if (
    !apiKey ||
    !apiSecret ||
    !livekitUrl ||
    apiKey === "your_api_key" ||
    apiSecret === "your_api_secret"
  ) {
    return null;
  }

  try {
    const url = new URL(livekitUrl);
    if (
      (url.protocol !== "wss:" && url.protocol !== "ws:") ||
      (process.env.NODE_ENV === "production" && url.protocol !== "wss:")
    ) {
      return null;
    }
  } catch {
    return null;
  }

  return { apiKey, apiSecret, livekitUrl };
}

export function toRoomServiceUrl(livekitUrl: string) {
  return livekitUrl.replace(/^wss:\/\//, "https://").replace(/^ws:\/\//, "http://");
}
