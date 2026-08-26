import { DEF_CATEGORIES, active } from "../content/compile.js";
import { playtime } from "../core/derived.js";
import { ensureMap, syncDominion } from "../map/map.js";
import { initAdversaries } from "../core/persist.js";
import { S, me } from "../core/state.js";

import { fmtTime, setSpeed } from "../ui/chrome.js";
import { log } from "../ui/log.js";
import { openEraModal } from "../ui/modal.js";

// ONE CIVILIZATION CROSSES A BORDER (2026-08-26). Eras are per-player, so this
// is something a civ DOES rather than something the world undergoes -- and the
// difference is not academic: every side effect below had to be sorted into
// "this civ's books" and "the human's screen". A bot advancing must not reset
// your game speed or open your ceremony modal, which is exactly what would
// have happened the first time a bot reached Bronze.
export function advanceEra(era, civ) {
  const p = civ || me();
  const looking = p === me();          // is this the seat the player is watching?
  const fromEra = p.era;
  const fromM = active(p);
  // THE SNAPSHOT IS OF THE CIVILIZATION, not the world (2026-08-26, with the
  // player split). It was a copy of S back when a civ's state WAS S; a border
  // is something one civ crosses, so what has to be frozen is that civ's
  // books -- its stores, its army, what it had learned -- and nothing about
  // the board, which does not change at a border anyway.
  const shallow = Object.assign({}, p);
  delete shallow.eraHistory;               // snapshots don't nest snapshots
  p.eraHistory[fromEra] = JSON.parse(JSON.stringify(shallow));

  p.era = era;
  const toM = active(p);
  // Pacing telemetry (console only), the bookend to the started line in build().
  console.log(`[pacing] ${toM.name} began for player ${p.id} at ${fmtTime(playtime())} (t${S.tick})`);
  // (initAdversaries still restocks against the HUMAN's era -- adversaries are
  // not players yet, so "their age" is not a thing they have. That is stage
  // five of this refactor, and the note is here because this is the line that
  // will move: a neighbour's strength should come from THEIR clock.)
  initAdversaries();
  // A border re-denominates what a tile MEANS; it never changes how many you
  // hold (owner ruling). Consolidation -- which used to run here and take
  // population at the border -- died in E5, and with it the arriving-dominion
  // bread default: nothing arrives at a border any more, since every hex was
  // claimed or captured and captures default to food on their own.
  ensureMap();
  runEraMigrations(fromM, toM, p.eraHistory[fromEra], p);
  syncDominion();

  // EVERYTHING BELOW IS THE PLAYER'S SCREEN, not the simulation. A civ the
  // human is not looking through crosses its border silently -- the Chronicle
  // will carry the news when the notification system lands, which is a
  // different thing from seizing the world and holding a modal open.
  if (!looking) return;
  purgeDom(fromM, toM);
  // A new age begins at 1x (user ruling, after a 12x border starved a run
  // before its modal was even closed): the ceremony modal already holds the
  // world; this makes sure it resumes at a watchable pace. The player can
  // spin it back up the moment they've found their feet.
  setSpeed(1);
  log(`The ${toM.name} begins.`, "big");
  openEraModal(era);
}

// Applies an era's state migrations. Implicit default: everything carries.
// State under ids that left the manifest is INERT, never deleted (the
// settled invariant) -- with one default policy on top: workers assigned to
// a job that no longer exists return to idle, since a person standing around
// is visible state the player can see and re-spend, not a ledger entry.
// Explicit instructions come from the delta's `migrations` list:
//   { bucket, id, vanish: true, narrate }              -- state zeroed
//   { bucket, id, convertTo, ratio?, narrate }         -- moved within the bucket, floor'd
//   { bucket, id, fn: (snapshot) => value, narrate }   -- computed fresh
// Formulas read the frozen snapshot, never live state. Narrate lines always
// log: an era transition is rare, and its story belongs in the Chronicle.
export function runEraMigrations(fromM, toM, snapshot, civ) {
  // (The workers-walk-home job migration died in E2 with the jobs system.)
  for (const ins of toM.migrations) {
    // Buckets are the CIV's (res, builds, units, upgrades) -- a migration
    // re-denominates what one people owns, never anything about the world.
    const bucket = (civ || me())[ins.bucket];
    if (!bucket) continue;
    const snapBucket = snapshot[ins.bucket] || {};
    if (ins.vanish) {
      if (ins.bucket === "upgrades") delete bucket[ins.id];
      else bucket[ins.id] = 0;
    } else if (ins.convertTo) {
      const gained = Math.floor((snapBucket[ins.id] || 0) * (ins.ratio != null ? ins.ratio : 1));
      bucket[ins.convertTo] = (bucket[ins.convertTo] || 0) + gained;
      bucket[ins.id] = 0;
    } else if (ins.fn) {
      bucket[ins.id] = ins.fn(snapshot);
    }
    // The Chronicle is the WATCHING seat's memory, so a civ nobody is looking
    // through re-denominates in silence. (Rival news arrives through the
    // notifications system when that lands -- "the Hill Clans have entered the
    // Bronze Age" is a different sentence from your own books changing.)
    if (ins.narrate && (civ || me()) === me()) log(ins.narrate);
  }
}

// (applyConsolidation() died in E5, and its last caller went with it on
// 2026-08-25. Borders re-denominate; they never take.)

// Remove the DOM nodes of every id that didn't survive the era hop -- cards,
// holdings tiles, person tiles, job rows, resource rows. Renderers only ever
// CREATE nodes for ids in the active manifest, so after this purge a
// retired id is fully gone: no stale card, no frozen tile.
export function purgeDom(fromM, toM) {
  const kill = (elId) => {
    const el = document.getElementById(elId);
    if (el && el.parentNode) el.parentNode.removeChild(el);
  };
  for (const cat of DEF_CATEGORIES) {
    for (const d of fromM[cat]) {
      if (toM[cat].some((x) => x.id === d.id)) continue;
      kill("bcard-" + d.id);
      kill("hold-" + d.id);
      kill("ptile-" + d.id);
      kill("job-" + d.id);
      kill("res-" + d.id);
    }
  }
}

