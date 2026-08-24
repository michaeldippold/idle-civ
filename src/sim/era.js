import { DEF_CATEGORIES, active } from "../content/compile.js";
import { civilians, deployedCount, playtime, totalUnits } from "../core/derived.js";
import { defaultAssignments, ensureMap, syncDominion } from "../map/map.js";
import { initAdversaries } from "../core/persist.js";
import { S } from "../core/state.js";

import { fmtTime, setSpeed } from "../ui/chrome.js";
import { log } from "../ui/log.js";
import { openEraModal } from "../ui/modal.js";

export function advanceEra(era) {
  const fromEra = S.era;
  const fromM = active();
  const before = {};   // housing died in E3; the era modal reads other changes
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
  // The one-time allocation default: the FIRST levy border turns the arriving
  // dominion to bread (allocation itself is universal since E2, so the old
  // jobs->tiles trigger is now "the first border where the levy begins").
  // (The border bread-default died in E5 with the levy: nothing arrives at a
  // border any more -- every hex was claimed or captured, and captures default
  // to food on their own.)
  purgeDom(fromM, toM);

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
  // (The workers-walk-home job migration died in E2 with the jobs system.)
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
// applyConsolidation() died in E5 (dead code since E2, when consolidation
// left every manifest): borders re-denominate, they never take.

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

