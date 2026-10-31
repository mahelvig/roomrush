# Room Rush

A fast arcade dungeon run for phones, in the spirit of Archero and Vampire Survivors.

**Play:** https://mahelvig.github.io/roomrush/

- Five worlds (Whispering Woods, Ember Caverns, Frozen Crypt, Skyward Ruins, Iron Citadel),
  each with 20 rooms and harder difficulty tiers once cleared. Every 5th room is an elite room,
  room 20 is a boss. The Iron Citadel is different: you climb tall fortress rooms past towers
  that run on power cores, and the boss is an escort.
- The Depths: endless worlds, each harder than the last.
- Relics instead of gear: found on the harder tiers, two worn per run, each changing how you
  play. Max both perks of a found recipe in a run and they merge into an evolution.
- Your weapon fires on its own at the nearest enemy. You shoot faster while standing still.
- After every room you pick one of two perks: extra shots, fire, poison, frost, lightning,
  curses, companions, shields and more. Rarer perks are stronger.
- Gold and gems carry over between runs: buy permanent upgrades and unlock new heroes.
- Portrait, full screen, touch controls (drag anywhere to move). Add it to your home screen
  to play it like an app, also offline.

## Code

Plain JavaScript and HTML5 canvas, no build step and no image files: every character,
enemy and effect is drawn in code (`js/art.js`, `js/scenery.js`), and the sounds and
music are made with Web Audio (`js/audio.js`).

| File | What it does |
| --- | --- |
| `js/config.js` | Heroes, worlds, enemies, bosses, permanent upgrades |
| `js/perks.js` | All perks and how they change your stats |
| `js/relics.js` | Relics, their drops and effects, and perk evolutions |
| `js/game.js` | Rooms, shots, pickups, camera, drawing the game |
| `js/enemies.js`, `js/bosses.js` | Enemy behaviour and boss attacks |
| `js/fortress.js` | The Iron Citadel: fortress rooms, towers, cores, the escort boss |
| `js/room.js` | Room layouts, collision and path finding |
| `js/ui.js` | Menus, perk cards, HUD |

Run it locally with any static web server (for example `npx serve .`) or just open
`index.html`. Add `#dev` to the address for test keys (K kills enemies, B jumps to the boss,
I makes you invincible, G gives gold and gems).

## Tests

Browser tests in `tests/` play the game in headless Chromium with Playwright: screen layout
on phones and iPads, touch controls, menus, clearing a room, a boss beam, and perk values.
The game itself still needs no build step; the tests are the only thing that uses npm.

```
npm install
npx playwright install chromium
npm test              # everything, about 30 seconds
npm test -- touch     # only tests whose file or name contains "touch"
```

To add a test, put a `{ name, size, run(page) }` in one of the `*.test.js` files (or a new
one); `tests/helpers.js` has helpers to start a run, read the hero's position and drag a
finger. A test fails if it throws or the page logs an error.
