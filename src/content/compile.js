import { BRONZE_DELTA } from "./bronze.js";
import { IRON_DELTA } from "./iron.js";
import { EVENT_LIB, HINT_LIB } from "./lib.js";
import { STONE } from "./stone.js";
import { S } from "../core/state.js";

// ---------- Eras: the manifest model ------------------------
// Each era is a MANIFEST: the complete set of resources, jobs, buildings,
// upgrades, units, events and hints that exist while that era is active, plus
// a handful of era-scoped values (display name, housing per hut, panel titles,
// raid types). The engine reads ALL content through active() -- nothing below
// the compiler ever touches STONE or BRONZE_DELTA directly. If something is
// not in the active manifest, it does not exist right now: it can't fire,
// can't render, can't be built. Absence IS removal.
//
// Eras after the first are authored as DELTAS against their parent
// (remove / override / add) and compiled into full manifests at load. What a
// delta doesn't mention, it inherits unchanged -- with one deliberate
// exception: the `events` and `hints` slates are declared wholesale in every
// era, never inherited, because a forgotten event should be a loud authoring
// decision, not a silent omission. (This bit us once: events tagged for the
// wrong era simply stopped firing, with no error, ever.)
//
// Ids are permanent across eras -- saves, icons and DOM nodes key off them.
// Names, descs, costs and everything else are era-facts that live in the
// manifest, which is how a Hut becomes a Stone House without becoming a
// different thing. See tech.md for the full contract.
export const ERA_ORDER = ["stone", "bronze", "iron"];   // chronological; drives compilation and era comparisons

// ---------- Manifest compiler -------------------------------
// Compiles the authoring above into MANIFESTS at load. Every def is
// shallow-copied, so an override can never reach back and mutate the parent
// era's copy. Unknown ids in remove/override, duplicate ids in add, unknown
// slate entries, and a missing events/hints slate all THROW -- at load,
// before a single frame renders. Silent wrongness from a dangling id is this
// game's signature bug class; the compiler's job is to convert it into a
// loud one. (Phase B adds a full cross-reference validator on top.)
export const DEF_CATEGORIES = ["resources", "jobs", "buildings", "upgrades", "units"];

export function resolveSlates(m, raw) {
  if (!raw.events) throw new Error(`era "${m.name}": missing events slate (slates are never inherited)`);
  if (!raw.hints)  throw new Error(`era "${m.name}": missing hints slate (slates are never inherited)`);
  m.events = raw.events.map((id) => {
    if (!EVENT_LIB[id]) throw new Error(`era "${m.name}": unknown event "${id}" in slate`);
    return Object.assign({ id }, EVENT_LIB[id]);
  });
  m.hints = raw.hints.map((id) => {
    if (!HINT_LIB[id]) throw new Error(`era "${m.name}": unknown hint "${id}" in slate`);
    return Object.assign({ id }, HINT_LIB[id]);
  });
}

export function compileBase(raw) {
  const m = {
    name: raw.name,
    housingPerHut: raw.housingPerHut,
    panelTitles: Object.assign({}, raw.panelTitles),
    popNoun: Object.assign({}, raw.popNoun),
    arrivalLine: raw.arrivalLine,
    raidTypes: raw.raidTypes.slice(),
    migrations: [],   // a base era is never entered FROM anywhere
    consolidate: null,
    // Wholesale like the slates, never inherited: each age's world arrives
    // fresh, with fresh stocks, by construction.
    adversaries: (raw.adversaries || []).map((a) => Object.assign({}, a)),
  };
  for (const cat of DEF_CATEGORIES) m[cat] = raw[cat].map((d) => Object.assign({}, d));
  resolveSlates(m, raw);
  return m;
}

export function extendEra(parent, delta) {
  const m = {
    name: delta.name || parent.name,
    housingPerHut: delta.housingPerHut != null ? delta.housingPerHut : parent.housingPerHut,
    panelTitles: Object.assign({}, parent.panelTitles, delta.panelTitles),
    // The population noun inherits (Silicon keeps Bloc); an era that
    // re-denominates simply declares a new one.
    popNoun: delta.popNoun ? Object.assign({}, delta.popNoun) : parent.popNoun,
    arrivalLine: delta.arrivalLine || parent.arrivalLine,
    raidTypes: delta.raidTypes ? delta.raidTypes.slice() : parent.raidTypes,
    // Explicit state-migration instructions, run once when this era is
    // ENTERED (see runEraMigrations). Never inherited: a migration describes
    // one specific transition, not a standing rule.
    migrations: (delta.migrations || []).slice(),
    // Consolidation is per-border, never inherited (see applyConsolidation).
    consolidate: delta.consolidate ? Object.assign({}, delta.consolidate) : null,
    adversaries: (delta.adversaries || []).map((a) => Object.assign({}, a)),
  };
  const removes = new Set(delta.remove || []);
  const overrides = delta.override || {};
  const touched = new Set();   // remove/override targets actually found in the parent

  for (const cat of DEF_CATEGORIES) {
    const list = [];
    for (const d of parent[cat]) {
      if (removes.has(d.id)) { touched.add(d.id); continue; }
      const copy = Object.assign({}, d);
      if (overrides[d.id]) { Object.assign(copy, overrides[d.id]); touched.add(d.id); }
      list.push(copy);
    }
    for (const d of (delta.add && delta.add[cat]) || []) {
      if (list.some((x) => x.id === d.id)) throw new Error(`era "${m.name}": add duplicates id "${d.id}"`);
      list.push(Object.assign({}, d));
    }
    m[cat] = list;
  }

  for (const id of removes) if (!touched.has(id)) throw new Error(`era "${m.name}": removes unknown id "${id}"`);
  for (const id in overrides) if (!touched.has(id)) throw new Error(`era "${m.name}": overrides unknown id "${id}"`);
  resolveSlates(m, delta);
  return m;
}

export const MANIFESTS = { stone: compileBase(STONE) };
MANIFESTS.bronze = extendEra(MANIFESTS.stone, BRONZE_DELTA);
MANIFESTS.iron = extendEra(MANIFESTS.bronze, IRON_DELTA);

// Latest-era def for every buildable id that has EVER existed, so things that
// can outlive an era hop -- queue entries, log lines about them -- still
// resolve after their def leaves the active manifest. Later eras overwrite
// earlier ones, so an id reads with its most recent identity.
export const DEF_INDEX = {};
for (const era of ERA_ORDER) {
  for (const cat of ["buildings", "upgrades", "units"]) {
    for (const d of MANIFESTS[era][cat]) DEF_INDEX[d.id] = d;
  }
}

// THE indirection: every engine and render read of content goes through here.
// The stone fallback is defensive only (a hand-edited save with a bogus era).
export function active() { return MANIFESTS[S.era] || MANIFESTS.stone; }

// Which building boosts which resource's yield (see mults()). Global and
// keyed by id -- era-neutral identity data, like icons. If a later era ever
// remaps a boost, this graduates into the manifests.
export const BOOST_BUILDING = { food: "dryingRack", wood: "lumberCamp", stone: "stonePit" };

// ---------- Manifest validator ------------------------------
// The cross-reference pass, run at load against every compiled manifest: any
// id one piece of content uses to point at another must resolve WITHIN that
// same era. This is what makes removal safe to author -- retire a resource
// and every cost, recipe, storage building and job that still mentions it
// turns into a load-time error instead of NaN production, a converter that
// silently never runs, or a cap that quietly stops applying.
//
// Honest limit: reveal() predicates are arbitrary code and can't be
// statically validated. A stale reference there yields a hint or card that
// never appears -- annoying, but it cannot break the economy.
export function validateManifests(manifests) {
  const problems = [];
  for (const era in manifests) {
    const m = manifests[era];
    const resIds = new Set(m.resources.map((r) => r.id));
    const buildIds = new Set(m.buildings.map((b) => b.id));
    const raidIds = new Set(m.raidTypes.map((r) => r.id));
    const bad = (msg) => problems.push(`[${era}] ${msg}`);

    for (const cat of ["buildings", "upgrades", "units"]) {
      for (const d of m[cat]) {
        if (!d.id || !d.name || !d.kind) bad(`${cat} entry ${d.id || "?"} missing id/name/kind`);
        if (typeof d.reveal !== "function") bad(`${d.id} has no reveal()`);
        for (const k in d.base || {}) {
          if (!resIds.has(k)) bad(`${d.id} costs "${k}", not a resource this era`);
        }
        if (d.converts) {
          for (const k in d.converts.in)  if (!resIds.has(k)) bad(`${d.id} converts from "${k}", not a resource this era`);
          for (const k in d.converts.out) if (!resIds.has(k)) bad(`${d.id} converts to "${k}", not a resource this era`);
        }
      }
    }
    for (const r of m.resources) {
      if (r.capBuilding != null && !buildIds.has(r.capBuilding)) {
        bad(`resource ${r.id} capBuilding "${r.capBuilding}" is not a building this era`);
      }
      const boost = BOOST_BUILDING[r.id];
      if (boost && !buildIds.has(boost)) bad(`resource ${r.id} boost building "${boost}" is not a building this era`);
    }
    for (const j of m.jobs) {
      if (!resIds.has(j.res)) bad(`job ${j.id} gathers "${j.res}", not a resource this era`);
    }
    for (const u of m.units) {
      if (u.counters && !raidIds.has(u.counters)) bad(`unit ${u.id} counters "${u.counters}", not a raid type this era`);
    }
    for (const ev of m.events) {
      if (ev.counter && !buildIds.has(ev.counter.building)) {
        bad(`event ${ev.id} countered by "${ev.counter.building}", not a building this era`);
      }
    }
    for (const ins of m.migrations) {
      if (!ins.bucket || !(ins.bucket in { res: 1, jobs: 1, builds: 1, units: 1, upgrades: 1 })) {
        bad(`migration targets unknown bucket "${ins.bucket}"`);
      }
      if (!ins.vanish && !ins.convertTo && !ins.fn) bad(`migration for ${ins.id} has no primitive (vanish/convertTo/fn)`);
    }
    if (!m.popNoun || typeof m.popNoun.singular !== "string" || typeof m.popNoun.plural !== "string") {
      bad(`missing or malformed popNoun`);
    }
    if (!m.arrivalLine) bad(`missing arrivalLine`);
    if (m.consolidate && !(m.consolidate.keep > 0 && m.consolidate.keep <= 1)) {
      bad(`consolidate.keep must be in (0, 1]`);
    }
    for (const a of m.adversaries) {
      if (!a.id || !a.name || !a.disposition || !(a.strength > 0)) bad(`adversary ${a.id || "?"} missing id/name/disposition/strength`);
      if (a.walls != null && !(a.walls >= 0)) bad(`adversary ${a.id} has malformed walls`);
      if (a.fightsAs && !raidIds.has(a.fightsAs)) bad(`adversary ${a.id} fights as "${a.fightsAs}", not a raid type this era`);
      if (!(a.campaignTime > 0)) bad(`adversary ${a.id} has no campaignTime`);
      for (const k in a.stock || {}) if (!resIds.has(k)) bad(`adversary ${a.id} stocks "${k}", not a resource this era`);
      if (a.buys) {
        if (a.disposition !== "peaceful") bad(`adversary ${a.id} trades but is not peaceful`);
        if (!resIds.has(a.buys.res)) bad(`adversary ${a.id} buys "${a.buys.res}", not a resource this era`);
        if (!(a.buys.amount > 0) || !(a.buys.pays > 0)) bad(`adversary ${a.id} has a malformed exchange`);
        if (!(a.caravanTime > 0)) bad(`adversary ${a.id} trades but has no caravanTime`);
      }
    }
  }
  if (problems.length) throw new Error("Manifest validation failed:\n  " + problems.join("\n  "));
}
validateManifests(MANIFESTS);

// What one era-step changes among the buildable categories, computed from the
// compiled manifests so it can never go stale. Feeds the era modal AND the
// DOM purge -- one diff, two consumers.
export function manifestDiff(fromM, toM) {
  const diff = { added: [], removed: [], renamed: [] };
  for (const cat of ["buildings", "units", "upgrades"]) {
    for (const d of toM[cat]) {
      const prev = fromM && fromM[cat].find((p) => p.id === d.id);
      if (!prev) diff.added.push(d);
      else if (prev.name !== d.name) diff.renamed.push({ from: prev, to: d });
    }
    if (fromM) {
      for (const d of fromM[cat]) {
        if (!toM[cat].some((p) => p.id === d.id)) diff.removed.push(d);
      }
    }
  }
  return diff;
}

