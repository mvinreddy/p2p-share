# P2P Share — Direct Browser-to-Browser File Transfer

A file-sharing web app where files move directly between two browsers
over WebRTC. A lightweight signaling server only coordinates the initial
connection handshake — it never receives, stores, or proxies file data.

**Live app:** https://p2p-share-rose.vercel.app
**Signaling server:** https://p2p-share-4fgx.onrender.com (health check: `/health`)

## How it works

1. Sender drops a file → a unique room ID is generated.
2. The signaling server relays a WebRTC offer/answer and ICE candidates
   between sender and receiver to establish a direct connection.
3. Once connected, the file is split into 16 KB chunks and streamed
   directly over a WebRTC data channel — no server in the loop anymore.
4. The receiver reassembles the chunks, verifies a SHA-256 hash against
   the original, and auto-downloads the file.

```
Sender browser                  Signal server              Receiver browser
     |── create-room ──────────────>|                            |
     |<─ room-created ──────────────|                            |
     |                              |<── join-room ──────────────|
     |<─ receiver-ready ────────────|─── room-joined ───────────>|
     |── webrtc-offer ─────────────>|── webrtc-offer ───────────>|
     |<─ webrtc-answer ─────────────|<── webrtc-answer ──────────|
     |── ice-candidate ────────────>|── ice-candidate ───────────>|
     |<══════════ Direct P2P data channel (file chunks) ════════>|
```

## Features

- Drag-and-drop file upload, max 50 MB
- WebRTC data channel transfer, chunked at 16 KB
- SHA-256 hash verification (sender computes it, receiver checks it on completion)
- Real-time progress %, transfer speed, and connection status
- Graceful handling of peer disconnects (no crash, UI notifies the other side)
- Auto-download on the receiving end once verified
- STUN (Google public servers) + TURN relay fallback for NAT traversal
- CORS locked to the deployed frontend origin

## File Structure

```
p2p-share/
├── server/
│   ├── index.js          ← Socket.io signaling server
│   └── package.json
└── client/
    ├── src/
    │   ├── App.jsx              ← Router
    │   ├── pages/
    │   │   ├── Sender.jsx       ← Drop file, generate link
    │   │   └── Receiver.jsx     ← Join room, download file
    │   ├── hooks/
    │   │   └── useWebRTC.js     ← WebRTC connection + chunking logic
    │   └── utils/
    │       └── crypto.js        ← SHA-256 hash helper
    ├── vercel.json               ← SPA rewrite (fixes 404 on direct room links)
    ├── .env.example
    └── package.json
```

## Local Development

```bash
# Terminal 1 — signaling server
cd server
npm install
npm run dev          # http://localhost:3001

# Terminal 2 — frontend
cd client
npm install
cp .env.example .env.local   # VITE_SERVER_URL=http://localhost:3001
npm run dev          # http://localhost:5173
```

Open `http://localhost:5173`, drop a file, copy the room link, open it
in a second tab. Visiting `http://localhost:3001` directly shows
"Cannot GET /" — expected, since this server has no UI, only a `/health`
route and Socket.io event handlers.

## Deployment

### Backend → Render
| Setting | Value |
|---|---|
| Root Directory | `server` |
| Build Command | `npm install` |
| Start Command | `node index.js` |
| Env var: `CLIENT_URL` | your exact Vercel URL, **no trailing slash** |

### Frontend → Vercel
| Setting | Value |
|---|---|
| Root Directory | `client` |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Env var: `VITE_SERVER_URL` | your exact Render URL |
| Env vars (optional): `VITE_TURN_URL`, `VITE_TURN_USERNAME`, `VITE_TURN_CREDENTIAL` | TURN credentials, e.g. from Metered.ca |

Deploy order: push to GitHub → deploy backend, copy its URL → deploy
frontend with that URL set → go back to Render and set `CLIENT_URL` to
the frontend URL → redeploy backend.

Vite env vars are baked in at build time — changing one on Vercel
requires triggering a redeploy, not just saving the setting.

## Current Limitations

- 50 MB file size cap (entire file is read into browser memory)
- One sender, one receiver per room — no multi-peer support
- No transfer resume — a dropped connection restarts from 0%
- File chunks are not application-level encrypted (WebRTC's own DTLS
  transport encryption still applies, but there's no additional
  end-to-end encryption layer)
