# P2P Share — Direct Browser-to-Browser File Transfer

Zero server storage. File bytes go directly peer-to-peer via WebRTC.
The signaling server only brokers the initial handshake.

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

### Backend (Render / Railway)
1. Push `server/` to a repo (or monorepo)
2. Set build command: `npm install`
3. Set start command: `node index.js`
4. Set env var: `CLIENT_URL=https://your-frontend.vercel.app`

### Frontend (Vercel / Netlify)
1. Set root directory to `client/`
2. Build command: `npm run build`
3. Output directory: `dist`
4. Add env var: `VITE_SERVER_URL=https://your-backend.onrender.com`

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

Once the P2P connection is established, the signal server is no longer involved.
File chunks are sent in 16 KB pieces with SHA-256 hash verification on completion.

## Limitations (MVP)
- Max 50 MB (browser RAM limit for FileReader)
- 1-to-1 transfer only
- No resume on disconnect

## Brownie point extensions (not implemented)
- Large file support via OPFS / Streams API
- Zero-knowledge AES-GCM encryption via URL hash key
- Multi-peer mesh swarming
- Auto-resume on connection drop
