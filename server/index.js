const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(
  cors({
    origin: process.env.CLIENT_URL || "*",
  })
);

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || "*",
    methods: ["GET", "POST"],
  },
});

// Track rooms: roomId → { sender: socketId, receiver: socketId | null }
const rooms = new Map();

app.get("/health", (req, res) => res.json({ status: "ok" }));

io.on("connection", (socket) => {
  console.log("Socket connected:", socket.id);

  // ── Sender creates a room ──────────────────────────────────────────────
  socket.on("create-room", ({ roomId, fileName, fileSize, fileType }) => {
    rooms.set(roomId, {
      sender: socket.id,
      receiver: null,
      meta: { fileName, fileSize, fileType },
    });
    socket.join(roomId);
    socket.emit("room-created", { roomId });
    console.log(`Room created: ${roomId} by ${socket.id}`);
  });

  // ── Receiver joins a room ──────────────────────────────────────────────
  socket.on("join-room", ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) {
      socket.emit("error", { message: "Room not found or expired." });
      return;
    }
    if (room.receiver) {
      socket.emit("error", { message: "Room already has a receiver." });
      return;
    }

    room.receiver = socket.id;
    socket.join(roomId);

    // Send file metadata to receiver so they know what's coming
    socket.emit("room-joined", { meta: room.meta });

    // Tell sender that receiver is ready — sender will now initiate WebRTC offer
    io.to(room.sender).emit("receiver-ready");
    console.log(`Receiver ${socket.id} joined room ${roomId}`);
  });

  // ── WebRTC signaling relay ─────────────────────────────────────────────
  // These messages are just forwarded — server never inspects them
  socket.on("webrtc-offer", ({ roomId, offer }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    // Forward offer to the other peer in the room
    socket.to(roomId).emit("webrtc-offer", { offer });
  });

  socket.on("webrtc-answer", ({ roomId, answer }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    socket.to(roomId).emit("webrtc-answer", { answer });
  });

  socket.on("ice-candidate", ({ roomId, candidate }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    socket.to(roomId).emit("ice-candidate", { candidate });
  });

  // ── Disconnect handling ────────────────────────────────────────────────
  socket.on("disconnect", () => {
    console.log("Socket disconnected:", socket.id);

    for (const [roomId, room] of rooms.entries()) {
      if (room.sender === socket.id) {
        // Sender left — notify receiver
        io.to(roomId).emit("peer-disconnected", { role: "sender" });
        rooms.delete(roomId);
        break;
      }
      if (room.receiver === socket.id) {
        // Receiver left — notify sender
        io.to(roomId).emit("peer-disconnected", { role: "receiver" });
        room.receiver = null;
        break;
      }
    }
  });
});

// Clean up stale rooms every 10 minutes
setInterval(() => {
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [roomId] of rooms.entries()) {
    if (!io.sockets.adapter.rooms.has(roomId)) {
      rooms.delete(roomId);
    }
  }
}, 60_000);

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`Signaling server on port ${PORT}`));
