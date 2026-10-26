// Qwixx rules and scoring. A sheet is { marks: { red: [11 booleans], ... }, penalties, done }.

var UP = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
var DOWN = [12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2];

export var COLOURS = [
  { key: "red", label: "Red", numbers: UP },
  { key: "yellow", label: "Yellow", numbers: UP },
  { key: "green", label: "Green", numbers: DOWN },
  { key: "blue", label: "Blue", numbers: DOWN }
];
export var CELLS = 11;
export var LAST = CELLS - 1;
export var MIN_TO_LOCK = 5;
export var MAX_PENALTIES = 4;
export var PENALTY_POINTS = 5;

export function emptySheet() {
  var marks = {};
  COLOURS.forEach(function (c) { marks[c.key] = new Array(CELLS).fill(false); });
  return { marks: marks, penalties: 0, done: false };
}

// Fill in anything missing from a stored or remote sheet.
export function normaliseSheet(s) {
  var out = emptySheet();
  if (!s) return out;
  COLOURS.forEach(function (c) {
    var row = s.marks && s.marks[c.key];
    if (Array.isArray(row)) {
      for (var i = 0; i < CELLS; i++) out.marks[c.key][i] = !!row[i];
    }
  });
  out.penalties = Math.max(0, Math.min(MAX_PENALTIES, Number(s.penalties) || 0));
  out.done = !!s.done;
  return out;
}

export function cloneSheet(s) {
  return normaliseSheet(JSON.parse(JSON.stringify(s)));
}

export function markCount(sheet, key) {
  return sheet.marks[key].filter(Boolean).length;
}

export function lockedBy(sheet, key) {
  return sheet.marks[key][LAST];
}

export function rightmost(sheet, key) {
  return sheet.marks[key].lastIndexOf(true);
}

// Crossing the last number also crosses the lock, which counts as an extra cross.
export function crosses(sheet, key) {
  return markCount(sheet, key) + (lockedBy(sheet, key) ? 1 : 0);
}

export function triangular(n) {
  return (n * (n + 1)) / 2;
}

export function rowScore(sheet, key) {
  return triangular(crosses(sheet, key));
}

export function penaltyPoints(sheet) {
  return sheet.penalties * PENALTY_POINTS;
}

export function totalScore(sheet) {
  return COLOURS.reduce(function (sum, c) { return sum + rowScore(sheet, c.key); }, 0) - penaltyPoints(sheet);
}

// Colours closed by any of the sheets, plus any marked closed by hand.
export function closedColours(sheets, extraClosed) {
  return COLOURS.filter(function (c) {
    return (extraClosed && extraClosed[c.key]) || sheets.some(function (s) { return lockedBy(s, c.key); });
  }).map(function (c) { return c.key; });
}

// Returns null while the game is running, otherwise the reason it ended.
export function gameOverReason(sheets, extraClosed) {
  if (sheets.some(function (s) { return s.penalties >= MAX_PENALTIES; })) return "four penalties taken";
  if (closedColours(sheets, extraClosed).length >= 2) return "two colours closed";
  return null;
}

// closedByOther: another player has locked this colour. The last number can still be
// crossed, because players may lock the same colour on the same roll.
export function canMark(sheet, key, i, closedByOther, over) {
  if (sheet.marks[key][i] || over) return false;
  if (lockedBy(sheet, key)) return false;
  if (i <= rightmost(sheet, key)) return false;
  if (i === LAST && markCount(sheet, key) < MIN_TO_LOCK) return false;
  if (closedByOther && i !== LAST) return false;
  return true;
}

export function canUnmark(sheet, key, i) {
  return sheet.marks[key][i] && i === rightmost(sheet, key);
}
