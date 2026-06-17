import { useEffect, useRef, useState, useCallback } from "react";
import { io } from "socket.io-client";
import { sha256 } from "../utils/crypto";

const SIGNAL_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:3001";
const CHUNK_SIZE = 16 * 1024; // 16 KB — WebRTC data channel limit

// ICE servers: Google's public STUN servers help peers find their public IPs.
// For production, add a TURN server (Twilio, Metered, etc.) for relay fallback.
const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

// ── SENDER HOOK ──────────────────────────────────────────────────────────────
export function useSender() {
  const [status, setStatus] = useState("idle"); // idle | waiting | connecting | transferring | done | error
  const [progress, setProgress] = useState(0);  // 0-100
  const [speed, setSpeed] = useState(0);         // bytes/s
  const [roomId, setRoomId] = useState(null);
  const [error, setError] = useState(null);

  const socketRef = useRef(null);
  const pcRef = useRef(null);         // RTCPeerConnection
  const fileRef = useRef(null);

  const startTransfer = useCallback(async (file) => {
    fileRef.current = file;

    const socket = io(SIGNAL_URL);
    socketRef.current = socket;

    // Generate a random room ID
    const id = Math.random().toString(36).slice(2, 10);
    setRoomId(id);

    socket.emit("create-room", {
      roomId: id,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
    });

    socket.on("room-created", () => {
      setStatus("waiting");
    });

    // Receiver joined — now we initiate the WebRTC handshake
    socket.on("receiver-ready", async () => {
      setStatus("connecting");

      const pc = new RTCPeerConnection(ICE_SERVERS);
      pcRef.current = pc;

      // Create data channel (sender always creates it)
      const channel = pc.createDataChannel("file-transfer", {
        ordered: true,  // Guarantee chunk order
      });

      channel.binaryType = "arraybuffer";

      channel.onopen = () => sendFile(channel, file, setProgress, setSpeed, setStatus);

      channel.onclose = () => {
        if (status !== "done") setStatus("error");
      };

      // Trickle ICE: send each candidate as it's discovered
      pc.onicecandidate = ({ candidate }) => {
        if (candidate) {
          socket.emit("ice-candidate", { roomId: id, candidate });
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit("webrtc-offer", { roomId: id, offer });
    });

    socket.on("webrtc-answer", async ({ answer }) => {
      await pcRef.current?.setRemoteDescription(answer);
    });

    socket.on("ice-candidate", async ({ candidate }) => {
      try {
        await pcRef.current?.addIceCandidate(candidate);
      } catch (e) {
        console.warn("ICE candidate error:", e);
      }
    });

    socket.on("peer-disconnected", ({ role }) => {
      if (role === "receiver") {
        setStatus("waiting");
        setProgress(0);
      }
    });

    socket.on("error", ({ message }) => {
      setError(message);
      setStatus("error");
    });
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      pcRef.current?.close();
      socketRef.current?.disconnect();
    };
  }, []);

  return { startTransfer, status, progress, speed, roomId, error };
}

// ── RECEIVER HOOK ─────────────────────────────────────────────────────────────
export function useReceiver(roomId) {
  const [status, setStatus] = useState("joining"); // joining | waiting | receiving | verifying | done | error
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState(0);
  const [meta, setMeta] = useState(null);          // { fileName, fileSize, fileType }
  const [error, setError] = useState(null);

  const socketRef = useRef(null);
  const pcRef = useRef(null);

  useEffect(() => {
    if (!roomId) return;

    const socket = io(SIGNAL_URL);
    socketRef.current = socket;

    socket.emit("join-room", { roomId });

    socket.on("room-joined", ({ meta }) => {
      setMeta(meta);
      setStatus("waiting");
    });

    socket.on("webrtc-offer", async ({ offer }) => {
      setStatus("receiving");

      const pc = new RTCPeerConnection(ICE_SERVERS);
      pcRef.current = pc;

      pc.onicecandidate = ({ candidate }) => {
        if (candidate) {
          socket.emit("ice-candidate", { roomId, candidate });
        }
      };

      // Receiver listens for the data channel the sender created
      pc.ondatachannel = ({ channel }) => {
        channel.binaryType = "arraybuffer";
        receiveFile(channel, setProgress, setSpeed, setStatus, setError);
      };

      await pc.setRemoteDescription(offer);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("webrtc-answer", { roomId, answer });
    });

    socket.on("ice-candidate", async ({ candidate }) => {
      try {
        await pcRef.current?.addIceCandidate(candidate);
      } catch (e) {
        console.warn("ICE candidate error:", e);
      }
    });

    socket.on("peer-disconnected", ({ role }) => {
      if (role === "sender" && status !== "done") {
        setError("Sender disconnected before transfer completed.");
        setStatus("error");
      }
    });

    socket.on("error", ({ message }) => {
      setError(message);
      setStatus("error");
    });

    return () => {
      pcRef.current?.close();
      socket.disconnect();
    };
  }, [roomId]);

  return { status, progress, speed, meta, error };
}

// ── HELPERS ───────────────────────────────────────────────────────────────────

/**
 * Sender side: read file as ArrayBuffer, compute hash, send metadata + chunks.
 * Protocol:
 *   1. Send JSON string: { type: "meta", fileName, fileSize, fileType, hash, totalChunks }
 *   2. Send each chunk as raw ArrayBuffer
 *   3. Send JSON string: { type: "done" }
 */
async function sendFile(channel, file, setProgress, setSpeed, setStatus) {
  setStatus("transferring");

  const buffer = await file.arrayBuffer();
  const hash = await sha256(buffer);
  const totalChunks = Math.ceil(buffer.byteLength / CHUNK_SIZE);

  // Step 1: metadata
  channel.send(
    JSON.stringify({
      type: "meta",
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
      hash,
      totalChunks,
    })
  );

  // Step 2: chunks — throttle to avoid overwhelming the buffer
  let bytesSent = 0;
  let lastTime = Date.now();
  let lastBytes = 0;

  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE;
    const chunk = buffer.slice(start, start + CHUNK_SIZE);

    // Wait if the data channel buffer is getting full (backpressure)
    while (channel.bufferedAmount > 4 * 1024 * 1024) {
      await sleep(10);
    }

    channel.send(chunk);
    bytesSent += chunk.byteLength;

    const now = Date.now();
    const elapsed = (now - lastTime) / 1000;
    if (elapsed >= 0.5) {
      setSpeed((bytesSent - lastBytes) / elapsed);
      lastBytes = bytesSent;
      lastTime = now;
    }

    setProgress(Math.round((bytesSent / file.size) * 100));
  }

  // Step 3: done signal
  channel.send(JSON.stringify({ type: "done" }));
  setStatus("done");
}

/**
 * Receiver side: accumulate chunks, verify hash, trigger download.
 */
function receiveFile(channel, setProgress, setSpeed, setStatus, setError) {
  let meta = null;
  const chunks = [];
  let bytesReceived = 0;
  let lastTime = Date.now();
  let lastBytes = 0;

  channel.onmessage = async ({ data }) => {
    // Text messages are control frames (meta / done)
    if (typeof data === "string") {
      const msg = JSON.parse(data);

      if (msg.type === "meta") {
        meta = msg;
        setStatus("receiving");
        return;
      }

      if (msg.type === "done") {
        setStatus("verifying");

        // Reassemble
        const totalSize = chunks.reduce((acc, c) => acc + c.byteLength, 0);
        const assembled = new Uint8Array(totalSize);
        let offset = 0;
        for (const chunk of chunks) {
          assembled.set(new Uint8Array(chunk), offset);
          offset += chunk.byteLength;
        }

        // Verify hash
        const receivedHash = await sha256(assembled.buffer);
        if (receivedHash !== meta.hash) {
          setError("Hash mismatch — file may be corrupted.");
          setStatus("error");
          return;
        }

        // Trigger download
        const blob = new Blob([assembled], { type: meta.fileType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = meta.fileName;
        a.click();
        URL.revokeObjectURL(url);

        setProgress(100);
        setStatus("done");
        return;
      }
    }

    // Binary data = a file chunk
    chunks.push(data);
    bytesReceived += data.byteLength;

    const now = Date.now();
    const elapsed = (now - lastTime) / 1000;
    if (elapsed >= 0.5) {
      setSpeed((bytesReceived - lastBytes) / elapsed);
      lastBytes = bytesReceived;
      lastTime = now;
    }

    if (meta) {
      setProgress(Math.round((bytesReceived / meta.fileSize) * 100));
    }
  };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
