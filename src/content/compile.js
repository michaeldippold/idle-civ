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
// "jobs" left this list in E2: the category has no defs anywhere any more.
export const DEF_CATEGORIES = ["resources", "buildings", "upgrades", "units"];

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

// The map spec is an era-fact with structure, so it gets a real copy.
function copyMapSpec(m) {
  return {
    radius: m.radius,
    tileNoun: Object.assign({}, m.tileNoun),
    terrains: m.terrains.slice(),
    seats: (m.seats || []).slice(),
    works: m.works ? JSON.parse(JSON.stringify(m.works)) : null,
    popCaps: m.popCaps ? Object.assign({}, m.popCaps) : null,
    claim: m.claim ? JSON.parse(JSON.stringify(m.claim)) : null,
    minors: m.minors ? JSON.parse(JSON.stringify(m.minors)) : null,
  };
}

export function compileBase(raw) {
  const m = {
    name: raw.name,
    panelTitles: Object.assign({}, raw.panelTitles),
    popNoun: Object.assign({}, raw.popNoun),
    arrivalLine: raw.arrivalLine,
    // Growth-model era-facts (phase 6b). All three inherit, like popNoun:
    // an era that says nothing keeps its parent's model.
    // `allocation` retired 2026-08-23 (engine rework E2): every era allocates
    // hexes. `outputMult` retired with it -- it existed to compensate
    // tile-count-as-population, and population is real now.

    raidTypes: raw.raidTypes.slice(),
    migrations: [],   // a base era is never entered FROM anywhere
    consolidate: null,
    // Wholesale like the slates, never inherited: each age's world arrives
    // fresh, with fresh stocks, by construction.
    adversaries: (raw.adversaries || []).map((a) => Object.assign({}, a)),
    // The map spec INHERITS, like popNoun -- deliberately, because the map
    // regenerates only when the tile noun changes (design.md, Scale: The
    // Tile Ladder). An era that keeps the noun keeps the world; an era that
    // redeclares the spec recuts it. No spec (Stone) means no map.
    map: raw.map ? copyMapSpec(raw.map) : null,
  };
  for (const cat of DEF_CATEGORIES) m[cat] = (raw[cat] || []).map((d) => Object.assign({}, d));
  resolveSlates(m, raw);
  return m;
}

export function extendEra(parent, delta) {
  const m = {
    name: delta.name || parent.name,
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
    map: delta.map ? copyMapSpec(delta.map) : parent.map,
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

    // Every era allocates hexes (E2), so every mapped era must say what its
    // terrains can be turned to.
    if (m.map && !m.map.works) bad("a mapped era needs map.works (what each terrain can be turned to)");


    if (m.map) {
      if (!(m.map.radius >= 2)) bad(`map radius ${m.map.radius} is too small to mean anything`);
      // `view` (the era render radius) was retired 2026-08-22 with one board,
      // forever. A manifest still carrying one is a leftover, and a silently
      // ignored era-fact is exactly the kind of wrongness this validator exists
      // to refuse.
      if (m.map.view != null) {
        bad("map.view is retired -- one board, forever; fog decides what is seen");
      }
      if (!m.map.tileNoun || !m.map.tileNoun.singular || !m.map.tileNoun.plural) bad("map tileNoun needs singular and plural");
      if (!Array.isArray(m.map.terrains) || !m.map.terrains.length) bad("map declares no terrains");
      // Engine rework E1: a mapped era must say how many people its ground
      // holds. Water is exempt (no one lives on open water; absent = 0).
      if (!m.map.popCaps) bad("map declares no popCaps -- terrain must say how many people it holds");
      // E3: growth is claiming, so a mapped era must price the claim verb.
      if (!m.map.claim || !m.map.claim.cost || !(m.map.claim.time > 0)) {
        bad("map declares no claim spec -- expansion is the growth verb and must be priced");
      }
      else for (const t of m.map.terrains) {
        if (t === "water") continue;
        if (!(m.map.popCaps[t] > 0)) bad(`popCaps missing or non-positive for terrain "${t}"`);
      }
      const advIds = new Set(m.adversaries.map((a) => a.id));
      for (const seat of m.map.seats) {
        if (!advIds.has(seat)) bad(`map seats unknown adversary "${seat}"`);
      }
      if (m.map.minors) {
        const mn = m.map.minors;
        if (!(mn.count >= 1)) bad("map.minors.count must be at least 1");
        if (!Array.isArray(mn.names) || mn.names.length < mn.count) {
          bad("map.minors needs a name pool at least as large as its count");
        }
        for (const r in mn.stock || {}) if (!resIds.has(r)) bad(`minors stock "${r}", not a resource this era`);
      }
      for (const t in m.map.works || {}) {
        if (!m.map.terrains.includes(t)) bad(`map.works keys unknown terrain "${t}"`);
        for (const r in m.map.works[t]) {
          if (!resIds.has(r)) bad(`terrain "${t}" works "${r}", not a resource this era`);
          if (!(m.map.works[t][r] > 0)) bad(`terrain "${t}" works "${r}" at a non-positive rate`);
        }
      }
    }

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
    // The jobs validator died in E2 with the jobs category. Its successor:
    // every works-table entry must name a resource that exists this era.
    if (m.map && m.map.works) {
      for (const t in m.map.works) for (const res in m.map.works[t]) {
        if (!resIds.has(res)) bad(`works: ${t} can be turned to "${res}", not a resource this era`);
      }
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

