import { active } from "../content/compile.js";
import { rng } from "../core/rng.js";
import { CONFIG } from "../core/config.js";
import { caps } from "../core/derived.js";
import { S, me } from "../core/state.js";
import { builtCount } from "../map/map.js";
import { pick } from "./combat.js";
import { chronicle } from "../core/bus.js";


export function resolveEvents(dt) {
  // The active manifest's slate IS the eligibility list -- an event absent
  // from it doesn't exist right now. No per-event era tags to keep in sync.
  for (const ev of active().events) {
    if (ev.condition && !ev.condition(S)) continue;

    if (ev.resolve) { ev.resolve(S, dt); continue; }

    if (ev.canFire) {
      let guard = 0;
      while (ev.canFire(S) && guard++ < 50) {
        // An effect may return its own line, for events whose message needs a
        // number only the effect knows (e.g. what a settler actually cost).
        const custom = ev.effect(S);
        chronicle(custom || pick(ev.flavor.hit), ev.sev);
      }
      continue;
    }

    if (ev.chancePerSecond) {
      // A HAZARD THAT DOES NOT GROW WITH YOU IS ONE YOU OUTGROW. Conflict has
      // always scaled with population; `popScaled` gives any event the same
      // treatment, and sickness is the first to need it -- at a flat rate it
      // became a rounding error against a large settlement.
      const scale = ev.popScaled ? (1 + me().pop * CONFIG.sicknessPopScale) : 1;
      const p = 1 - Math.pow(1 - ev.chancePerSecond * scale, dt);
      if (rng() < p) {
        // No negation branch here any more: the only counterable event was
        // sickness, and it owns its own resolve() so it can ask whether
        // healers cover the hex it actually struck.
        const custom = ev.effect(S);
        chronicle(custom || pick(ev.flavor.hit), ev.sev);
      }
    }
  }
}

// STRUCTURES carrying a `converts` spec transform stockpiled resources into
// another, continuously and without workers. Throughput is clamped three ways
// so it degrades smoothly instead of erroring or destroying inputs:
//   - by how many stand on the board x their rate x dt
//   - by the inputs actually in store (runs at partial rate, idles at zero)
//   - by headroom under the OUTPUT's cap, so a full bronze store stops the
//     Forge rather than quietly eating copper and tin for nothing.
//
// Counted off the BOARD since 2026-08-25, when the Forge moved onto a hex. The
// count cannot drift from what is standing, and -- the reason the owner wanted
// the move -- a forge can now be pulled down. An age that changes the recipe
// used to leave you with six of them converting ore faster than you could
// spend it, with no way out.
export function runConverters(dt) {
  const c = caps();
  for (const def of (active().structures || [])) {
    if (!def.converts) continue;
    const owned = builtCount(def.id);
    if (owned <= 0) continue;

    const spec = def.converts;
    let batches = owned * spec.rate * dt;
    for (const k in spec.in)  batches = Math.min(batches, (me().res[k] || 0) / spec.in[k]);
    for (const k in spec.out) batches = Math.min(batches, ((c[k] || 0) - (me().res[k] || 0)) / spec.out[k]);
    if (!(batches > 0)) continue;

    for (const k in spec.in)  me().res[k] -= spec.in[k] * batches;
    for (const k in spec.out) me().res[k] += spec.out[k] * batches;
  }
}

