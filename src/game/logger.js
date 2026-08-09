// ponytail: logger is just console — devtools already filters
export const log = console.log.bind(console);
export const debug = console.debug ? console.debug.bind(console) : console.log.bind(console);
export const warn = console.warn.bind(console);
export const error = console.error.bind(console);
export function setLevel() {}
export function group(tag, label, fn) { console.group(`[${tag}] ${label}`); try { fn && fn(); } finally { console.groupEnd(); } }
