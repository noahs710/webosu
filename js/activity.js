/*
 * Recent/live activity feed for the index page (webosu leaderboard).
 * Self-attaches if a #main-content host exists.
 */
(function () {
  function gradeColor(g) {
    return ({ SS: "#f6c060", S: "#f6c060", A: "#66cc66", B: "#5aa6df", C: "#c863c8", D: "#e15555", F: "#e15555" })[g] || "#bbb";
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
  function style() {
    const s = document.createElement("style");
    s.textContent =
      ".activity-feed{max-width:900px;margin:1em auto;}" +
      ".activity-title{color:#9d7dcc;font-size:1.1em;margin:0.4em 0;}" +
      ".activity-row{display:flex;gap:10px;align-items:center;padding:5px 8px;border-bottom:1px solid #2a2a2a;font-size:.9em;}" +
      ".activity-row .a-user{color:#9d7dcc;min-width:110px;}" +
      ".activity-row .a-title{flex:1;color:#ccc;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}" +
      ".activity-row .a-score{color:#ddd;font-variant-numeric:tabular-nums;}" +
      ".activity-row .a-grade{font-weight:bold;min-width:30px;text-align:center;}" +
      ".activity-row .a-mods{color:#888;font-size:.8em;}" +
      ".activity-empty{color:#888;text-align:center;padding:1em;}";
    document.head.appendChild(s);
  }
  function attach(host, list) {
    const wrap = document.createElement("div");
    wrap.className = "activity-feed";
    const t = document.createElement("div"); t.className = "activity-title"; t.textContent = "Recent scores";
    wrap.appendChild(t);
    if (!list.length) { const e = document.createElement("div"); e.className = "activity-empty"; e.textContent = "No scores yet. Be the first!"; wrap.appendChild(e); }
    else list.forEach(function (s) { wrap.appendChild(row(s)); });
    host.appendChild(wrap);
  }
  function init() {
    if (!window.WebosuAPI) return;
    const host = document.querySelector("#main-page .main-content");
    if (!host) return;
    style();
    WebosuAPI.recentActivity().then(function (list) { attach(host, list || []); }).catch(function () { attach(host, []); });
    // live updates via SSE
    try {
      const es = WebosuAPI.activityStream();
      es.addEventListener("message", function (ev) {
        try { const s = JSON.parse(ev.data); const feed = document.querySelector(".activity-feed"); if (feed && feed.children.length > 1) { feed.insertBefore(row(s), feed.children[1]); while (feed.children.length > 22) feed.removeChild(feed.lastChild); } } catch (e) {}
      });
    } catch (e) {}
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
