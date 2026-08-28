import { S, playerById } from "./state.js";
import { defById } from "./derived.js";
import { build, cancelBuild, demolishStructure, launchSettle, launchStructure, trade } from "./actions.js";
import { disbandArmy, formArmy, haltArmy, setStance } from "../sim/armies.js";
import { orderMove, orderSack } from "../sim/contact.js";
import { launchCampaign, launchCaravan } from "../sim/expeditions.js";
import { step } from "./step.js";

// ---------- REPLAY (S3, the antagonist spec) --------------------------------
// The journal's own header promised three things: a bug report is a seed plus
// a journal, a bot is indistinguishable at the verb seam, and lockstep
// multiplayer is this journal, exchanged. This file is where the first
// promise stops being a comment: (seed + tick count + journal) really does
// fully determine the state, and the harness proves it bit-for-bit.
//
// WHAT THE TAPE HOLDS is human seats' verbs only (see the journaling note in
// sim/armies.js): everything a KEYED civ does is drawn from the seed and the
// tick by the sim itself, so a replay re-runs those decisions rather than
// re-issuing them -- recording them too would double every bot order on
// playback. A remote human's socket, when it exists, delivers entries shaped
// exactly like these.

// Issue one journaled verb again, exactly as its actor issued it. The switch
// is the single place a verb's journal shape is bound to its call shape --
// add a verb, add a row, and the harness's round-trip check keeps both honest.
export function issueEntry(e) {
  const p = playerById(e.pid);
  if (!p) return;
  switch (e.verb) {
    case "build":       return build(defById(e.args.id, p), p);
    case "cancelBuild": return cancelBuild(e.args.uid, p);
    case "settle":      return launchSettle(e.args.tile, p);
    case "structure":   return launchStructure(e.args.tile, e.args.id, p);
    case "trade":       return trade(e.args.give, e.args.get, e.args.batches, p);
    case "demolish":    return demolishStructure(e.args.tile, p);
    case "formArmy":    return formArmy(e.args.hex, e.args.counts, e.args.stance, p);
    case "disbandArmy": return disbandArmy(e.args.uid, p);
    case "setStance":   return setStance(e.args.uid, e.args.stance, p);
    case "haltArmy":    return haltArmy(e.args.uid, p);
    case "march":       return orderMove(e.args.uid, e.args.to, p);
    case "orderSack":   return orderSack(e.args.uid, e.args.to, p);
    // The two expedition verbs journal without a pid today (human-only
    // surface); they replay against the viewer exactly as they ran.
    case "campaign":    return launchCampaign(e.args.target, e.args.units);
    case "caravan":     return launchCaravan(e.args.target, e.args.escort);
    default: return;   // an unknown verb is a tape from a newer build: skip, never throw
  }
}

// Drive a freshly-booted world (same seed, same setup) through the tape:
// step to each entry's tick, issue it, then step out to the target tick.
// The caller owns the boot -- a replay cannot know what the original session
// granted or picked before its first tick.
export function replayTo(entries, finalTick) {
  for (const e of entries) {
    while (S.tick < e.tick) step();
    issueEntry(e);
  }
  while (S.tick < finalTick) step();
}
