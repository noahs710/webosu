// ponytail: logger is just console — devtools already filters, but gate noisy logs in prod
// Levels: error > warn > info > debug > trace. In DEV all show; in prod only error+warn.
const IS_DEV = typeof import.meta !== "undefined" && import.meta.env && import.meta.env.DEV;

export const log = (...a) => { if (IS_DEV) console.log(...a); };
export const debug = (...a) => { if (IS_DEV) (console.debug || console.log)(...a); };
export const warn = (...a) => { console.warn(...a); };
export const error = console.error.bind(console);
export function setLevel() {}
export function group(tag, label, fn) { if (!IS_DEV) { try { fn && fn(); } catch {} return; } console.group(`[${tag}] ${label}`); try { fn && fn(); } finally { console.groupEnd(); } }

// Judgement logger — surfaces the exact miss/hit decision chain for debugging
// instant-fail issues. Logs every miss with WHY it fired (wasVisible, finalTime,
// approachTime, hit.time, current time, hit type). Gate via ?jlog=1 in dev.
let _jlogEnabled = false;
try { if (IS_DEV && typeof window !== "undefined" && new URLSearchParams(window.location.search).get("jlog") === "1") _jlogEnabled = true; } catch {}

export const jlog = {
   miss(judge, hit, time, reason) {
      if (!_jlogEnabled) return;
      console.warn(
         `[JUDGE MISS] reason=${reason} type=${hit?.type} hit.time=${hit?.time} time=${time?.toFixed(1)} ` +
         `finalTime=${judge?.finalTime?.toFixed(1)} wasVisible=${judge?._wasVisible} ` +
         `score=${hit?.score} points=${judge?.points} combo=${hit?.combo}`
      );
   },
   hit(hit, points, time) {
      if (!_jlogEnabled) return;
      console.log(
         `[JUDGE HIT] type=${hit?.type} points=${points} time=${time?.toFixed(1)} ` +
         `hit.time=${hit?.time} wasVisible=${hit?._wasVisible} combo=${hit?.combo}`
      );
   },
   fail(hp, reason) {
      if (!_jlogEnabled) return;
      console.error(
         `[FAIL] hp=${hp?.toFixed(3)} reason=${reason}`
      );
   },
   hp(hp, delta, reason, time) {
      if (!_jlogEnabled) return;
      console.debug(
         `[HP] hp=${hp?.toFixed(3)} delta=${delta?.toFixed(4)} reason=${reason} time=${time?.toFixed(1)}`
      );
   },
   tick(hit, time, activated) {
      if (!_jlogEnabled) return;
      console.log(
         `[TICK] type=${hit?.type} time=${time?.toFixed(1)} activated=${activated} ` +
         `wasVisible=${hit?._wasVisible} nexttick=${hit?.nexttick}`
      );
   },
   approach(hit, time) {
      if (!_jlogEnabled) return;
      const diff = hit.time - time;
      if (Math.abs(diff - hit.time) < 50 || Math.abs(diff) < 50) {
         console.log(
            `[APPROACH] type=${hit.type} hit.time=${hit.time} time=${time?.toFixed(1)} ` +
            `diff=${diff?.toFixed(1)} approachTime=${hit.approachTime || "n/a"} ` +
            `_wasVisible=${hit._wasVisible}`
         );
      }
   },
};
