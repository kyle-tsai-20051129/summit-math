# Summit Video

A minimal two-person browser video call app built with Next.js and LiveKit.

## LiveKit Setup

The app needs a LiveKit project before real video calls can connect.

1. Go to https://cloud.livekit.io/ and sign in.
2. Create a new LiveKit Cloud project.
3. Open the project settings.
4. Copy these values:
   - Project WebSocket URL, usually like `wss://your-project.livekit.cloud`
   - API key
   - API secret
5. Create a `.env` file in this project root:

```env
LIVEKIT_API_KEY=your_api_key
LIVEKIT_API_SECRET=your_api_secret
LIVEKIT_URL=wss://your-project.livekit.cloud
ROOM_DATABASE_PATH=data/summit-video.db
ROOM_EMPTY_TTL_HOURS=24
TOKEN_RATE_LIMIT_MAX_REQUESTS=20
TOKEN_RATE_LIMIT_WINDOW_SECONDS=60
PASSWORD_RATE_LIMIT_MAX_REQUESTS=5
PASSWORD_RATE_LIMIT_WINDOW_SECONDS=900
LESSON_S3_BUCKET=your-private-bucket
LESSON_S3_REGION=us-east-1
LESSON_S3_ENDPOINT=
LESSON_S3_ACCESS_KEY_ID=your_access_key
LESSON_S3_SECRET_ACCESS_KEY=your_secret_key
LESSON_S3_FORCE_PATH_STYLE=false
```

6. Restart the dev server after saving `.env`.

## Persistent Room Settings

Room passwords, host ownership, room lock state, waiting-room preferences, and pending approval requests are stored in a local SQLite database by default at `data/summit-video.db`. The database file is ignored by Git.

Set `ROOM_DATABASE_PATH` when you want the database in a different persistent location. For production deployment, point it at durable storage or replace this local SQLite layer with a managed database.

Empty rooms are automatically removed with their saved password, host, and waiting-room settings after `ROOM_EMPTY_TTL_HOURS` of inactivity (24 hours by default). Active rooms are preserved. Cleanup runs during normal room requests, at most once every five minutes per server process.

## Production Readiness

The server validates the LiveKit environment variables before using the room APIs. Deployments can check `GET /api/health`: it returns `200` when the required LiveKit settings are valid and `503` when they are missing or malformed.

Join-token requests are limited per client IP address, and incorrect password attempts are additionally limited per room. Configure the limits with the `TOKEN_RATE_LIMIT_*` and `PASSWORD_RATE_LIMIT_*` variables above. The built-in limiter is intentionally lightweight and stored in process memory; use a shared provider such as Redis or your hosting platform's edge rate limiter before running multiple application instances.

New room passwords use a salted `scrypt` hash and are never returned to clients or written to application logs. Existing protected rooms using the prior hash format remain compatible.

## PDF Lesson Uploads

Hosts can upload PDFs up to 25 MB from Host controls. In development, when S3 is not configured, uploads are stored locally under `data/lesson-uploads` (or `LESSON_LOCAL_STORAGE_PATH`) so the feature works out of the box. This directory is ignored by Git and is only suitable for local development. In production, PDFs must use the private S3-compatible bucket configured with the `LESSON_S3_*` variables. Allow browser `PUT` requests from the deployed app origin in the bucket's CORS policy.

## Host Recovery

When creating a room, the creator is shown a one-time host recovery key before the device preview. Store it somewhere private. After leaving the host tab or joining from a new browser, use **Recover host access** in the Join room flow and enter that key to regain host controls. The server stores only a hash of the key; normal participants do not receive host access.

## Run Locally

```bash
npm.cmd install
npm.cmd run dev
```

Open http://localhost:3000 and join the same room from two browsers or devices.

## Test A Real Call

1. Join room `test` in one browser.
2. Join room `test` in another browser, private window, or device.
3. Allow camera and microphone access in both browsers.
4. Confirm both people can see and hear each other.
5. Test mute, camera off/on, and leave.

## Current Scope

Included:

- Landing page
- Room join by name
- Real LiveKit video/audio call
- Waiting state
- Mute/unmute
- Camera on/off
- Leave room
- Copy room link

Not included yet:

- Accounts
- Chat
- Screen sharing
- Whiteboard
- Recording
- Payments
- Admin tools
- AI features
