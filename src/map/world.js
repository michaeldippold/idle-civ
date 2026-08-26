import { CONTINENTS } from "./continents.js";

// ---------- The world: runtime geometry -------------------------
// THE BASE OF THE MAP PACKAGE, and deliberately tiny. `world` is regenerated
// from the seed at every load and era entry and is never saved -- a world is a
// number plus a continent name (map.md 2). It lives alone in this module so
// that fog, population, routes and structures can all read it without any of
// them importing each other: one shared leaf instead of a cycle.
export let world = null;
export function setWorld(w) { world = w; }

// The continent the player PICKED on the start screen, or null for Random.
// Set once during boot, before ensureMap() runs, from the choice the start
// screen stashed across its reload. Null is not a failure: it means "Random",
// and Random is simply the absence of a pick -- the continent then comes from
// the run seed, which is what makes a bare seed number reproduce a random run.
let picked = null;
export function setPickedContinent(id) {
  picked = id && CONTINENTS.some((c) => c.id === id) ? id : null;
}
export function pickedContinent() { return picked; }
