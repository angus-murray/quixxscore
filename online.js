// Accounts, challenges, live games and history, stored in Firebase (Auth + Firestore).
import { firebaseConfig } from "./firebase-config.js";
import { COLOURS, emptySheet, normaliseSheet, cloneSheet, canMark, canUnmark, lockedBy, gameOverReason, totalScore, MAX_PENALTIES } from "./rules.js";

var SDK = "https://www.gstatic.com/firebasejs/12.19.0/";
var USERNAME_RE = /^[a-z0-9_]{3,20}$/;

// Add ?emulator to the URL to run against the local Firebase emulators.
var emulator = new URLSearchParams(location.search).has("emulator");
var config = emulator && !firebaseConfig.apiKey
  ? { apiKey: "demo-key", authDomain: "demo-qwixx.firebaseapp.com", projectId: "demo-qwixx", appId: "demo" }
  : firebaseConfig;
export var enabled = !!config.apiKey;

var ui, A, F, auth, db;
var user = null;
var profile = null;
var profileLoaded = false;
var authKnown = false;
var savingProfile = false;
var games = new Map();
var gamesLoaded = false;
var unsubProfile = null;
var unsubGames = null;
var listeners = new Set();

function $(id) { return document.getElementById(id); }

function el(tag, className, text) {
  var e = document.createElement(tag);
  if (className) e.className = className;
  if (text != null) e.textContent = text;
  return e;
}

function button(label, onClick, className) {
  var b = el("button", "btn small" + (className ? " " + className : ""), label);
  b.type = "button";
  b.addEventListener("click", function (e) {
    e.preventDefault();
    e.stopPropagation();
    onClick();
  });
  return b;
}

function onChange(fn) {
  listeners.add(fn);
  return function () { listeners.delete(fn); };
}

function notify() {
  listeners.forEach(function (fn) { fn(); });
}

var PANELS = ["online-off", "online-loading", "auth-panel", "profile-form", "lobby"];
function showPanel(id) {
  PANELS.forEach(function (p) { $(p).hidden = p !== id; });
}

function friendlyError(e) {
  var messages = {
    "auth/unauthorized-domain": "This web address is not allowed to sign in. Add it under Authentication > Settings > Authorized domains in Firebase.",
    "auth/operation-not-allowed": "Google sign-in is not turned on in Firebase (Authentication > Sign-in method).",
    "auth/account-exists-with-different-credential": "This email is already linked to another sign-in method.",
    "auth/too-many-requests": "Too many attempts. Try again in a few minutes.",
    "auth/network-request-failed": "No connection. Check your internet and try again.",
    "unavailable": "No connection. Check your internet and try again."
  };
  return messages[e && e.code] || (e && e.message) || "Something went wrong.";
}

// ---- Start-up and auth ----

export function init(u) {
  ui = u;
  bindForms();
  if (!enabled) {
    showPanel("online-off");
    return;
  }
  Promise.all([
    import(SDK + "firebase-app.js"),
    import(SDK + "firebase-auth.js"),
    import(SDK + "firebase-firestore.js")
  ]).then(function (m) {
    var app = m[0].initializeApp(config);
    A = m[1];
    F = m[2];
    auth = A.getAuth(app);
    if (emulator) {
      db = F.getFirestore(app);
      A.connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
      F.connectFirestoreEmulator(db, "127.0.0.1", 8080);
    } else {
      // Cache on the device so games open instantly and survive brief signal drop-outs.
      db = F.initializeFirestore(app, { localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }) });
    }
    A.onAuthStateChanged(auth, onUser);
  }).catch(function (e) {
    $("online-loading").textContent = "Could not load online play: " + friendlyError(e);
  });
}

function onUser(u) {
  if (unsubProfile) unsubProfile();
  if (unsubGames) unsubGames();
  unsubProfile = unsubGames = null;
  authKnown = true;
  savingProfile = false;
  user = u;
  profile = null;
  profileLoaded = false;
  games = new Map();
  gamesLoaded = false;

  if (!u) {
    $("profile-form").reset();
    showPanel("auth-panel");
    notify();
    return;
  }

  showPanel("online-loading");
  unsubProfile = F.onSnapshot(F.doc(db, "users", u.uid), function (snap) {
    profile = snap.exists() ? snap.data() : null;
    profileLoaded = true;
    if (profile) {
      renderLobby();
      showPanel("lobby");
    } else if (!savingProfile) {
      var pf = $("profile-form");
      if (!pf.name.value && u.displayName) pf.name.value = u.displayName.slice(0, 30);
      showPanel("profile-form");
    }
    notify();
  }, function (e) {
    $("online-loading").textContent = friendlyError(e);
  });

  var q = F.query(F.collection(db, "games"), F.where("players", "array-contains", u.uid));
  unsubGames = F.onSnapshot(q, function (qs) {
    games = new Map();
    qs.forEach(function (d) {
      var data = d.data({ serverTimestamps: "estimate" });
      data.id = d.id;
      games.set(d.id, data);
    });
    gamesLoaded = true;
    renderLobby();
    notify();
  }, function (e) {
    $("challenge-error").textContent = friendlyError(e);
  });
}

function checkProfileInput(name, username) {
  if (!name) return "Enter your name.";
  if (!USERNAME_RE.test(username)) return "Usernames are 3 to 20 letters, numbers or underscores.";
  return null;
}

function saveProfile(name, username) {
  var batch = F.writeBatch(db);
  batch.set(F.doc(db, "usernames", username), { uid: user.uid });
  batch.set(F.doc(db, "users", user.uid), { name: name, username: username, createdAt: F.serverTimestamp() });
  savingProfile = true;
  return batch.commit().then(function () {
    savingProfile = false;
  }, function (e) {
    savingProfile = false;
    // Writing to an existing username document is refused by the security rules.
    if (e.code === "permission-denied") throw new Error("That username is taken. Choose another.");
    throw e;
  });
}

function bindForms() {
  $("google-sign-in").addEventListener("click", function () {
    var error = $("auth-panel").querySelector(".error");
    error.textContent = "";
    var provider = new A.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    A.signInWithPopup(auth, provider).catch(function (err) {
      if (err.code === "auth/popup-closed-by-user" || err.code === "auth/cancelled-popup-request") return;
      // Some browsers block pop-ups; sign in by leaving the page and coming back instead.
      if (err.code === "auth/popup-blocked" || err.code === "auth/operation-not-supported-in-this-environment") {
        A.signInWithRedirect(auth, provider);
        return;
      }
      error.textContent = friendlyError(err);
    });
  });

  var pf = $("profile-form");
  pf.addEventListener("submit", function (e) {
    e.preventDefault();
    var error = pf.querySelector(".error");
    var name = pf.name.value.trim();
    var username = pf.username.value.trim().toLowerCase();
    var problem = checkProfileInput(name, username);
    error.textContent = problem || "";
    if (problem) return;
    saveProfile(name, username).catch(function (err) {
      error.textContent = friendlyError(err);
      showPanel("profile-form");
    });
  });

  $("sign-out").addEventListener("click", function () {
    A.signOut(auth);
    location.hash = "#/";
  });

  $("challenge-form").addEventListener("submit", function (e) {
    e.preventDefault();
    challenge(e.target.username.value);
  });
}

// ---- Games ----

function opponentOf(g) {
  return g.players[0] === user.uid ? g.players[1] : g.players[0];
}

function opponentName(g) {
  return (g.names && g.names[opponentOf(g)]) || "Opponent";
}

function sheetOf(g, uid) {
  return normaliseSheet(g.sheets && g.sheets[uid]);
}

function millis(t) {
  return t && t.toMillis ? t.toMillis() : 0;
}

function byRecent(field) {
  return function (a, b) { return millis(b[field] || b.updatedAt) - millis(a[field] || a.updatedAt); };
}

function gameRef(id) {
  return F.doc(db, "games", id);
}

function updateGame(id, data) {
  data.updatedAt = F.serverTimestamp();
  return F.updateDoc(gameRef(id), data).catch(function (e) {
    alert("Could not save: " + friendlyError(e));
  });
}

function createGame(oppUid, oppName) {
  var names = {};
  names[user.uid] = profile.name;
  names[oppUid] = oppName;
  var sheets = {};
  sheets[user.uid] = emptySheet();
  sheets[oppUid] = emptySheet();
  var ref = F.doc(F.collection(db, "games"));
  F.setDoc(ref, {
    players: [user.uid, oppUid],
    names: names,
    createdBy: user.uid,
    status: "pending",
    createdAt: F.serverTimestamp(),
    updatedAt: F.serverTimestamp(),
    sheets: sheets
  }).catch(function (e) {
    alert("Could not create the game: " + friendlyError(e));
    location.hash = "#/";
  });
  // The local cache shows the new game straight away, before the server confirms it.
  location.hash = "#/game/" + ref.id;
}

function challenge(input) {
  var error = $("challenge-error");
  var username = (input || "").trim().toLowerCase().replace(/^@/, "");
  error.textContent = "";
  if (!username) {
    error.textContent = "Enter your opponent's username.";
    return;
  }
  if (username === profile.username) {
    error.textContent = "You can't challenge yourself.";
    return;
  }
  F.getDoc(F.doc(db, "usernames", username)).then(function (snap) {
    if (!snap.exists()) throw new Error("No player has the username " + username + ".");
    var oppUid = snap.data().uid;
    return F.getDoc(F.doc(db, "users", oppUid)).then(function (u) {
      $("challenge-form").username.value = "";
      createGame(oppUid, u.exists() ? u.data().name : username);
    });
  }).catch(function (e) {
    error.textContent = friendlyError(e);
  });
}

function accept(g) { updateGame(g.id, { status: "active" }); }
function decline(g) { updateGame(g.id, { status: "declined" }); }
function cancel(g) { updateGame(g.id, { status: "cancelled" }); }

function renderLobby() {
  if (!user || !profile) return;
  $("me-name").textContent = profile.name;
  $("me-username").textContent = "@" + profile.username;

  var all = Array.from(games.values()).sort(byRecent("updatedAt"));
  var incoming = $("incoming");
  var current = $("current");
  incoming.textContent = "";
  current.textContent = "";

  all.forEach(function (g) {
    var name = opponentName(g);
    var li = el("li");
    var link = el("a", "game-link");
    link.href = "#/game/" + encodeURIComponent(g.id);
    var actions = el("span", "actions");

    if (g.status === "pending" && g.players[1] === user.uid) {
      link.textContent = name + " challenged you";
      actions.appendChild(button("Accept", function () { accept(g); location.hash = "#/game/" + g.id; }));
      actions.appendChild(button("Decline", function () { decline(g); }, "secondary"));
      li.append(link, actions);
      incoming.appendChild(li);
    } else if (g.status === "pending") {
      link.textContent = "Waiting for " + name + " to accept";
      actions.appendChild(button("Cancel", function () { cancel(g); }, "secondary"));
      li.append(link, actions);
      current.appendChild(li);
    } else if (g.status === "active") {
      var mine = totalScore(sheetOf(g, user.uid));
      var theirs = totalScore(sheetOf(g, opponentOf(g)));
      link.textContent = "vs " + name;
      link.appendChild(el("span", "score-pair", mine + " – " + theirs));
      li.appendChild(link);
      current.appendChild(li);
    }
  });

  if (!incoming.children.length) incoming.appendChild(el("li", "empty", "None"));
  if (!current.children.length) current.appendChild(el("li", "empty", "None. Challenge someone by their username."));
}

function resultText(g) {
  var mine = totalScore(sheetOf(g, user.uid));
  var theirs = totalScore(sheetOf(g, opponentOf(g)));
  if (mine > theirs) return { result: "won", text: "You won " + mine + " to " + theirs + "." };
  if (mine < theirs) return { result: "lost", text: opponentName(g) + " won " + theirs + " to " + mine + "." };
  return { result: "drew", text: "Draw at " + mine + " each." };
}

function emptyModel(text, actions) {
  return {
    sheet: emptySheet(),
    hideUndo: true,
    banner: { text: text, actions: actions || [] },
    opponent: null
  };
}

export function openGame(id) {
  ui.showView("game");
  if (!enabled) {
    ui.renderGame(emptyModel("Online play is not set up on this copy of the app.", [{ label: "Home", run: function () { location.hash = "#/"; } }]));
    return null;
  }

  var undoStack = [];

  function current() {
    var g = games.get(id);
    if (!g) return null;
    var oppUid = opponentOf(g);
    var me = sheetOf(g, user.uid);
    var opp = sheetOf(g, oppUid);
    var reason = gameOverReason([me, opp]);
    var closed = {};
    COLOURS.forEach(function (c) { closed[c.key] = lockedBy(opp, c.key); });
    return {
      g: g, me: me, opp: opp, reason: reason, closed: closed,
      playing: g.status === "active" && !(reason && me.done)
    };
  }

  function save(next) {
    var s = current();
    var reason = gameOverReason([next, s.opp]);
    if (!reason) next.done = false;
    var data = {};
    data["sheets." + user.uid] = next;
    if (reason && next.done && s.opp.done) {
      data.status = "finished";
      data.finishedAt = F.serverTimestamp();
    }
    updateGame(id, data);
  }

  function change(mutate) {
    var s = current();
    if (!s || !s.playing) return;
    var next = cloneSheet(s.me);
    if (mutate(s, next) === false) return;
    undoStack.push(s.me);
    save(next);
  }

  ui.setHandlers({
    onCell: function (key, i) {
      change(function (s, next) {
        if (s.me.marks[key][i]) {
          if (!canUnmark(s.me, key, i)) return false;
          next.marks[key][i] = false;
        } else {
          // After the game ends, crosses from the final roll can still be added until you confirm.
          if (!canMark(s.me, key, i, s.closed[key], false)) return false;
          next.marks[key][i] = true;
        }
      });
    },
    onPenalty: function (i) {
      change(function (s, next) {
        if (i < s.me.penalties) {
          if (i !== s.me.penalties - 1) return false;
          next.penalties = i;
        } else {
          if (s.me.penalties >= MAX_PENALTIES) return false;
          next.penalties += 1;
        }
      });
    },
    onUndo: function () {
      var s = current();
      if (!s || !s.playing || !undoStack.length) return;
      save(cloneSheet(undoStack.pop()));
    },
    onAction: function () {
      var s = current();
      if (!s) return;
      if (s.g.status === "active") {
        if (confirm("Abandon this game? It will not count in your history.")) {
          updateGame(id, { status: "abandoned", abandonedBy: user.uid });
        }
      } else if (s.g.status === "pending" && s.g.players[0] === user.uid) {
        cancel(s.g);
      }
    }
  });

  function bannerFor(s) {
    var g = s.g;
    var name = opponentName(g);
    var home = { label: "Home", run: function () { location.hash = "#/"; }, secondary: true };
    var rematch = { label: "Rematch", run: function () { createGame(opponentOf(g), name); } };
    switch (g.status) {
      case "pending":
        if (g.players[1] === user.uid) {
          return { text: name + " challenged you to a game.", actions: [
            { label: "Accept", run: function () { accept(g); } },
            { label: "Decline", run: function () { decline(g); location.hash = "#/"; }, secondary: true }
          ] };
        }
        return { text: "Waiting for " + name + " to accept your challenge." };
      case "declined":
        return { text: name + " declined this challenge.", actions: [home] };
      case "cancelled":
        return { text: "This challenge was cancelled.", actions: [home] };
      case "abandoned":
        return { text: (g.abandonedBy === user.uid ? "You" : name) + " abandoned this game.", actions: [rematch, home] };
      case "finished":
        var r = resultText(g);
        return { text: "Game over. " + r.text, tone: r.result, actions: [rematch, home] };
    }
    if (s.reason && !s.me.done) {
      return { text: "Game over (" + s.reason + "). Add any crosses from the final roll, then confirm your sheet.", tone: "alert", actions: [
        { label: "Confirm final sheet", run: function () {
          var now = current();
          if (!now || !now.reason) return;
          var next = cloneSheet(now.me);
          next.done = true;
          undoStack = [];
          save(next);
        } }
      ] };
    }
    if (s.reason) return { text: "Game over (" + s.reason + "). Waiting for " + name + " to confirm their sheet." };
    return null;
  }

  function render() {
    if (!user) {
      ui.renderGame(emptyModel(authKnown ? "Sign in to see this game." : "Loading…",
        [{ label: "Sign in", run: function () { location.hash = "#/"; } }]));
      return;
    }
    var s = current();
    if (!s) {
      ui.renderGame(emptyModel(gamesLoaded ? "Game not found." : "Loading game…",
        gamesLoaded ? [{ label: "Home", run: function () { location.hash = "#/"; } }] : []));
      return;
    }
    var mineClosed = {};
    COLOURS.forEach(function (c) { mineClosed[c.key] = lockedBy(s.me, c.key); });
    ui.renderGame({
      sheet: s.me,
      closed: s.closed,
      canMark: function (key, i) { return s.playing && canMark(s.me, key, i, s.closed[key], false); },
      canUnmark: function (key, i) { return s.playing && canUnmark(s.me, key, i); },
      lockActive: false,
      undoEnabled: s.playing && undoStack.length > 0,
      hideUndo: s.g.status !== "active",
      actionLabel: s.g.status === "active" ? "Abandon" : (s.g.status === "pending" && s.g.players[0] === user.uid ? "Cancel" : null),
      banner: bannerFor(s),
      opponent: { name: opponentName(s.g), sheet: s.opp, closed: mineClosed }
    });
  }

  render();
  return onChange(render);
}

// ---- History ----

export function openHistory() {
  renderHistory();
  return onChange(renderHistory);
}

function renderHistory() {
  var empty = $("history-empty");
  ["stats", "h2h-panel", "games-panel"].forEach(function (p) { $(p).hidden = true; });
  if (!enabled || !user) {
    empty.textContent = enabled ? "Sign in to see your game history." : "Online play is not set up on this copy of the app.";
    empty.hidden = false;
    return;
  }
  var finished = Array.from(games.values()).filter(function (g) { return g.status === "finished"; }).sort(byRecent("finishedAt"));
  empty.textContent = gamesLoaded ? "No finished games yet." : "Loading…";
  empty.hidden = finished.length > 0;
  if (!finished.length) return;

  var totals = { played: 0, won: 0, lost: 0, drew: 0, sum: 0, best: null };
  var rivals = new Map();
  finished.forEach(function (g) {
    var mine = totalScore(sheetOf(g, user.uid));
    var r = resultText(g).result;
    totals.played++;
    totals[r]++;
    totals.sum += mine;
    totals.best = totals.best == null ? mine : Math.max(totals.best, mine);
    var opp = opponentOf(g);
    var rv = rivals.get(opp) || { name: opponentName(g), played: 0, won: 0, lost: 0, drew: 0 };
    rv.played++;
    rv[r]++;
    rivals.set(opp, rv);
  });

  var grid = $("stat-grid");
  grid.textContent = "";
  [["Played", totals.played], ["Won", totals.won], ["Lost", totals.lost], ["Drawn", totals.drew],
    ["Average score", Math.round(totals.sum / totals.played)], ["Best score", totals.best]].forEach(function (s) {
    var cell = el("div", "stat");
    cell.appendChild(el("span", "stat-value", s[1]));
    cell.appendChild(el("span", "stat-label", s[0]));
    grid.appendChild(cell);
  });
  $("stats").hidden = false;

  var table = $("h2h");
  table.textContent = "";
  var head = el("tr");
  ["Opponent", "Played", "Won", "Lost", "Drawn"].forEach(function (h) { head.appendChild(el("th", null, h)); });
  table.appendChild(head);
  Array.from(rivals.values()).sort(function (a, b) { return b.played - a.played; }).forEach(function (rv) {
    var tr = el("tr");
    [rv.name, rv.played, rv.won, rv.lost, rv.drew].forEach(function (v) { tr.appendChild(el("td", null, v)); });
    table.appendChild(tr);
  });
  $("h2h-panel").hidden = false;

  var list = $("history-list");
  list.textContent = "";
  finished.forEach(function (g) {
    var r = resultText(g);
    var li = el("li");
    var link = el("a", "game-link");
    link.href = "#/game/" + encodeURIComponent(g.id);
    var when = millis(g.finishedAt || g.updatedAt);
    link.appendChild(el("span", "game-date", when ? new Date(when).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : ""));
    link.appendChild(document.createTextNode("vs " + opponentName(g)));
    link.appendChild(el("span", "score-pair", totalScore(sheetOf(g, user.uid)) + " – " + totalScore(sheetOf(g, opponentOf(g)))));
    link.appendChild(el("span", "result " + r.result, r.result === "won" ? "Won" : r.result === "lost" ? "Lost" : "Draw"));
    li.appendChild(link);
    list.appendChild(li);
  });
  $("games-panel").hidden = false;
}
