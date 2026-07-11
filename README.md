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
```

6. Restart the dev server after saving `.env`.

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
- Database
- Chat
- Screen sharing
- Whiteboard
- Recording
- Payments
- Admin tools
- AI features
