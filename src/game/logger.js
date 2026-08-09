// Lightweight game logger — grouped, level-controlled, no deps.
// Usage: import { log, warn, error, group } from "./logger.js";
// Levels: debug (verbose), info, warn, error. Default: info. Set via localStorage gameLogLevel or URL ?log=debug
const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
let current = LEVELS.info;
try {
  const urlLevel = new URLSearchParams(location.search).get("log");
  const stored = localStorage.getItem("gameLogLevel");
  const lvl = (urlLevel || stored || "info").toLowerCase();
  if (LEVELS[lvl] !== undefined) current = LEVELS[lvl];
} catch {}
export function setLevel(lvl) { if (LEVELS[lvl] !== undefined) { current = LEVELS[lvl]; try { localStorage.setItem("gameLogLevel", lvl); } catch {} } }
export function debug(tag, ...args) { if (current <= LEVELS.debug) console.log(`[${tag}]`, ...args); }
export function log(tag, ...args) { if (current <= LEVELS.info) console.log(`[${tag}]`, ...args); }
export function warn(tag, ...args) { if (current <= LEVELS.warn) console.warn(`[${tag}]`, ...args); }
export function error(tag, ...args) { if (current <= LEVELS.error) console.error(`[${tag}]`, ...args); }
export function group(tag, label, fn) {
  if (current > LEVELS.info) return fn && fn();
  console.group(`[${tag}] ${label}`);
  try { fn && fn(); } finally { console.groupEnd(); }
}
