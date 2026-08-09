"use strict";
// webosu server entry: owns listen + the WebSocket (multiplayer/spectate) layer.
// HTTP/API + static + SSE live in ./app (buildApp), which can be tested with inject().
const { WebSocketServer } = require("ws");
const { buildApp } = require("./app");

const PORT = process.env.PORT || 8080;
const app = buildApp();

// ---------- multiplayer + spectate over websocket (minimal, real) ----------
const wss = new WebSocketServer({ server: app.server, path: "/ws" });
const rooms = new Map(); // roomId -> { name, host, clients: Map(ws -> {name, ready}) }

wss.on("connection", (ws) => {
  let joinedRoom = null;
  let joinedName = null;
  ws.on("message", (msg) => {
    let m;
    try { m = JSON.parse(msg.toString()); } catch (e) { return; }
    if (m.type === "join") {
      const roomId = m.room || "lobby";
      joinedRoom = roomId;
      joinedName = (m.username || "guest").toString().slice(0, 20);
      if (!rooms.has(roomId))
        rooms.set(roomId, { name: roomId, host: joinedName, clients: new Map() });
      const room = rooms.get(roomId);
      room.clients.set(ws, { name: joinedName, ready: false });
      send(ws, { type: "room", room: roomId, host: room.host, users: usersIn(room) });
      broadcast(room, { type: "join", name: joinedName, users: usersIn(room) }, ws);
    } else if (m.type === "cursor" && joinedRoom) {
      const room = rooms.get(joinedRoom);
      if (room) broadcast(room, { type: "cursor", name: joinedName, x: m.x, y: m.y, t: m.t }, ws);
    } else if (m.type === "chat" && joinedRoom) {
      const room = rooms.get(joinedRoom);
      if (room) broadcast(room, { type: "chat", name: joinedName, text: String(m.text || "").slice(0, 300), t: Date.now() }, ws);
    } else if (m.type === "ready" && joinedRoom) {
      const room = rooms.get(joinedRoom);
      if (room) {
        const c = room.clients.get(ws);
        if (c) c.ready = !!m.ready;
        broadcast(room, { type: "ready", name: joinedName, ready: !!m.ready });
      }
    } else if (m.type === "start" && joinedRoom) {
      const room = rooms.get(joinedRoom);
      if (room && room.host === joinedName)
        broadcast(room, { type: "start", beatmap_id: m.beatmap_id });
    }
  });
  ws.on("close", () => {
    if (joinedRoom && rooms.has(joinedRoom)) {
      const room = rooms.get(joinedRoom);
      room.clients.delete(ws);
      broadcast(room, { type: "leave", name: joinedName, users: usersIn(room) });
      if (room.clients.size === 0) rooms.delete(joinedRoom);
    }
  });
});

function send(ws, obj) { try { ws.send(JSON.stringify(obj)); } catch (e) {} }
function usersIn(room) { return [...room.clients.values()].map((c) => ({ name: c.name, ready: c.ready })); }
function broadcast(room, obj, exceptWs) {
  for (const [c] of room.clients) if (c !== exceptWs) send(c, obj);
}

app
  .listen({ port: PORT, host: "0.0.0.0" })
  .then(() => console.log("webosu-server (fastify) listening on :" + PORT))
  .catch((err) => { console.error(err); process.exit(1); });
