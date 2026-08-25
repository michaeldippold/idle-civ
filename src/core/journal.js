// The action journal.
//
// Every player verb -- build, cancel, settle, structure, demolish, allocate,
// campaign, caravan -- records itself here with the tick it happened on. The
// point is NOT the log; it is the discipline the log enforces. `rng.js` and
// `step.js` already claim that (seed + tick count + actions) fully determine
// the state, and that claim was true but unfalsifiable: actions ran on click
// and left no trace, so nothing could replay them.
//
// With the journal, three things become cheap that were expensive:
//   - a bug report is a seed plus a journal, replayable exactly;
//   - a bot player is a thing that CALLS VERBS, indistinguishable at this
//     seam from a human clicking;
//   - lockstep multiplayer is this journal, exchanged. Every peer replays
//     the same verbs on the same ticks and lands on the same state.
//
// Deliberately NOT in the save. Saves are snapshots and stay small; a journal
// is a tape, and the two have different lifetimes. Nothing consumes this yet
// -- it exists so the seam cannot rot while the systems that need it are
// still being built.

const CAP = 4000;             // a long sitting, then the head falls off
let entries = [];
let dropped = 0;

// Who acted. There is one player today, so everything is seat 0 -- but the
// field exists from the first entry, because a journal that has to grow a
// player column later is a journal nobody can replay across the change.
export function record(verb, args, tick, pid) {
  entries.push({ tick: tick | 0, pid: pid == null ? 0 : pid, verb, args });
  if (entries.length > CAP) { entries.shift(); dropped += 1; }
}

export function journal() { return entries.slice(); }

export function journalStats() {
  return { held: entries.length, dropped, cap: CAP };
}

export function clearJournal() { entries = []; dropped = 0; }
