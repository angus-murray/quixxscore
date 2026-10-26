# Qwixx score sheet

A browser-based Qwixx score sheet that tallies your score as you play. It works on phones (portrait or landscape), tablets and desktop browsers, and has no build step or dependencies.

Open `index.html` directly, or host the folder on any static host (for example GitHub Pages). On a phone, "Add to Home Screen" gives a full-screen app.

## Use

- Tap a number to cross it out. Numbers to its left are greyed out, as they can no longer be used.
- The last number in a row (12 for red and yellow, 2 for green and blue) unlocks after five crosses. Crossing it also crosses the lock, which counts as an extra cross.
- Tap a row's lock when another player closes that colour.
- Tap a penalty box for each failed throw (−5 each).
- Tap the rightmost cross in a row to remove it, or use Undo.
- The game ends when two colours are closed or four penalties are taken.
- Untick "Enforce rules" to cross any box freely, for example to copy a paper sheet.

The sheet is saved in the browser, so a refresh or closed tab does not lose the game.

## Scoring

A row with n crosses scores n(n + 1)/2 points (1, 3, 6, 10 … 78). The total is the sum of the four rows minus 5 per penalty.
