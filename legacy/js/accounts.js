/*
 * webosu account widget (webosu-specific; catboy.best usage unchanged).
 * Injects a Login/Account control into the nav and a small auth modal.
 */
(function () {
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function style(css) {
    const s = document.createElement("style");
    s.textContent = css;
    document.head.appendChild(s);
  }

  function setPlayerName(name) {
    const reg = document.getElementById("userreg");
    if (reg && name) reg.value = name;
    if (name) {
      try { localStorage.setItem("username", name); document.cookie = "username=" + name; } catch (e) {}
    }
  }

  function refreshWidget() {
    const host = document.getElementById("webosu-account");
    if (!host) return;
    host.innerHTML = "";
    const user = (window.WebosuAPI && WebosuAPI.getUser()) || null;
    if (user) {
      setPlayerName(user.username);
      const name = el("span", "wa-name", user.username);
      const out = el("button", "pseudo button wa-btn", "Log out");
      out.onclick = function () { WebosuAPI.logout(); refreshWidget(); };
      host.appendChild(name);
      host.appendChild(out);
    } else {
      const btn = el("button", "pseudo button wa-btn", "Log in");
      btn.onclick = openModal;
      host.appendChild(btn);
    }
  }

  let modal = null;
  function openModal() {
    if (modal) { modal.remove(); modal = null; return; }
    modal = el("div", "wa-modal");
    const card = el("div", "wa-card");
    const close = el("div", "wa-close", "x");
    close.onclick = function () { modal.remove(); modal = null; };
    card.appendChild(close);
    const title = el("h3", null, "webosu account");
    card.appendChild(title);
    const err = el("div", "wa-err", "");
    card.appendChild(err);
    const user = el("input", "wa-input");
    user.placeholder = "username";
    user.maxLength = 20;
    const pw = el("input", "wa-input");
    pw.type = "password";
    pw.placeholder = "password";
    card.appendChild(user);
    card.appendChild(pw);
    const btnRow = el("div", "wa-btnrow");
    const loginBtn = el("button", "pseudo button", "Log in");
    const regBtn = el("button", "pseudo button", "Register");
    btnRow.appendChild(loginBtn);
    btnRow.appendChild(regBtn);
    card.appendChild(btnRow);
    async function doAuth(which) {
      err.textContent = "";
      if (!user.value || !pw.value) { err.textContent = "enter username and password"; return; }
      try {
        const u = which === "reg"
          ? await WebosuAPI.register(user.value, pw.value)
          : await WebosuAPI.login(user.value, pw.value);
        setPlayerName(u.username);
        modal.remove(); modal = null;
        refreshWidget();
      } catch (e) { err.textContent = e.message; }
    }
    loginBtn.onclick = function () { doAuth("login"); };
    regBtn.onclick = function () { doAuth("reg"); };
    pw.addEventListener("keypress", function (e) { if (e.key === "Enter") doAuth("login"); });
    modal.appendChild(card);
    document.body.appendChild(modal);
    setTimeout(function () { user.focus(); }, 0);
  }

  function init() {
    if (!window.WebosuAPI) return;
    style(
      ".wa-btn{margin-left:6px!important;padding:2px 10px!important;}" +
      ".wa-name{color:#9d7dcc;font-size:.9em;margin-right:4px;}" +
      ".wa-modal{position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:1000;}" +
      ".wa-card{background:#292929;border:1px solid #444;border-radius:8px;padding:20px;width:300px;position:relative;color:#eee;}" +
      ".wa-card h3{margin:0 0 14px;color:#9d7dcc;}" +
      ".wa-close{position:absolute;top:8px;right:12px;cursor:pointer;color:#aaa;}" +
      ".wa-input{display:block;width:100%;box-sizing:border-box;margin:8px 0;padding:8px;background:#1f1f1f;border:1px solid #444;border-radius:4px;color:#eee;}" +
      ".wa-btnrow{display:flex;gap:8px;margin-top:8px;}" +
      ".wa-btnrow button{flex:1;}" +
      ".wa-err{color:#e15555;font-size:.85em;min-height:1em;margin-bottom:6px;}"
    );
    // inject host into nav-tool
    let host = document.getElementById("webosu-account");
    if (!host) {
      host = el("div", "nav-tool");
      host.id = "webosu-account";
      const nav = document.getElementById("main-nav");
      if (nav) nav.appendChild(host);
    }
    refreshWidget();
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", init);
  else init();
  window.WebosuAccount = { refresh: refreshWidget };
})();
