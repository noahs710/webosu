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

const wsRate = new Map();
function wsOk(ws, limit, windowMs = 1000) {
  const now = Date.now();
  let arr = (wsRate.get(ws) || []).filter(t => now - t < windowMs);
  arr.push(now);
  wsRate.set(ws, arr);
  return arr.length <= limit;
}
wss.on("connection", (ws) => {
  let joinedRoom = null;
  let joinedName = null;
  ws.on("message", (msg) => {
    let m;
    try { m = JSON.parse(msg.toString()); } catch (e) { return; }
    if (m.type === "join") {
      const roomId = String(m.room || "lobby").toLowerCase().replace(/[^a-z0-9_-]/g, "_").slice(0, 30);
      joinedRoom = roomId;
      joinedName = String(m.username || "guest").replace(/[<>&"']/g, "_").slice(0, 20);
      if (!rooms.has(roomId))
        rooms.set(roomId, { name: roomId, host: joinedName, clients: new Map() });
      const room = rooms.get(roomId);
      room.clients.set(ws, { name: joinedName, ready: false });
      send(ws, { type: "room", room: roomId, host: room.host, users: usersIn(room) });
      broadcast(room, { type: "join", name: joinedName, users: usersIn(room) }, ws);
    } else if (m.type === "cursor" && joinedRoom) {
      if (!wsOk(ws, 60, 1000)) return;
      const room = rooms.get(joinedRoom);
      if (room) broadcast(room, { type: "cursor", name: joinedName, x: +m.x || 0, y: +m.y || 0, t: +m.t || Date.now() }, ws);
    } else if (m.type === "chat" && joinedRoom) {
      if (!wsOk(ws, 5, 2000)) return;
      const room = rooms.get(joinedRoom);
      if (room) broadcast(room, { type: "chat", name: joinedName, text: String(m.text || "").replace(/[<>&"]/g, "_").slice(0, 300), t: Date.now() }, ws);
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
        broadcast(room, { type: "start", beatmap_id: parseInt(m.beatmap_id, 10) || 0 });
    }
  });
  ws.on("close", () => {
    wsRate.delete(ws);
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
