"use strict";
// Integration test for the Phase 5 real-time features that app.inject() can't
// reach: the WebSocket multiplayer/spectate layer (server/index.js) and the SSE
// live-activity feed (/api/activity). Spawns the real server on a fixed port,
// drives a two-client room through join/chat/ready/cursor/start/leave, and
// verifies a submitted score is broadcast to an SSE listener.
// Run: node server/test/ws-sse.js
const { spawn } = require("child_process");
const http = require("http");
const os = require("os"), path = require("path"), fs2 = require("fs");
const WebSocket = require("ws");

const PORT = 8091;
const tmp = fs2.mkdtempSync(path.join(os.tmpdir(), "webosu-ws-"));
const env = { ...process.env, PORT: String(PORT), DATA_DIR: tmp, DB_PATH: path.join(tmp, "ws.db"), JWT_SECRET: "ws-test" };
const srv = spawn(process.execPath, ["server/index.js"], { cwd: process.cwd(), env, stdio: ["ignore","pipe","pipe"] });
let pass = 0, fail = 0;
function check(name, cond, extra) { cond ? pass++ : fail++; console.log((cond ? "  ok   " : "  FAIL ") + name + (extra ? "  " + extra : "")); }
const kids = [srv];
srv.stdout.on("data", d => process.stdout.write("[srv] " + d));
srv.stderr.on("data", d => process.stderr.write("[srv] ERR " + d));

function json(port, method, url, headers, body) {
  return new Promise((resolve, reject) => {
    const req = http.request({ port, method, path: url, headers: headers || {} }, (res) => {
      let b = ""; res.on("data", d => b += d); res.on("end", () => {
        try { resolve({ status: res.statusCode, json: b ? JSON.parse(b) : null, text: b }); }
        catch (e) { resolve({ status: res.statusCode, json: null, text: b }); }
      });
    });
    req.on("error", reject);
    if (body != null) req.write(typeof body === "string" ? body : JSON.stringify(body));
    req.end();
  });
}
async function waitReady(ms = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { try { const r = await json(PORT, "GET", "/api/health"); if (r.status < 500) return true; } catch (e) {} await new Promise(r => setTimeout(r, 200)); }
  return false;
}
function openSSE(onData) {
  return new Promise((resolve, reject) => {
    const req = http.request({ port: PORT, method: "GET", path: "/api/activity" }, (res) => {
      let buf = ""; res.setEncoding("utf8");
      res.on("data", (chunk) => {
        buf += chunk;
        let idx;
        while ((idx = buf.indexOf("\n\n")) !== -1) {
          const block = buf.slice(0, idx); buf = buf.slice(idx + 2);
          for (const line of block.split("\n")) {
            if (line.startsWith("data: ")) { try { onData(JSON.parse(line.slice(6)), res); } catch (e) { onData(line.slice(6), res); } }
            else if (line.startsWith(":")) { onData(line, res); }
          }
        }
      });
      resolve(res);
    });
    req.on("error", reject); req.end();
  });
}
function wsSend(ws, obj) { ws.send(JSON.stringify(obj)); }
function nextMsg(ws, ms = 4000) {
  return new Promise((resolve) => {
    const to = setTimeout(() => resolve(null), ms);
    ws.once("message", (d) => { clearTimeout(to); try { resolve(JSON.parse(d.toString())); } catch (e) { resolve(null); } });
  });
}

async function main() {
  if (!(await waitReady())) { console.log("server not ready on :" + PORT); cleanup(1); return; }
  check("backend ready on :" + PORT, true);

  // ---- WebSocket multiplayer room ----
  const a = new WebSocket("ws://127.0.0.1:" + PORT + "/ws");
  const b = new WebSocket("ws://127.0.0.1:" + PORT + "/ws");
  await Promise.all([new Promise(r => a.once("open", r)), new Promise(r => b.once("open", r))]);
  check("two ws clients connected", true);

  wsSend(a, { type: "join", room: "testroom", username: "alice" });
  const aRoom = await nextMsg(a);
  check("alice gets room state + is host", aRoom && aRoom.type === "room" && aRoom.room === "testroom" && aRoom.host === "alice" && aRoom.users.length === 1, JSON.stringify(aRoom));

  wsSend(b, { type: "join", room: "testroom", username: "bob" });
  const bRoom = await nextMsg(b);
  check("bob gets room state with alice as host", bRoom && bRoom.type === "room" && bRoom.host === "alice" && bRoom.users.length === 2, JSON.stringify(bRoom));
  const aJoin = await nextMsg(a);
  check("alice notified of bob joining (users=2)", aJoin && aJoin.type === "join" && aJoin.name === "bob" && aJoin.users.length === 2, JSON.stringify(aJoin));

  wsSend(b, { type: "chat", text: "hello room" });
  const aChat = await nextMsg(a);
  check("chat broadcast to other client", aChat && aChat.type === "chat" && aChat.name === "bob" && aChat.text === "hello room", JSON.stringify(aChat));

  wsSend(b, { type: "ready", ready: true });
  const aReady = await nextMsg(a);
  check("ready state broadcast", aReady && aReady.type === "ready" && aReady.name === "bob" && aReady.ready === true, JSON.stringify(aReady));

  wsSend(b, { type: "cursor", x: 123, y: 64, t: 7 });
  const aCursor = await nextMsg(a);
  check("cursor broadcast to other client", aCursor && aCursor.type === "cursor" && aCursor.name === "bob" && aCursor.x === 123 && aCursor.y === 64, JSON.stringify(aCursor));

  wsSend(a, { type: "start", beatmap_id: 42 });
  const bStart = await nextMsg(b);
  check("host can start (start broadcast)", bStart && bStart.type === "start" && bStart.beatmap_id === 42, JSON.stringify(bStart));

  wsSend(b, { type: "start", beatmap_id: 99 });
  const aNoStart = await nextMsg(a, 1200);
  check("non-host start ignored", !aNoStart || aNoStart.type !== "start" || aNoStart.beatmap_id !== 99, JSON.stringify(aNoStart));

  b.close();
  const aLeave = await nextMsg(a);
  check("leave broadcast on disconnect (users=1)", aLeave && aLeave.type === "leave" && aLeave.name === "bob" && aLeave.users.length === 1, JSON.stringify(aLeave));
  a.close();

  // ---- SSE live-activity feed ----
  const reg = await json(PORT, "POST", "/api/auth/register", { "content-type": "application/json" }, { username: "sseuser", password: "pw123456" });
  check("register for sse test", reg.status === 200, reg.text);
  const token = reg.json && reg.json.token;

  let gotConnected = false, gotScore = null;
  const sseRes = await openSSE((data) => {
    if (typeof data === "string" && data.includes("connected")) gotConnected = true;
    else if (data && data.type === "score") gotScore = data;
  });
  check("SSE stream opens (got : connected comment)", await new Promise(r => setTimeout(() => r(gotConnected), 600)), "gotConnected=" + gotConnected);

  const sc = await json(PORT, "POST", "/api/scores", { "content-type": "application/json", authorization: "Bearer " + token },
    { beatmap_id: 123, beatmap_set_id: 1, title: "Lightspeed", artist: "X", version: "Insane", score: 1000, combo: 10, acc: 99, grade: "S", count300: 10, count100: 0, count50: 0, miss: 0, replay: [] });
  check("score submitted (replay:[] -> approved)", sc.status === 200 && sc.json && sc.json.ok, sc.text);
  await new Promise(r => setTimeout(r, 800));
  check("SSE broadcast score event to listener", !!gotScore && gotScore.type === "score" && gotScore.beatmap_id === 123 && gotScore.username === "sseuser", JSON.stringify(gotScore));
  try { sseRes.destroy(); } catch (e) {}

  cleanup(fail ? 1 : 0);
}
function cleanup(code) {
  for (const k of kids) { try { k.kill("SIGTERM"); } catch (e) {} }
  try { fs2.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  console.log("\n" + pass + " passed, " + fail + " failed");
  process.exit(code);
}
main().catch(e => { console.error("FATAL", e); cleanup(2); });
