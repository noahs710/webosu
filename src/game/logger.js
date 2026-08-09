// ponytail: logger is just console — devtools already filters, but gate noisy logs in prod
export const log = (...a) => { if (import.meta.env.DEV) console.log(...a); };
export const debug = (...a) => { if (import.meta.env.DEV) (console.debug || console.log)(...a); };
export const warn = (...a) => { if (import.meta.env.DEV) console.warn(...a); };
export const error = console.error.bind(console);
export function setLevel() {}
export function group(tag, label, fn) { if (!import.meta.env.DEV) { try { fn && fn(); } catch {} return; } console.group(`[${tag}] ${label}`); try { fn && fn(); } finally { console.groupEnd(); } }
