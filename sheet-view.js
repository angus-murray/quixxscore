// Draws one score sheet. The same view is used for your own sheet and, read-only, for an opponent's.
import { COLOURS, LAST, MAX_PENALTIES, PENALTY_POINTS, triangular, rightmost, lockedBy, rowScore, penaltyPoints, totalScore } from "./rules.js";

var LOCK_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5zm-3 5a3 3 0 0 1 6 0v3H9V7z"/></svg>';

function el(tag, className, text) {
  var e = document.createElement(tag);
  if (className) e.className = className;
  if (text != null) e.textContent = text;
  return e;
}

export function createSheetView(root, handlers, options) {
  handlers = handlers || {};
  options = options || {};
  var readonly = !!options.readonly;

  var sheetEl = el("div", "sheet" + (readonly ? " readonly" : "") + (options.compact ? " compact" : ""));
  var rowsEl = el("div", "rows");
  var cellEls = {};
  var lockEls = {};
  var rowEls = {};
  var totalEls = {};
  var penaltyEls = [];

  function button(className, text, onClick) {
    var b = el("button", className, text);
    b.type = "button";
    if (readonly) b.tabIndex = -1;
    else b.addEventListener("click", onClick);
    return b;
  }

  COLOURS.forEach(function (c) {
    var row = el("div", "row " + c.key);
    rowEls[c.key] = row;
    row.appendChild(el("span", "arrow"));
    cellEls[c.key] = c.numbers.map(function (n, i) {
      var b = button("cell" + (i === LAST ? " last" : ""), n, function () {
        if (handlers.onCell) handlers.onCell(c.key, i);
      });
      b.setAttribute("aria-label", c.label + " " + n);
      row.appendChild(b);
      return b;
    });
    var lock = button("lock", null, function () {
      if (handlers.onLock) handlers.onLock(c.key);
    });
    lock.innerHTML = LOCK_SVG;
    row.appendChild(lock);
    lockEls[c.key] = lock;
    rowsEl.appendChild(row);
  });
  sheetEl.appendChild(rowsEl);

  // Crosses/points table and penalty boxes
  var bottom = el("div", "bottom");
  var table = el("table", "legend");
  var crossesRow = el("tr");
  var pointsRow = el("tr");
  var th1 = el("th", null, "Crosses");
  var th2 = el("th", null, "Points");
  th1.scope = th2.scope = "row";
  crossesRow.appendChild(th1);
  pointsRow.appendChild(th2);
  for (var n = 1; n <= 12; n++) {
    crossesRow.appendChild(el("td", null, n + "×"));
    pointsRow.appendChild(el("td", null, triangular(n)));
  }
  table.appendChild(crossesRow);
  table.appendChild(pointsRow);
  bottom.appendChild(table);

  var penalties = el("div", "penalties");
  penalties.appendChild(el("span", "penalty-label", "Penalties"));
  var boxes = el("div", "penalty-boxes");
  for (var p = 0; p < MAX_PENALTIES; p++) {
    (function (p) {
      var b = button("penalty", "−" + PENALTY_POINTS, function () {
        if (handlers.onPenalty) handlers.onPenalty(p);
      });
      b.setAttribute("aria-label", "Penalty " + (p + 1));
      boxes.appendChild(b);
      penaltyEls.push(b);
    })(p);
  }
  penalties.appendChild(boxes);
  bottom.appendChild(penalties);
  sheetEl.appendChild(bottom);

  // Totals line
  var totals = el("div", "totals");
  function totalBox(cls, tag) {
    var box = el("div", "total-box " + cls);
    box.appendChild(el("span", "total-tag", tag));
    var out = el("output");
    out.textContent = "0";
    box.appendChild(out);
    totals.appendChild(box);
    return out;
  }
  COLOURS.forEach(function (c, i) {
    if (i > 0) totals.appendChild(el("span", "op", "+"));
    totalEls[c.key] = totalBox(c.key, c.label);
  });
  totals.appendChild(el("span", "op", "−"));
  totalEls.penalty = totalBox("penalty-total", "Penalties");
  totals.appendChild(el("span", "op", "="));
  totalEls.total = totalBox("grand", "Total");
  sheetEl.appendChild(totals);

  root.appendChild(sheetEl);

  // model: { sheet, closed: {key: bool}, canMark(key, i), canUnmark(key, i), lockActive }
  function render(model) {
    var sheet = model.sheet;
    var closed = model.closed || {};
    COLOURS.forEach(function (c) {
      var key = c.key;
      var right = rightmost(sheet, key);
      var mine = lockedBy(sheet, key);
      cellEls[key].forEach(function (b, i) {
        var marked = sheet.marks[key][i];
        b.classList.toggle("marked", marked);
        b.classList.toggle("skipped", !marked && i < right);
        b.classList.toggle("unavailable", readonly || (marked ? !(model.canUnmark && model.canUnmark(key, i)) : !(model.canMark && model.canMark(key, i))));
        b.setAttribute("aria-pressed", marked ? "true" : "false");
      });
      var lock = lockEls[key];
      lock.classList.toggle("marked", mine);
      lock.classList.toggle("closed", !!closed[key] && !mine);
      lock.classList.toggle("unavailable", readonly || !model.lockActive);
      lock.setAttribute("aria-label", c.label + " lock" +
        (mine ? " (locked)" : closed[key] ? " (closed by another player)" : ""));
      rowEls[key].classList.toggle("closed", mine || !!closed[key]);
      totalEls[key].textContent = rowScore(sheet, key);
    });
    penaltyEls.forEach(function (b, i) {
      b.classList.toggle("marked", i < sheet.penalties);
    });
    totalEls.penalty.textContent = penaltyPoints(sheet);
    totalEls.total.textContent = totalScore(sheet);
  }

  return { render: render, element: sheetEl };
}
