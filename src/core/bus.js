import { S, me } from "./state.js";

// ---------- The event bus -----------------------------------
// THE SIMULATION DOES NOT KNOW THE INTERFACE EXISTS (2026-08-26, review Part
// II.3). Before this, `core/`, `sim/`, `map/` and even `content/` imported
// `ui/` directly -- step.js reached into the DOM to end a run, era.js opened a
// modal and reset the player's game speed, and every corner of the sim wrote
// straight into the Chronicle.
//
// That inverted edge cost three things. The harness had to stub `document`,
// `localStorage` and `window` merely to IMPORT the simulation. A bot doing
// anything at all would have seized the human's screen -- the first rival to
// reach Bronze would have reset your clock and held your ceremony modal open.
// And every line the sim wrote had no answer to the question the player split
// made unavoidable: WHOSE Chronicle is this?
//
// So the sim emits and the interface listens. Nothing here touches the DOM;
// `ui/wire.js` is the only module that connects the two, and a headless run
// simply has no subscribers, which is exactly the right behaviour rather than
// a special case.
const handlers = new Map();

export function on(type, fn) {
  if (!handlers.has(type)) handlers.set(type, []);
  handlers.get(type).push(fn);
  return () => off(type, fn);
}

export function off(type, fn) {
  const list = handlers.get(type);
  if (!list) return;
  const i = list.indexOf(fn);
  if (i >= 0) list.splice(i, 1);
}

export function emit(type, payload) {
  const list = handlers.get(type);
  if (!list || !list.length) return;
  // Copied before iterating: a handler that unsubscribes itself mid-emit is a
  // reasonable thing to write, and it should not skip the next listener.
  for (const fn of list.slice()) fn(payload);
}

// For tests and teardown. Named rather than exposed as the raw map, so nothing
// grows a habit of reaching into the registry.
export function clearBus() { handlers.clear(); }
export function listenerCount(type) { return (handlers.get(type) || []).length; }

// ---------- The events the simulation speaks ----------------

// A LINE FOR THE CHRONICLE, and it says whose. `pid` defaults to the civ the
// interface is looking through, so every existing call keeps its meaning; a
// bot passes its own id and the interface quietly drops it, because your
// memory is not where a rival's business gets written down. (When rival news
// SHOULD reach you it arrives as a different sentence -- "the Hill Clans have
// entered the Bronze Age" -- which is the notifications system, not this.)
export function chronicle(text, cls, pid) {
  emit("chronicle", { text, cls, pid: pid == null ? S.me : pid });
}

// The board or the panels need redrawing. Deliberately payload-free: the
// renderer already knows how to decide what actually changed.
export function requestRender() { emit("render"); }

// One civ crossed into a new age. The interface decides whether that is a
// ceremony (it is your own) or a notification (it is not).
export function eraAdvanced(era, pid) {
  emit("eraAdvanced", { era, pid: pid == null ? S.me : pid });
}

// The run is over for the seat being played.
export function runEnded(cause) { emit("runEnded", { cause }); }

// The simulation asks for a clock speed -- today only when an age begins, so
// a border does not resume at 12x into a starving realm.
export function requestSpeed(value) { emit("speed", { value }); }
