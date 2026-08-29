import { active, roster } from "../content/compile.js";
import { CONFIG, TICK_SECONDS } from "./config.js";
import { PLAYER_COLORS } from "./palette.js";
import { S, freshPlayer, freshState, me, playerByKey, setS } from "./state.js";
import { chronicle } from "../core/bus.js";

// ---------- Save / load -------------------------------------
// Save is load-bearing (design.md, Time, Presence & Pause): the world stops
// when the player does, so stopping and resuming EXACTLY is a correctness
// requirement, not a convenience. It runs on a 10s interval, after every
// player action (assign, build, cancel, launch), and when the tab is hidden
// or closed. There is no offline catch-up to paper over a stale save.

// hardReset() wipes the save and reloads -- and the reload fires pagehide,
// whose save() would silently re-write the very save being cleared (S is
// still in memory). One flag instead of listener juggling; a reload resets it.
let suppressed = false;
export function suppressSaves() { suppressed = true; }

export function save() {
  if (S.dead || suppressed) return;
  // A TABLE IS NOT RESUMABLE (M1). While a second human holds a seat, this
  // world exists only for as long as the socket does -- so it is never
  // written over the host's own save. What survives is the solo run they had
  // before the table opened, which is exactly what they would want back.
  if (S.players && S.players.some((p) => p.remote)) return;
  try { localStorage.setItem(CONFIG.saveKey, JSON.stringify(S)); } catch (e) {}
}

export function load() {
  let data = null;
  try { data = JSON.parse(localStorage.getItem(CONFIG.saveKey)); } catch (e) {}
  if (!data) { setS(freshState()); return false; }
  setS(Object.assign(freshState(), data));

  // THE PLAYER SPLIT (2026-08-26). Everything belonging to a civilization moved
  // off S and into S.players; a save written before that has those fields at
  // the top level. Rather than a version branch, the loader reads from whichever
  // place holds them -- `src` below is the save's own player record if it has
  // one, and the save itself if it does not. One expression, both schemas, and
  // it keeps working when a third field moves.
  S.players = Array.isArray(data.players) && data.players.length
    ? data.players.map((p, i) => Object.assign(freshPlayer(i), p, { id: i }))
    : [freshPlayer(0)];
  // AND HEAL A SAVE THAT SOMEHOW CARRIES ONE. A solo save has exactly one
  // keyless civ; any others are remote seats a crash left behind, and they
  // would each claim one of the world's guaranteed starts. Trailing-only, so
  // nobody else's id (which is their index, and keys the ownership table)
  // moves underneath them.
  while (S.players.length > 1) {
    const last = S.players[S.players.length - 1];
    if (last.key == null && (last.remote || S.players.filter((p) => p.key == null).length > 1)) {
      S.players.pop();
    } else break;
  }
  S.me = typeof data.me === "number" && S.players[data.me] ? data.me : 0;
  const src = (Array.isArray(data.players) && data.players[S.me]) || data;
  const blank = freshPlayer(S.me);
  const p = me();

  // Merged against a fresh record rather than a literal, so a resource added
  // later defaults to 0 in old saves without touching this line again.
  p.res = Object.assign(blank.res, src.res);
  p.builds = Object.assign(blank.builds, src.builds);
  p.units = Object.assign(blank.units, src.units);
  p.upgrades = src.upgrades || {};
  p.eraHistory = src.eraHistory || {};
  p.expeditions = Array.isArray(src.expeditions) ? src.expeditions : [];
  p.buildQueue = Array.isArray(src.buildQueue) ? src.buildQueue : [];
  if (typeof src.era === "string") p.era = src.era;
  if (typeof src.seatName === "string") p.seatName = src.seatName;
  if (typeof src.seat === "string") p.seat = src.seat;
  // `playerColor` was the pre-split name and sat on S.
  if (typeof src.color === "string") p.color = src.color;
  else if (typeof data.playerColor === "string") p.color = data.playerColor;
  if (typeof src.pop === "number") p.pop = src.pop;
  if (typeof src.bought === "number") p.bought = src.bought;

  if (typeof src.revealed !== "undefined") p.revealed = Array.isArray(src.revealed) ? src.revealed : [];
  if (typeof src.sighted !== "undefined") p.sighted = Array.isArray(src.sighted) ? src.sighted : [];

  S.seen = data.seen || {};
  S.adversaries = data.adversaries || {};
  S.map = data.map || null;

  // THE OWNERSHIP SPLIT (2026-08-26). Ownership was `S.map.owned`, an array on
  // the one player; it is `S.map.owner[tileId] = playerId` now, so a tile can
  // answer "whose?" for anybody. Fog moved the other way, off the shared map
  // and onto the civ that knows it. A save from before either carries the old
  // shape, and this is the one place that has to know both.
  if (S.map) {
    if (!S.map.owner) {
      S.map.owner = {};
      for (const id of (Array.isArray(S.map.owned) ? S.map.owned : [])) S.map.owner[id] = S.me;
    }
    delete S.map.owned;
    if (Array.isArray(S.map.revealed) && !p.revealed.length) p.revealed = S.map.revealed;
    if (Array.isArray(S.map.sighted) && !p.sighted.length) p.sighted = S.map.sighted;
    delete S.map.revealed;
    delete S.map.sighted;
  }

  // Saves from before the tick clock counted seconds in S.playtime. One-time
  // conversion; the old field rides along inert, per the state invariant.
  if (data.tick === undefined && typeof data.playtime === "number") {
    S.tick = Math.floor(data.playtime / TICK_SECONDS);
  }
  return true;
}

// Give every adversary of the ACTIVE era its living state entry if it doesn't
// have one yet -- called at boot and on era entry. Never re-initializes: a
// half-plundered stock stays half-plundered across save/load.
// STOCKS GROW AND REFILL PER AGE, as long as their owners are alive (owner
// ruling, 2026-08-24). A fixed stock makes their economy static while YOURS
// compounds, so a neighbour is looted dry once and then has nothing left to
// offer but nuisance -- "if they only ever have 50 gold you could exhaust
// their gold stock early, and then have no reason to interact with them again
// other than fending them off." Growing-and-refilling is a fake economy that
// behaves like a real one, with no engine to run.
//
// So an era flip re-stocks. Within an age, depletion PERSISTS: plunder a
// larder and it stays plundered, breach a wall and it stays breached. Across
// an age it does not, because an age is centuries -- you burned their
// granary, then eighty years passed and their grandchildren rebuilt it.
//
// STANDING is the exception, and deliberately so: grudges outlive granaries.
// They remember what your people did, however long ago it was.
//
// This also repairs a real regression. Adversaries used to first appear at
// Iron, so their state was seeded with Iron's numbers. Since the roster moved
// to the Stone Age they are first seen there, and seeding-once meant every
// Iron major stood unwalled with a stone-age larder: no gold anywhere, every
// caravan "traded dry" the instant it launched, sieges trivial.
// NEIGHBOURS ARE PLAYERS (2026-08-26, the last stage of the refactor). They
// were a side table -- `S.adversaries[id] = { stock, standing, walls, era }` --
// which is a parallel track by construction: a record shaped nothing like a
// civilization, that no player system could read and no player verb could act
// on. They are entries in `S.players` now, with the same fields as you.
//
// The merge that matters most: their `stock` became `res`. Plundering a
// neighbour takes from their RESOURCES, the same pile yours comes out of, so
// the day a bot spends its own wood on its own buildings there is nothing to
// convert. That is the whole roadmap in one field rename.
//
// STOCKS GROW AND REFILL PER AGE, as long as their owners are alive (owner
// ruling, 2026-08-24). A fixed stock makes their economy static while YOURS
// compounds, so a neighbour is looted dry once and then has nothing left to
// offer but nuisance. Growing-and-refilling is a fake economy that behaves
// like a real one, with no engine to run.
//
// Within an age, depletion PERSISTS: plunder a larder and it stays plundered.
// Across an age it does not, because an age is centuries -- you burned their
// granary, then eighty years passed and their grandchildren rebuilt it.
// STANDING is the exception, and deliberately so: grudges outlive granaries.
//
// AND IT IS THEIR OWN AGE THAT REFILLS IT NOW. This used to compare against
// the HUMAN's era, which is the "rival strength keyed to your progress" defect
// the review named -- scale to the player and you get the Oblivion problem.
// Each neighbour carries its own clock and is authored out of its own
// manifest; nothing advances them yet, and when something does, this line
// already means the right thing.
export function initAdversaries() {
  // THE ROSTER, CAPPED BY THE RUN (2026-08-28). `S.bots` decides how many
  // rival peoples exist at all; at 0 this loop does nothing and the world has
  // only its players. The generator reads the same accessor for seats and
  // steadings, so the three can never disagree.
  for (const adv of roster()) {
    let p = playerByKey(adv.id);
    if (!p) {
      // The colour is AUTHORED (each people wears its own in every age), but
      // the human picked theirs first on the start screen: a collision falls
      // to the first palette colour nobody on the board is wearing, so two
      // civilizations never fly the same discs.
      let col = adv.color || null;
      if (col && S.players.some((x) => x.color === col)) {
        const taken = S.players.map((x) => x.color);
        const free = PLAYER_COLORS.find((c) => !taken.includes(c.id));
        col = free ? free.id : col;
      }
      p = freshPlayer(S.players.length, {
        key: adv.id,
        color: col,
        era: me().era,          // seated into the age the world is currently in
      });
      p.res = Object.assign({}, adv.stock);
      p.walls = adv.walls || 0;
      S.players.push(p);
    } else if (p.color == null || p.color === me().color ||
               S.players.some((x) => x !== p && x.color === p.color)) {
      // HEAL OLDER SAVES: rival records made before colours were authored
      // (2026-08-26) carry the default purple -- the human's default too, so
      // every disc on the board would fly one flag. Boot is the one moment the
      // fixed-for-the-run rule lets a colour be written, and this rewrites
      // only records that are wrong: null, duplicated, or the human's own.
      const taken = S.players.filter((x) => x !== p).map((x) => x.color);
      p.color = (adv.color && !taken.includes(adv.color)) ? adv.color
        : (PLAYER_COLORS.find((c) => !taken.includes(c.id)) || { id: p.color }).id;
    }
    if (p.era !== p.seenEra) {
      // FROM THEIR OWN AGE, not the viewer's (fixed 2026-08-26, caught by the
      // capital-siege check): `adv` above is the human manifest's def. Who
      // they have become is what rebuilds the walls.
      //
      // THE LARDER RESTOCK IS RETIRED (S2, the antagonist spec): a civ's
      // stores come from its own territory's income now, so surviving to a
      // birthday no longer refills a plundered larder -- what you burned
      // stays burned until their ground earns it back. Walls are not economy
      // and still rebuild taller across an age. (Rebirth keeps its one
      // baseline restock, in sim/bots.js, per the fairly-reset ruling.)
      const own = (active(p).adversaries || []).find((a) => a.id === adv.id) || adv;
      p.walls = own.walls || 0;               // a new age, the walls rebuilt taller
    }
    // `seenEra` is the age this record was last stocked for. Kept beside the
    // era rather than compared against it directly, so that ADVANCING is what
    // triggers a restock rather than merely existing in an age.
    p.seenEra = p.era;
    // EVERY LEDGER KEY IS A NUMBER (S2). Authored stocks name only what a
    // people has, and a save written during the NaN window carries nulls --
    // both heal here, at the one place adversary records are reconciled.
    for (const r of active(p).resources) {
      if (!Number.isFinite(p.res[r.id])) p.res[r.id] = 0;
    }
  }
}
