// ESM activity feed for the v2 home page. Fetches recent scores from the API
// and subscribes to the SSE stream for live updates. Uses --lazer-* tokens.
// Self-initializes when imported on a page with #main-page .main-content.
import { api } from "./api.js";

function gradeColor(g) {
  return ({ SS: "#f6c060", S: "#f6c060", A: "#66cc66", B: "#5aa6df", C: "#c863c8", D: "#e15555", F: "#e15555" })[g] || "var(--lazer-dim)";
}

function row(s) {
  const e = document.createElement("div");
  e.className = "activity-row";
  const user = document.createElement("span"); user.className = "a-user"; user.textContent = s.username;
  const title = document.createElement("span"); title.className = "a-title";
  title.textContent = (s.title || "beatmap") + " [" + (s.version || "") + "]";
  const score = document.createElement("span"); score.className = "a-score";
  score.textContent = parseInt(s.score || 0, 10).toLocaleString();
  const g = document.createElement("span"); g.className = "a-grade";
  g.textContent = s.grade || "-"; g.style.color = gradeColor(s.grade);
  const mods = document.createElement("span"); mods.className = "a-mods"; mods.textContent = s.mods || "";
  e.appendChild(user); e.appendChild(title); e.appendChild(score); e.appendChild(g);
  if (mods.textContent) e.appendChild(mods);
  return e;
}

const STYLE = `
.activity-feed{max-width:900px;margin:1em auto;}
.activity-title{color:var(--lazer-pink);font-size:1.1em;margin:0.4em 0;}
.activity-row{display:flex;gap:10px;align-items:center;padding:5px 8px;border-bottom:1px solid var(--lazer-panel2);font-size:.9em;}
.activity-row .a-user{color:var(--lazer-purple);min-width:110px;}
.activity-row .a-title{flex:1;color:var(--lazer-text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.activity-row .a-score{color:var(--lazer-text);font-variant-numeric:tabular-nums;}
.activity-row .a-grade{font-weight:bold;min-width:30px;text-align:center;}
.activity-row .a-mods{color:var(--lazer-dim);font-size:.8em;}
.activity-empty{color:var(--lazer-dim);text-align:center;padding:1em;}
`;

let initialized = false;

export function initActivityFeed() {
  if (initialized) return;
  initialized = true;

  // inject styles once
  if (!document.querySelector("style[data-activity-feed]")) {
    const s = document.createElement("style");
    s.setAttribute("data-activity-feed", "");
    s.textContent = STYLE;
    document.head.appendChild(s);
  }

  const host = document.querySelector("#main-page .main-content");
  if (!host) return;

  const wrap = document.createElement("div");
  wrap.className = "activity-feed";
  const t = document.createElement("div");
  t.className = "activity-title";
  t.textContent = "Recent scores";
  wrap.appendChild(t);
  host.appendChild(wrap);

  api.recentActivity()
    .then(function (list) {
      if (!list || !list.length) {
        const e = document.createElement("div");
        e.className = "activity-empty";
        e.textContent = "No scores yet. Be the first!";
        wrap.appendChild(e);
      } else {
        list.forEach(function (s) { wrap.appendChild(row(s)); });
      }
    })
    .catch(function () {
      const e = document.createElement("div");
      e.className = "activity-empty";
      e.textContent = "Could not load activity feed.";
      wrap.appendChild(e);
    });

  // live updates via SSE
  try {
    const es = api.activityStream();
    es.addEventListener("message", function (ev) {
      try {
        const s = JSON.parse(ev.data);
        if (wrap.children.length > 1) {
          wrap.insertBefore(row(s), wrap.children[1]);
          while (wrap.children.length > 22) wrap.removeChild(wrap.lastChild);
        }
      } catch (e) {}
    });
  } catch (e) {}
}
