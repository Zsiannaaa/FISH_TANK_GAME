# FinFriends — Class Fish Tank

A tiny offline classroom game: each group has one fish, and every point makes that fish grow.

## Open it

Double-click **`index.html`**. It works in a modern browser without internet, a server, installation, or a build step.

For the best projector view, use the fullscreen button in the top-right corner. Sound is off by default; the speaker button enables it.

## Teacher controls

- Use **+1**, **+5**, **+10**, or enter a custom amount for a group.
- The minus button removes one point.
- Number keys **1–9** add one point to that group.
- **Shift + 1–9** adds five points.
- **Feed all** drops food flakes for the fish to chase.
- **H** hides or shows the teacher controls and top bar.
- **Settings** changes group names, colors, or count while preserving existing groups' points.
- **Reset points** asks for confirmation first.
- **Export** downloads a JSON backup; **Import** restores one.

Progress saves automatically in this browser's local storage. If storage is unavailable, the game continues and shows a reminder to export a backup. Test-mode changes are not saved automatically.

## Test mode

Press **T** to open or close the time-lapse lab. Closing it restores the real saved scores.

- Auto points add random points to every group; adjust the speed or pause them.
- **+1 day**, **+1 week**, and **+1 month** add varied points based on the average-per-day setting.
- **Reset test** restores the real saved points without leaving test mode.
- The graph and readout show the current points-to-size relationship.
- **Keep as real** is the only test action that can overwrite real scores, and it asks for confirmation first.

At 1× auto speed, fish go from tiny to near their comfortable maximum in roughly 30 seconds.

## Tune the growth curve

Open `main.js`. The three constants are at the very top:

```js
const MIN_SIZE = 46;
const MAX_SIZE = 142;
const K = 60;
```

The formula is:

```text
size = MIN_SIZE + (MAX_SIZE - MIN_SIZE) * (1 - e^(-points / K))
```

A smaller `K` makes early growth faster; a larger `K` makes it slower. `MAX_SIZE` caps the fish size so it stays inside the tank.

## Files

- `index.html` — accessible screens, buttons, and inline SVG icons
- `style.css` — responsive classroom interface and reduced-motion styles
- `fish.js` — canvas fish, underwater scenery, food, bubbles, and effects
- `main.js` — scoring, animation loop, storage, sound, keyboard controls, and test mode

There are no external assets, fonts, libraries, network requests, or dependencies.
