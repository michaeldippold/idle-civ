import { active } from "../content/compile.js";
import { caps } from "../core/derived.js";
import { S, SIM } from "../core/state.js";
import { negateChance, pick } from "./combat.js";
import { log } from "../ui/log.js";


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
        if (!SIM) log(custom || pick(ev.flavor.hit), ev.sev);
      }
      continue;
    }

    if (ev.chancePerSecond) {
      const p = 1 - Math.pow(1 - ev.chancePerSecond, dt);
      if (Math.random() < p) {
        if (Math.random() < negateChance(ev)) {
          if (!SIM) log(pick(ev.flavor.negated), "good");
        } else {
          const custom = ev.effect(S);
          if (!SIM) log(custom || pick(ev.flavor.hit), ev.sev);
        }
      }
    }
  }
}

// Buildings carrying a `converts` spec transform stockpiled resources into
// another, continuously and without workers. Throughput is clamped three ways
// so it degrades smoothly instead of erroring or destroying inputs:
//   - by how many buildings you own x their rate x dt
//   - by the inputs actually in store (runs at partial rate, idles at zero)
//   - by headroom under the OUTPUT's cap, so a full bronze store stops the
//     Forge rather than quietly eating copper and tin for nothing.
export function runConverters(dt) {
  const c = caps();
  for (const def of active().buildings) {
    if (!def.converts) continue;
    const owned = S.builds[def.id] || 0;
    if (owned <= 0) continue;

    const spec = def.converts;
    let batches = owned * spec.rate * dt;
    for (const k in spec.in)  batches = Math.min(batches, (S.res[k] || 0) / spec.in[k]);
    for (const k in spec.out) batches = Math.min(batches, ((c[k] || 0) - (S.res[k] || 0)) / spec.out[k]);
    if (!(batches > 0)) continue;

    for (const k in spec.in)  S.res[k] -= spec.in[k] * batches;
    for (const k in spec.out) S.res[k] += spec.out[k] * batches;
  }
}

