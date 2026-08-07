/*
 * Replay playback launcher for leaderboard "Watch" links.
 * Triggered by index.html?watch=<replayId>&bid=<beatmapId>&sid=<setId>&v=<version>
 * Fetches the stored replay frames, downloads the beatmap set from catboy.best
 * (the permanent source), and launches the game in replay mode.
 */
(function () {
  function whenReady(cb) {
    if (
      window.Osu &&
      window.scriptReady &&
      window.skinReady &&
      window.soundReady &&
      typeof launchReplay === "function"
    ) {
      cb();
      return;
    }
    setTimeout(function () { whenReady(cb); }, 200);
  }
  function init() {
    var q = new URLSearchParams(location.search);
    var watch = q.get("watch");
    if (!watch) return;
    var bid = parseInt(q.get("bid") || "0", 10);
    var sid = q.get("sid");
    var version = q.get("v") || "";
    whenReady(function () {
      fetch("/api/replays/" + watch)
        .then(function (r) { return r.json(); })
        .then(function (frames) {
          if (!Array.isArray(frames) || !frames.length) {
            alert("Replay unavailable for this score.");
            return;
          }
          return fetch("https://catboy.best/d/" + sid + "n")
            .then(function (r) { return r.arrayBuffer(); })
            .then(function (ab) {
              var blob = new Blob([ab]);
              launchReplay(blob, bid, version, frames);
            });
        })
        .catch(function (e) { alert("Could not start replay: " + (e.message || e)); });
    });
  }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", init);
  else init();
})();
