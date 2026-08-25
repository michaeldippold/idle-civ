import { DEF_CATEGORIES, active } from "../content/compile.js";
import { playtime } from "../core/derived.js";
import { ensureMap, syncDominion } from "../map/map.js";
import { initAdversaries } from "../core/persist.js";
import { S } from "../core/state.js";

import { fmtTime, setSpeed } from "../ui/chrome.js";
import { log } from "../ui/log.js";
import { openEraModal } from "../ui/modal.js";

export function advanceEra(era) {
  const fromEra = S.era;
  const fromM = active();
  const shallow = Object.assign({}, S);
  delete shallow.eraHistory;               // snapshots don't nest snapshots
  S.eraHistory[fromEra] = JSON.parse(JSON.stringify(shallow));

  S.era = era;
  const toM = active();
  // Pacing telemetry (console only), the bookend to the started line in build().
  console.log(`[pacing] ${toM.name} began at ${fmtTime(playtime())} (t${S.tick})`);
  initAdversaries();
  // A border re-denominates what a tile MEANS; it never changes how many you
  // hold (owner ruling). Consolidation -- which used to run here and take
  // population at the border -- died in E5, and with it the arriving-dominion
  // bread default: nothing arrives at a border any more, since every hex was
  // claimed or captured and captures default to food on their own.
  ensureMap();
  runEraMigrations(fromM, toM, S.eraHistory[fromEra]);
  syncDominion();
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

