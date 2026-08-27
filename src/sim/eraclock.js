import { ERA_ORDER, active } from "../content/compile.js";
import { CONFIG, TICK_SECONDS } from "../core/config.js";
import { makeRng } from "../core/rng.js";
import { S, me, rivals } from "../core/state.js";
import { hashStr } from "../map/model.js";
import { notify } from "../core/bus.js";
import { advanceEra } from "./era.js";

// ---------- The era clock ------------------------------------
// "In Age of Empires and especially Empire Earth, they never just beat you
// with width. They ADVANCE FASTER. You're like alright lads, let's carefully
// load those muskets, and then a Panzer division comes through the tree line."
// (owner, 2026-08-25 -- the whole idea in one sentence.)
//
// Every OTHER PLAYER runs a hidden countdown to its next age. When it lapses
// they advance, a notification says so, and their next strike comes with
// next-age units. No economy is simulated; nothing else about them changes.
//
// This is the POLICY that `paceRivals()` stood in for while the per-player
// refactor built the mechanism underneath it. The mechanism was finished on
// 2026-08-26 -- any civ can cross a border on its own clock, restock out of
// its own manifest, and keep its own history -- and this file is the thing
// that decides WHEN.
//
// Why it is the missing piece rather than another lever: advancing was already
// the win condition, repeated, and it was a formality. The clock is the
// deadline that turns the capstone from a shopping list into a race. It is the
// first mechanic in the game that answers "why NOW?" rather than "why at all?"

// ---- Pace: drawn once, at the world's birth ----------------------------
// ITS OWN RNG STREAM, like every generation stage (tech.md, named sub-streams):
// drawing pace must not advance the dice the simulation rolls, or adding this
// feature would silently invalidate every recorded seed.
//
// AT LEAST ONE "FASTER" PER WORLD, GUARANTEED (design ruling 3). Independent
// rolls would leave roughly a third of runs with no clock pressure at all and
// no visible reason the run felt flat. There IS a speedster out there; which
// neighbour it is, you have to find out.
const PACES = ["slower", "normal", "faster"];

// IDEMPOTENT, and that is a correctness requirement rather than tidiness. This
// runs at every boot, and a boot happens on every reload -- so an unconditional
// draw would re-roll the schedule from the CURRENT tick, pushing every border
// further away each time the page was refreshed. The clock would have been
// dodgeable by pressing F5, which is the sort of bug that looks like difficulty
// tuning until somebody notices. Paces are drawn once, at the world's birth.
export function assignPaces(list) {
  const unscheduled = list.filter((p) => !p.pace || typeof p.nextEraTick !== "number");
  if (!unscheduled.length) return;

  const rng = makeRng(hashStr(S.seed + ":pace"));
  // Drawn for the WHOLE roster off the seed, so which neighbour is the
  // speedster is a fact about the world rather than about when this function
  // happened to run.
  const paces = list.map(() => PACES[Math.floor(rng() * PACES.length)]);
  if (!paces.includes("faster")) paces[Math.floor(rng() * paces.length)] = "faster";
  list.forEach((p, i) => {
    if (!p.pace) p.pace = paces[i];
    if (typeof p.nextEraTick !== "number" && p.nextEraTick !== null) {
      p.nextEraTick = scheduleNext(p, rng);
    }
  });
}

// When this player's next border lands, in ticks. Jittered per civ so two runs
// on adjacent seeds do not feel identical, and re-rolled after every crossing.
function scheduleNext(p, rng) {
  const mult = CONFIG.eraPaceMult[p.pace] || 1;
  const j = 1 + (rng() * 2 - 1) * CONFIG.eraClockJitter;
  const seconds = CONFIG.eraClockSeconds * mult * j;
  return S.tick + Math.max(1, Math.round(seconds / TICK_SECONDS));
}

// A private stream per civ per crossing, so re-scheduling is deterministic
// without threading the generator through the tick.
function rescheduleFor(p) {
  return scheduleNext(p, makeRng(hashStr(S.seed + ":pace:" + p.id + ":" + p.era)));
}

// ---- The countdown ------------------------------------------------------
// Called once per tick from step(). Cheap: three integer comparisons.
export function tickEraClock() {
  for (const p of rivals()) {
    if (p.broken) continue;   // a broken people's clock has stopped
    // NULL means CAPPED, and it is a sentinel rather than Infinity for a dull
    // but real reason: JSON.stringify turns Infinity into null on save, so a
    // capped civ would have come back looking unscheduled and been handed a
    // fresh countdown into an age that does not exist. Say it in a way the
    // save can carry.
    if (p.nextEraTick === null) continue;
    // A civ seated mid-run (or loaded from a save written before the clock)
    // gets a schedule the first time it is looked at, rather than a special
    // migration path.
    if (!p.pace || typeof p.nextEraTick !== "number") { assignPaces(rivals()); return; }
    if (S.tick < p.nextEraTick) continue;

    // CAPPED AT THE LAST IMPLEMENTED ERA, exactly like the player (ruling 4).
    // A civ that has run out of ages simply stops, rather than the clock
    // pushing it into a manifest that does not exist.
    const i = ERA_ORDER.indexOf(p.era);
    const next = ERA_ORDER[i + 1];
    if (!next) { p.nextEraTick = null; continue; }

    advanceEra(next, p);
    p.nextEraTick = rescheduleFor(p);
    announce(p, next);
  }
}

// ---- The telegraph ------------------------------------------------------
// MANDATORY (ruling 5). One line converts an ambush into a countdown you can
// see, and it is a heart-sink moment on purpose -- this is how Age of Empires
// does it. Deliberately shaped as NEWS rather than flavour: the Chronicle is
// on its way to being a notification system, and a rival crossing a border is
// exactly the kind of fact that belongs there. What it is NOT is prose about
// your own settlement.
function announce(p, era) {
  const name = displayName(p);
  const ahead = ERA_ORDER.indexOf(era) - ERA_ORDER.indexOf(me().era);
  const eraName = eraLabel(era);
  if (ahead > 0) {
    // The half that has to land: they are ahead of YOU, and their next strike
    // comes in a shape you cannot answer yet.
    notify(`${name} have entered the ${eraName} — ahead of you. Their war bands will not look like yours.`);
  } else {
    notify(`${name} have entered the ${eraName}.`);
  }
}

function eraLabel(era) {
  return era.charAt(0).toUpperCase() + era.slice(1) + " Age";
}

// A people's name as the world knows it IN THEIR OWN AGE -- "the hill camps"
// at Stone is "the Hill People" at Bronze, and the notification is about what
// they have just become. Read through active(p), which is the whole point of
// that function taking a civ.
function displayName(p) {
  const roster = active(p).adversaries || [];
  const found = roster.find((a) => a.id === p.key);
  const name = found ? found.name : (p.key || "A people");
  return name.charAt(0).toUpperCase() + name.slice(1);
}
