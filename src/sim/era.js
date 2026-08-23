import { DEF_CATEGORIES, active } from "../content/compile.js";
import { civilians, deployedCount, housing, playtime, totalUnits } from "../core/derived.js";
import { defaultAssignments, ensureMap, syncDominion } from "../map/map.js";
import { initAdversaries } from "../core/persist.js";
import { S } from "../core/state.js";
import { reconcileWorkforce } from "./combat.js";
import { fmtTime, setSpeed } from "../ui/chrome.js";
import { log } from "../ui/log.js";
import { openEraModal } from "../ui/modal.js";

export function advanceEra(era) {
  const fromEra = S.era;
  const fromM = active();
  const before = { housing: housing() };
  const shallow = Object.assign({}, S);
  delete shallow.eraHistory;               // snapshots don't nest snapshots
  S.eraHistory[fromEra] = JSON.parse(JSON.stringify(shallow));

  S.era = era;
  const toM = active();
  // Pacing telemetry (console only), the bookend to the started line in build().
  console.log(`[pacing] ${toM.name} began at ${fmtTime(playtime())} (t${S.tick})`);
  initAdversaries();
  // Consolidation runs BEFORE the map is touched, and the order is
  // load-bearing now that dominion never shrinks (owner ruling: a border may
  // change what a tile means, never how many you hold). ensureMap() syncs the
  // dominion to whatever pop currently is, so consolidating afterwards would
  // grant a block sized from the OLD population and then be unable to give it
  // back. Population is decided first; the ground is matched to it second.
  if (toM.consolidate) applyConsolidation(toM.consolidate);
  ensureMap();
  runEraMigrations(fromM, toM, S.eraHistory[fromEra]);
  syncDominion();   // the carried dominion block: owned tiles match the consolidated count
  if (fromM.allocation !== "tiles" && toM.allocation === "tiles") {
    defaultAssignments();
    log("Your holdfasts see to their own bread first — every holding turns to food. Direct them as you see fit.");
  }
  purgeDom(fromM, toM);
  reconcileWorkforce();

  // A new age begins at 1x (user ruling, after a 12x border starved a run
  // before its modal was even closed): the ceremony modal already holds the
  // world; this makes sure it resumes at a watchable pace. The player can
  // spin it back up the moment they've found their feet.
  setSpeed(1);
  log(`The ${toM.name} begins.`, "big");
  openEraModal(era, before);
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
export function runEraMigrations(fromM, toM, snapshot) {
  for (const j of fromM.jobs) {
    if (!toM.jobs.some((x) => x.id === j.id) && (S.jobs[j.id] || 0) > 0) {
      const n = S.jobs[j.id];
      S.jobs[j.id] = 0;
      log(`${n} of your people set down tools the new age has no use for.`);
    }
  }
  for (const ins of toM.migrations) {
    const bucket = S[ins.bucket];
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
    if (ins.narrate) log(ins.narrate);
  }
}

// The re-denomination consolidation (see design.md, Unit Re-denomination):
// entering an era whose units mean more, your people gather into fewer of
// them. Civilians and each unit type floor independently against the keep
// ratio (units never below what's currently deployed -- a column abroad
// can't be consolidated out from under its own expedition), pop is rebuilt
// as their sum so the books can't desync, and job assignments floor along
// with them; advanceEra's reconcileWorkforce() sweeps up any remainder.
export function applyConsolidation(spec) {
  const civBefore = civilians();
  if (active().levy) {
    // A levy border: the fighting bands carry WHOLE -- they are no longer
    // part of the population, so the keep ratio has nothing to say about
    // them. If they overflow the new, smaller levy cap, training simply
    // refuses until the dominion grows into them; existing state is never
    // destroyed by a cap (the standing invariant).
    //
    // Crossing FROM a timer era, the incoming pop still counts its units
    // (the old containment model) -- the border itself does the separation,
    // exactly once. levyMigrated marks it done, so a future levy->levy
    // border consolidates an already-separated population untouched.
    const civ = S.seen.levyMigrated ? S.pop : Math.max(1, S.pop - totalUnits());
    // **A tile-era border never takes land** (owner ruling, 2026-08-22). Once
    // population IS tiles, consolidating would mean deleting hexes the player
    // conquered -- the invisible-sink mistake this project wrote a rule
    // against, and the exact objection that once ruled out a persistent map.
    // On a fixed board it simply is not needed: the board is already the cap
    // that keeps numbers small, so a later border re-denominates what a tile
    // is (holdfast -> city -> nation) and raises per-tile output instead.
    // The FIRST levy border still consolidates, because it is the moment
    // population stops being people and becomes places.
    const alreadyTiles = S.seen.levyMigrated && active().allocation === "tiles";
    S.pop = alreadyTiles ? S.pop : Math.max(1, Math.floor(civ * spec.keep));
    S.seen.levyMigrated = true;   // also gates the load-time back-compat
  } else {
    let unitTotal = 0;
    for (const id in S.units) {
      S.units[id] = Math.max(deployedCount(id), Math.floor((S.units[id] || 0) * spec.keep));
      unitTotal += S.units[id];
    }
    S.pop = Math.max(1, Math.floor(civBefore * spec.keep)) + unitTotal;
  }
  for (const j in S.jobs) S.jobs[j] = Math.floor((S.jobs[j] || 0) * spec.keep);
  if (spec.narrate) log(spec.narrate);
}

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

