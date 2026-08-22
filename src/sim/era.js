import { DEF_CATEGORIES, active } from "../content/compile.js";
import { civilians, deployedCount, housing } from "../core/derived.js";
import { initAdversaries } from "../core/persist.js";
import { S, SIM } from "../core/state.js";
import { reconcileWorkforce } from "./combat.js";
import { fmtTime } from "../ui/chrome.js";
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
  console.log(`[pacing] ${toM.name} began at ${fmtTime(S.playtime)}`);
  initAdversaries();
  runEraMigrations(fromM, toM, S.eraHistory[fromEra]);
  if (toM.consolidate) applyConsolidation(toM.consolidate);
  purgeDom(fromM, toM);
  reconcileWorkforce();

  // Silent during offline catch-up -- simulateOffline() announces it instead,
  // rather than firing a modal at someone the instant the page loads.
  if (SIM) return;
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
// Formulas read the frozen snapshot, never live state. Narrate lines log
// even under SIM: an era transition is rare enough that its story belongs in
// the Chronicle even when it happened while you were away.
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
  let unitTotal = 0;
  for (const id in S.units) {
    S.units[id] = Math.max(deployedCount(id), Math.floor((S.units[id] || 0) * spec.keep));
    unitTotal += S.units[id];
  }
  S.pop = Math.max(1, Math.floor(civBefore * spec.keep)) + unitTotal;
  for (const j in S.jobs) S.jobs[j] = Math.floor((S.jobs[j] || 0) * spec.keep);
  if (spec.narrate) log(spec.narrate);
}

// Remove the DOM nodes of every id that didn't survive the era hop -- cards,
// holdings tiles, person tiles, job rows, resource rows. Renderers only ever
// CREATE nodes for ids in the active manifest, so after this purge a
// retired id is fully gone: no stale card, no frozen tile. Runs under SIM
// too -- the page's DOM exists during offline catch-up and would otherwise
// keep the stale nodes.
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

