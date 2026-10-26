import { emptySheet, normaliseSheet, canMark, canUnmark, lockedBy, gameOverReason, totalScore } from "./rules.js";
import { createSheetView } from "./sheet-view.js";
import * as online from "./online.js";

var SOLO_KEY = "qwixx-score-sheet-v1";
var MAX_UNDO = 200;

function $(id) { return document.getElementById(id); }

// ---- Views and the shared game screen ----

var views = { home: $("view-home"), game: $("view-game"), history: $("view-history") };

function showView(name) {
  Object.keys(views).forEach(function (k) { views[k].hidden = k !== name; });
  window.scrollTo(0, 0);
}

var handlers = {};
function call(name) {
  var args = Array.prototype.slice.call(arguments, 1);
  if (handlers[name]) handlers[name].apply(null, args);
}

var mySheet = createSheetView($("my-sheet"), {
  onCell: function (key, i) { call("onCell", key, i); },
  onLock: function (key) { call("onLock", key); },
  onPenalty: function (i) { call("onPenalty", i); }
});
var oppSheet = createSheetView($("opp-sheet"), {}, { readonly: true, compact: true });

$("undo").addEventListener("click", function () { call("onUndo"); });
$("game-action").addEventListener("click", function () { call("onAction"); });

// model: sheet view model plus { undoEnabled, actionLabel, banner: { text, actions: [{ label, run, secondary }] },
//   opponent: { name, sheet, closed }, hint }
function renderGame(model) {
  mySheet.render(model);
  $("undo").disabled = !model.undoEnabled;
  $("undo").hidden = !!model.hideUndo;

  var action = $("game-action");
  action.hidden = !model.actionLabel;
  action.textContent = model.actionLabel || "";

  var banner = $("banner");
  var actions = $("banner-actions");
  actions.textContent = "";
  if (model.banner) {
    $("banner-text").textContent = model.banner.text;
    (model.banner.actions || []).forEach(function (a) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "btn small" + (a.secondary ? " secondary" : "");
      b.textContent = a.label;
      b.addEventListener("click", a.run);
      actions.appendChild(b);
    });
    banner.className = "banner" + (model.banner.tone ? " " + model.banner.tone : "");
    banner.hidden = false;
  } else {
    banner.hidden = true;
  }

  var opp = model.opponent;
  $("scoreboard").hidden = !opp;
  $("opponent").hidden = !opp;
  if (opp) {
    var mine = totalScore(model.sheet);
    var theirs = totalScore(opp.sheet);
    $("score-me").textContent = mine;
    $("score-them").textContent = theirs;
    $("opp-name").textContent = opp.name;
    document.querySelector(".scoreboard .me").classList.toggle("leading", mine > theirs);
    document.querySelector(".scoreboard .them").classList.toggle("leading", theirs > mine);
    $("opp-summary").textContent = opp.name + "’s sheet";
    oppSheet.render({ sheet: opp.sheet, closed: opp.closed });
  }

  $("hint").textContent = model.hint || "";
}

var ui = {
  showView: showView,
  renderGame: renderGame,
  setHandlers: function (h) { handlers = h || {}; }
};

// ---- Practice game, saved on this device ----

function freshSolo() {
  return { sheet: emptySheet(), closed: {}, history: [] };
}

function loadSolo() {
  try {
    var s = JSON.parse(localStorage.getItem(SOLO_KEY));
    if (s && s.sheet) return { sheet: normaliseSheet(s.sheet), closed: s.closed || {}, history: Array.isArray(s.history) ? s.history : [] };
    // Sheets saved before online play was added kept the marks at the top level.
    if (s && s.marks) return { sheet: normaliseSheet(s), closed: s.closed || {}, history: [] };
  } catch (e) { /* fall through to a fresh sheet */ }
  return freshSolo();
}

function startSolo() {
  var state = loadSolo();

  function over() { return gameOverReason([state.sheet], state.closed); }

  function snapshot() {
    state.history.push(JSON.stringify({ sheet: state.sheet, closed: state.closed }));
    if (state.history.length > MAX_UNDO) state.history.shift();
  }

  function commit() {
    try { localStorage.setItem(SOLO_KEY, JSON.stringify(state)); } catch (e) { /* keep playing in memory */ }
    render();
  }

  ui.setHandlers({
    onCell: function (key, i) {
      var s = state.sheet;
      if (s.marks[key][i]) {
        if (!canUnmark(s, key, i)) return;
        snapshot();
        s.marks[key][i] = false;
      } else {
        if (!canMark(s, key, i, state.closed[key], !!over())) return;
        snapshot();
        s.marks[key][i] = true;
      }
      commit();
    },
    onLock: function (key) {
      if (lockedBy(state.sheet, key)) return;
      if (!state.closed[key] && over()) return;
      snapshot();
      state.closed[key] = !state.closed[key];
      commit();
    },
    onPenalty: function (i) {
      var s = state.sheet;
      if (i < s.penalties) {
        if (i !== s.penalties - 1) return; // only the most recent penalty can be removed
        snapshot();
        s.penalties = i;
      } else {
        if (over()) return;
        snapshot();
        s.penalties += 1;
      }
      commit();
    },
    onUndo: function () {
      var prev = state.history.pop();
      if (!prev) return;
      prev = JSON.parse(prev);
      state.sheet = normaliseSheet(prev.sheet);
      state.closed = prev.closed || {};
      commit();
    },
    onAction: function () {
      if (state.history.length && !confirm("Start a new game? The current sheet will be cleared.")) return;
      state = freshSolo();
      commit();
    }
  });

  function render() {
    var reason = over();
    renderGame({
      sheet: state.sheet,
      closed: state.closed,
      canMark: function (key, i) { return canMark(state.sheet, key, i, state.closed[key], !!reason); },
      canUnmark: function (key, i) { return canUnmark(state.sheet, key, i); },
      lockActive: true,
      undoEnabled: state.history.length > 0,
      actionLabel: "New game",
      banner: reason ? { text: "Game over (" + reason + "). Final score: " + totalScore(state.sheet) } : null,
      opponent: null,
      hint: "Tap a number to cross it out. Tap the rightmost cross again to remove it. Tap a lock when another player closes that colour."
    });
  }

  showView("game");
  render();
  return null;
}

// ---- Routing ----

var stopCurrent = null;

function route() {
  if (stopCurrent) stopCurrent();
  stopCurrent = null;
  ui.setHandlers(null);
  var h = location.hash || "#/";
  if (h === "#/solo") {
    stopCurrent = startSolo();
  } else if (h.indexOf("#/game/") === 0) {
    stopCurrent = online.openGame(decodeURIComponent(h.slice(7)));
  } else if (h === "#/history") {
    showView("history");
    stopCurrent = online.openHistory();
  } else {
    showView("home");
  }
}

window.addEventListener("hashchange", route);
online.init(ui);
route();
