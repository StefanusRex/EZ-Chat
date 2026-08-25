import { createReadStream } from "node:fs";
import { existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";

const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT || 8080);
const rooms = new Map();
const mimeTypes = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
};

function send(socket, message) {
  if (socket.readyState === 1) socket.send(JSON.stringify(message));
}

const httpServer = createServer((request, response) => {
  const requested = request.url?.split("?")[0] || "/";
  const filePath = normalize(
    join(root, requested === "/" ? "index.html" : requested),
  );
  if (
    !filePath.startsWith(root) ||
    !existsSync(filePath) ||
    !statSync(filePath).isFile()
  ) {
    response.writeHead(404).end("Not found");
    return;
  }
  response.writeHead(200, {
    "Content-Type": mimeTypes[extname(filePath)] || "application/octet-stream",
  });
  createReadStream(filePath).pipe(response);
});

const websocketServer = new WebSocketServer({ server: httpServer });
websocketServer.on("connection", (socket) => {
  socket.on("message", (raw) => {
    let message;
    try {
      message = JSON.parse(raw);
    } catch {
      return send(socket, { type: "error", message: "Invalid request." });
    }
    if (message.type === "create") {
      if (!message.roomId)
        return send(socket, { type: "error", message: "Room ID is required." });
      if (rooms.has(message.roomId))
        return send(socket, { type: "error", message: "Room already exists." });
      rooms.set(message.roomId, { creator: socket, peers: new Set() });
      socket.roomId = message.roomId;
      socket.isCreator = true;
      return send(socket, { type: "created", roomId: message.roomId });
    }
    if (message.type === "join") {
      const room = rooms.get(message.roomId);
      if (!room)
        return send(socket, { type: "error", message: "Room not found." });
      socket.roomId = message.roomId;
      room.peers.add(socket);
      send(socket, { type: "joined" });
      if (room.creator !== socket) send(room.creator, { type: "peer-ready" });
      return;
    }
    // The signaling server forwards SDP only; chat and media stay peer-to-peer.
    const room = rooms.get(socket.roomId);
    if (
      !room ||
      (message.type !== "offer" &&
        message.type !== "answer" &&
        message.type !== "ice")
    )
      return;
    const recipients = socket.isCreator ? [...room.peers] : [room.creator];
    recipients.forEach((peer) =>
      send(peer, { ...message, from: socket.isCreator ? "creator" : "guest" }),
    );
  });
  socket.on("close", () => {
    const room = rooms.get(socket.roomId);
    if (!room) return;
    if (room.creator === socket) {
      room.peers.forEach((peer) => send(peer, { type: "room-closed" }));
      rooms.delete(socket.roomId);
    } else {
      room.peers.delete(socket);
      send(room.creator, { type: "peer-left" });
    }
  });
});

httpServer.listen(port, () => console.log(`EZ Chat listening on port ${port}`));
