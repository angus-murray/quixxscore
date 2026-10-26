(function () {
  "use strict";

  var COLOURS = [
    { key: "red", numbers: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
    { key: "yellow", numbers: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
    { key: "green", numbers: [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2] },
    { key: "blue", numbers: [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2] }
  ];
  var CELLS = 11;
  var LAST = CELLS - 1;
  var MIN_TO_LOCK = 5;
  var MAX_PENALTIES = 4;
  var PENALTY_POINTS = 5;
  var STORAGE_KEY = "qwixx-score-sheet-v1";

  var LOCK_SVG =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5zm-3 5a3 3 0 0 1 6 0v3H9V7z"/></svg>';

  function freshState() {
    var s = { marks: {}, closed: {}, penalties: 0, history: [] };
    COLOURS.forEach(function (c) {
      s.marks[c.key] = new Array(CELLS).fill(false);
      s.closed[c.key] = false; // closed by another player
    });
    return s;
  }

  var state = load() || freshState();

  function load() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var s = JSON.parse(raw);
      if (!s || !s.marks || !s.closed) return null;
      if (!Array.isArray(s.history)) s.history = [];
      return s;
    } catch (e) {
      return null;
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) { /* storage unavailable: keep playing in memory */ }
  }

  // ---- Rules and scoring ----

  function markCount(key) {
    return state.marks[key].filter(Boolean).length;
  }

  function lockedByMe(key) {
    return state.marks[key][LAST];
  }

  function rowClosed(key) {
    return lockedByMe(key) || state.closed[key];
  }

  function rightmost(key) {
    return state.marks[key].lastIndexOf(true);
  }

  function crosses(key) {
    // Crossing the last number also crosses the lock, which counts as an extra cross.
    return markCount(key) + (lockedByMe(key) ? 1 : 0);
  }

  function triangular(n) {
    return (n * (n + 1)) / 2;
  }

  function rowScore(key) {
    return triangular(crosses(key));
  }

  function closedRowCount() {
    return COLOURS.filter(function (c) { return rowClosed(c.key); }).length;
  }

  function gameOver() {
    return state.penalties >= MAX_PENALTIES || closedRowCount() >= 2;
  }

  function canMark(key, i) {
    if (state.marks[key][i]) return false;
    if (gameOver() || rowClosed(key)) return false;
    if (i <= rightmost(key)) return false;
    if (i === LAST && markCount(key) < MIN_TO_LOCK) return false;
    return true;
  }

  function canUnmark(key, i) {
    if (!state.marks[key][i]) return false;
    return i === rightmost(key);
  }

  // ---- Actions ----

  function record(action) {
    state.history.push(action);
    if (state.history.length > 200) state.history.shift();
  }

  function toggleCell(key, i) {
    if (state.marks[key][i]) {
      if (!canUnmark(key, i)) return;
      state.marks[key][i] = false;
      record({ type: "cell", key: key, i: i, value: false });
    } else {
      if (!canMark(key, i)) return;
      state.marks[key][i] = true;
      record({ type: "cell", key: key, i: i, value: true });
    }
    commit();
  }

  function toggleClosed(key) {
    if (lockedByMe(key)) return;
    state.closed[key] = !state.closed[key];
    record({ type: "closed", key: key, value: state.closed[key] });
    commit();
  }

  function setPenalty(i) {
    var before = state.penalties;
    if (i < state.penalties) {
      // Only the most recent penalty can be removed.
      if (i !== state.penalties - 1) return;
      state.penalties = i;
    } else {
      if (gameOver()) return;
      state.penalties += 1;
    }
    record({ type: "penalty", before: before, after: state.penalties });
    commit();
  }

  function undo() {
    var a = state.history.pop();
    if (!a) return;
    if (a.type === "cell") state.marks[a.key][a.i] = !a.value;
    else if (a.type === "closed") state.closed[a.key] = !a.value;
    else if (a.type === "penalty") state.penalties = a.before;
    commit();
  }

  function newGame() {
    if (state.history.length && !confirm("Start a new game? The current sheet will be cleared.")) return;
    state = freshState();
    commit();
  }

  function commit() {
    save();
    render();
  }

  // ---- Rendering ----

  var rowsEl = document.getElementById("rows");
  var penaltiesEl = document.getElementById("penalties");
  var cellEls = {};
  var lockEls = {};
  var rowEls = {};
  var penaltyEls = [];

  function build() {
    COLOURS.forEach(function (c) {
      var row = document.createElement("div");
      row.className = "row " + c.key;
      rowEls[c.key] = row;

      var arrow = document.createElement("span");
      arrow.className = "arrow";
      row.appendChild(arrow);

      cellEls[c.key] = c.numbers.map(function (n, i) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "cell" + (i === LAST ? " last" : "");
        b.textContent = n;
        b.setAttribute("aria-label", c.key + " " + n);
        b.addEventListener("click", function () { toggleCell(c.key, i); });
        row.appendChild(b);
        return b;
      });

      var lock = document.createElement("button");
      lock.type = "button";
      lock.className = "lock";
      lock.innerHTML = LOCK_SVG;
      lock.addEventListener("click", function () { toggleClosed(c.key); });
      row.appendChild(lock);
      lockEls[c.key] = lock;

      rowsEl.appendChild(row);
    });

    var crossesEl = document.getElementById("legend-crosses");
    var pointsEl = document.getElementById("legend-points");
    for (var n = 1; n <= 12; n++) {
      var a = document.createElement("td");
      a.textContent = n + "×";
      crossesEl.appendChild(a);
      var p = document.createElement("td");
      p.textContent = triangular(n);
      pointsEl.appendChild(p);
    }

    for (var i = 0; i < MAX_PENALTIES; i++) {
      (function (i) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "penalty";
        b.textContent = "−" + PENALTY_POINTS;
        b.setAttribute("aria-label", "Penalty " + (i + 1));
        b.addEventListener("click", function () { setPenalty(i); });
        penaltiesEl.appendChild(b);
        penaltyEls.push(b);
      })(i);
    }

    document.getElementById("undo").addEventListener("click", undo);
    document.getElementById("new-game").addEventListener("click", newGame);
  }

  function render() {
    var total = 0;

    COLOURS.forEach(function (c) {
      var key = c.key;
      var right = rightmost(key);
      cellEls[key].forEach(function (el, i) {
        var marked = state.marks[key][i];
        el.classList.toggle("marked", marked);
        el.classList.toggle("skipped", !marked && i < right);
        el.classList.toggle("unavailable", !marked && !canMark(key, i));
        el.setAttribute("aria-pressed", marked ? "true" : "false");
      });

      var lock = lockEls[key];
      lock.classList.toggle("marked", lockedByMe(key));
      lock.classList.toggle("closed", state.closed[key] && !lockedByMe(key));
      lock.setAttribute("aria-label", key + " lock" +
        (lockedByMe(key) ? " (locked by you)" : state.closed[key] ? " (closed by another player)" : ""));
      rowEls[key].classList.toggle("closed", rowClosed(key));

      var score = rowScore(key);
      total += score;
      document.getElementById("total-" + key).textContent = score;
    });

    penaltyEls.forEach(function (el, i) {
      el.classList.toggle("marked", i < state.penalties);
    });

    var penalty = state.penalties * PENALTY_POINTS;
    total -= penalty;
    document.getElementById("total-penalty").textContent = penalty;
    document.getElementById("total").textContent = total;

    document.getElementById("undo").disabled = state.history.length === 0;

    var banner = document.getElementById("banner");
    if (gameOver()) {
      var reason = state.penalties >= MAX_PENALTIES ? "four penalties taken" : "two colours closed";
      banner.textContent = "Game over (" + reason + "). Final score: " + total;
      banner.hidden = false;
    } else {
      banner.hidden = true;
    }
  }

  build();
  render();
})();
