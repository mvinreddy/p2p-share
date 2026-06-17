# P2P Share — Direct Browser-to-Browser File Transfer

Zero server storage. File bytes go directly peer-to-peer via WebRTC.
The signaling server only brokers the initial handshake.

**Live app:** https://p2p-share-rose.vercel.app/
**Signaling server:** https://p2p-share-4fgx.onrender.com (health check: `/health`)

> Replace the two URLs above with your actual Vercel and Render URLs once deployed.

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
    │   │   └── useWebRTC.js     ← All WebRTC + chunking logic
    │   └── utils/
    │       └── crypto.js        ← SHA-256 hash helper
    ├── .env.example
    └── package.json
```

## Local Development

### 1. Start the signaling server
```bash
cd server
npm install
npm run dev          # runs on http://localhost:3001
```

Note: visiting `http://localhost:3001` directly in a browser will show
"Cannot GET /" — that's expected. This server has no UI; it only relays
Socket.io messages. The only route it serves is `/health`.

### 2. Start the React client
```bash
cd client
npm install
cp .env.example .env.local   # VITE_SERVER_URL=http://localhost:3001
npm run dev          # runs on http://localhost:5173
```

### 3. Test it
- Open http://localhost:5173 → drop a file → copy the room link
- Open the room link in another tab or browser → file downloads automatically

## Deployment

This app is deployed as two separate services: a backend (signaling server)
and a frontend (static React app). Below is the exact setup used for the
live URLs above — use it as a template if you redeploy or fork this.

### Backend → Render

| Setting | Value |
|---|---|
| Root Directory | `server` |
| Build Command | `npm install` |
| Start Command | `node index.js` |
| Instance Type | Free |
| Env var: `CLIENT_URL` | `https://your-app.vercel.app` |

Deploy this first without `CLIENT_URL` set (it's fine — the server falls
back to allowing all origins), grab the resulting `.onrender.com` URL,
then come back and set `CLIENT_URL` once the frontend is deployed.

### Frontend → Vercel

| Setting | Value |
|---|---|
| Root Directory | `client` |
| Framework Preset | Vite |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Install Command | `npm install` |
| Env var: `VITE_SERVER_URL` | `https://your-server.onrender.com` |

### Deploy order
1. Push code to GitHub.
2. Deploy backend on Render → copy its URL.
3. Deploy frontend on Vercel, setting `VITE_SERVER_URL` to the Render URL → copy its URL.
4. Go back to Render → set `CLIENT_URL` to the Vercel URL → it auto-redeploys.
5. Open the Vercel URL, drop a file, test the room link on a second device.

### A note on Render's free tier
Free services spin down after inactivity. The first request after idle
time can take 30–60 seconds to wake up — if a room seems stuck on
"waiting" right after a period of no use, give it a minute before
assuming something broke.

## How it works

```
Sender browser                  Signal server              Receiver browser
     |                               |                            |
     |── create-room ──────────────>|                            |
     |<─ room-created ──────────────|                            |
     |                              |<── join-room ──────────────|
     |<─ receiver-ready ────────────|─── room-joined ───────────>|
     |── webrtc-offer ─────────────>|── webrtc-offer ───────────>|
     |<─ webrtc-answer ─────────────|<── webrtc-answer ──────────|
     |── ice-candidate ────────────>|── ice-candidate ───────────>|
     |                              |                            |
     |<══════════ Direct P2P data channel (file chunks) ════════>|
```

Once the P2P connection is established, the signal server is no longer
involved. File chunks are sent in 16 KB pieces with SHA-256 hash
verification on completion. The signaling server never sees file
content — only room IDs and connection metadata (SDP offers/answers,
ICE candidates).

## Limitations (MVP)
- Max 50 MB (browser RAM limit for FileReader)
- 1-to-1 transfer only
- No resume on disconnect
- No TURN server configured — transfers may fail between peers on
  restrictive/symmetric NAT networks (e.g. some corporate or mobile
  carrier networks). Add a TURN server (Twilio, Metered.ca free tier)
  to `ICE_SERVERS` in `useWebRTC.js` if this becomes an issue.

## Brownie point extensions (not implemented)
- Large file support via OPFS / Streams API
- Zero-knowledge AES-GCM encryption via URL hash key
- Multi-peer mesh swarming
- Auto-resume on connection drop