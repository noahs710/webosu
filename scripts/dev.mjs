/* scripts/dev.mjs — run webosu's full dev stack in one command.
 *
 * Local development should mirror production (Fly.io) so API/auth/scores work
 * without a deploy round-trip. This script starts:
 *   1) the Fastify backend (server/index.js) on :8080 — same DB, same routes
 *      as production; the SPA /api/* and /ws go through it
 *   2) the Vite dev server on :5173 with /api and /ws proxied to the backend
 *      (see vite.config.mjs)
 *
 * Both are spawned as child processes; Ctrl-C tears them down together.
 * Logs are prefixed and colourised so it is obvious which process a line came from.
 */
import { spawn } from "node:child_process";
import process from "node:process";

const nodePath = process.execPath; // absolute path to current node binary — always spawnable
const isWin = process.platform === "win32";
// npm is a .cmd shim on Windows; CreateProcess without shell mediation rejects it
// (EINVAL). Use shell:true so the wrapper resolves. Pass the command as a single
// quoted string to keep argv correct. shell:false would be cleaner on POSIX but
// the same cross-platform branch avoids an environment matrix.
const shellOnWin = isWin;

const ESC = String.fromCharCode(27);
const L = String.fromCharCode(10);
const COLOR = {
  reset: ESC + "[0m",
  dim: ESC + "[2m",
  cyan: ESC + "[36m",
  magenta: ESC + "[35m",
};

function prefix(stream, label, color) {
  let buf = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk) => {
    buf += chunk;
    let nl;
    while ((nl = buf.indexOf(L)) !== -1) {
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      if (line.length === 0) process.stdout.write(L);
      else process.stdout.write(color + "[" + label + "]" + COLOR.reset + " " + line + L);
    }
  });
  stream.on("end", () => {
    if (buf.length) process.stdout.write(color + "[" + label + "]" + COLOR.reset + " " + buf + L);
  });
}

const procs = [];
function start(label, color, cmd, args) {
  // .cmd shims (npm) cannot be spawned without shell mediation on Windows
  // (CreateProcess rejects them with EINVAL). Detect the shim and switch on
  // shell:true only for those. The backend uses process.execPath (absolute)
  // so it does not need the shell.
  // npm is npm.cmd on Windows; bare "npm" needs shell:true to resolve. Other commands (node) use process.execPath and do not.
  // npm.cmd requires shell:true on Windows. The backend uses process.execPath (absolute)
  // without the shell. When shell is on, paths with spaces need quoting or cmd.exe
  // chokes on "C:\Program".
  // npm.cmd requires shell:true on Windows; without it, CreateProcess rejects
  // bare "npm" (EINVAL). The backend uses process.execPath (absolute) so it
  // does not need the shell.
  // Spawn directly with nodePath (absolute) and shell:false. This avoids the
  // Node 22+ DEP0190 warning about passing args with shell:true, and sidesteps
  // the npm.cmd shim entirely by invoking vite JS entry directly.
  const p = spawn(cmd, args, {
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
  });
  prefix(p.stdout, label, color);
  prefix(p.stderr, label + "!", COLOR.magenta);
  p.on("exit", (code, signal) => {
    process.stdout.write(COLOR.dim + "[" + label + "] exited" + (signal ? " via " + signal : " code=" + code) + COLOR.reset + L);
    for (const other of procs) if (other !== p && other.exitCode == null && other.signalCode == null) {
      try { other.kill(); } catch {}
    }
    process.exit(code ?? 1);
  });
  procs.push(p);
  return p;
}

function shutdown() {
  for (const p of procs) {
    try { p.kill(); } catch {}
  }
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
process.on("exit", shutdown);

// Backend first — Vite proxies /api and /ws to it, so it must be listening before
// the SPA first request lands. nodePath is absolute so Windows CreateProcess
// resolves it without shell mediation (no EINVAL).
start("api", COLOR.cyan, nodePath, ["server/index.js"]);
setTimeout(() => {
  // npm is npm.cmd on Windows; start() detects the .cmd shim and switches to
  // shell:true so the wrapper resolves. After it spawns, the cd is the project root.
  // Invoke vite directly via its JS entry (no npm.cmd shim, no shell).
  start("web", COLOR.magenta, nodePath, ["node_modules/vite/bin/vite.js"]);
  process.stdout.write(
    COLOR.dim + "[dev] SPA on http://localhost:5173 (proxies /api + /ws to :8080)" + COLOR.reset + L
  );
}, 250);

