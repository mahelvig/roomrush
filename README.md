# Room Rush

A fast arcade dungeon run for phones, in the spirit of Archero and Vampire Survivors.

**Play:** https://mahelvig.github.io/roomrush/

- Three worlds (Whispering Woods, Ember Caverns, Frozen Crypt), each with 20 rooms.
  Every 5th room is an elite room, room 20 is a boss.
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
| `js/game.js` | Rooms, shots, pickups, camera, drawing the game |
| `js/enemies.js`, `js/bosses.js` | Enemy behaviour and boss attacks |
| `js/room.js` | Room layouts, collision and path finding |
| `js/ui.js` | Menus, perk cards, HUD |

Run it locally with any static web server (for example `npx serve .`) or just open
`index.html`. Add `#dev` to the address for test keys (K kills enemies, B jumps to the boss,
I makes you invincible, G gives gold and gems).
