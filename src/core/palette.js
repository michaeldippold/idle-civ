import { S } from "./state.js";

// ---------- The board's colour law (owner ruling, 2026-08-25) ------------
// This is a DIGITAL TABLETOP, so colour works the way it works on a board:
// one colour is YOU, one is everybody else, and a small reserved set is the
// board shouting at you. Getting those three jobs mixed up is how a board
// stops being readable at a glance, so each one is written down here.
//
//   YOURS      -- the player's chosen colour. Owned hex rims, your seat's
//                 house, and the hover/selection rings, which are derived from
//                 it rather than being a colour of their own.
//   THEIRS     -- WHITE, for every power and steading on the board.
//   RESERVED   -- RED, ORANGE and YELLOW. Status only. Nothing that means
//                 "who" may ever use them.
//
// WHY POWERS ARE NO LONGER RED (the deciding argument, owner's): most of them
// are not enemies. `riverKingdom` and `saltNomads` ship `disposition:
// "peaceful"`, and standing, caravans and the envoy are all real -- painting
// every neighbour red pre-judged the whole diplomatic half of the game before
// the player had met anybody. White is the board-game convention for the
// pieces that are not yours, and it says "someone else lives here" without
// saying "and they hate you". Red now means what red should mean.
//
// WHY HOVER AND SELECTION ARE DERIVED: they used to be gold (#ffd76a) and pale
// gold (#ffe9a8), which quietly spent YELLOW -- on the single most frequent
// thing on screen, since hover fires whenever the cursor moves. Deriving them
// from the player's colour frees yellow for status, and it is also more
// honest: a hover ring is your attention on the board, so it belongs in your
// colour rather than in one of its own.
//
// One correction to the original sketch, made because the board is bright:
// hover is the LIGHT one and owned is the QUIET one, not the other way round.
// A darker ring reads as recessive, and "the tile under my cursor" should come
// forward. It also survives the pale colours, which have no room to go
// brighter but plenty to go quieter.

// Authored, not computed. Seven hand-tuned triples beat an HSL transform that
// has to be right for both #1b1f27 and #ff8cc0 -- the same reason the
// continents are authored ASCII rather than noise. `glyph` is the house mark
// and needs to survive a bright hilltop; `halo` flips the text shadow for the
// one colour that is darker than everything it sits on.
export const PLAYER_COLORS = [
  { id: "green",  name: "Green",  ring: "#6fbf47", focus: "#a6ec72", glyph: "#b6f27f" },
  { id: "teal",   name: "Teal",   ring: "#2fae9e", focus: "#5fe6d2", glyph: "#74efd9" },
  { id: "blue",   name: "Blue",   ring: "#4f7fe0", focus: "#7fa9ff", glyph: "#93b8ff" },
  { id: "purple", name: "Purple", ring: "#8a5fd0", focus: "#b48cf5", glyph: "#c3a3ff" },
  { id: "pink",   name: "Pink",   ring: "#e05f9e", focus: "#ff8cc0", glyph: "#ff9ecb" },
  { id: "brown",  name: "Brown",  ring: "#a06a3c", focus: "#d69a63", glyph: "#e0a973" },
  // The one colour darker than the board it sits on. The rim is fine -- it
  // lies on a lit hex top, never against the void -- but the house mark needs
  // its shadow inverted or it disappears into its own outline.
  { id: "black",  name: "Black",  ring: "#1b1f27", focus: "#5a6474", glyph: "#23272f", halo: "light" },
];

export const DEFAULT_COLOR = "green";

// THEIRS. A power and a steading are the same kind of thing at different
// sizes, exactly as they were when both were red -- the size grading in
// styles.css carries that, not the hue.
export const FOREIGN = "#ffffff";
export const FOREIGN_MINOR = "#dfe4ec";

// RESERVED, and deliberately declared even though nothing uses them yet. No
// per-hex status visual exists in the game today (famine, sickness, raids and
// ghost hexes are all Chronicle-only), so this is a RESERVATION rather than a
// system: it exists so the player palette above can never quietly grow into
// the colours a warning will need. Severity is meant to be carried by ring
// PATTERN -- solid versus dashed -- rather than by spending more hues, because
// pattern is independent of hue and so stays legible whatever colour the
// player picked.
export const STATUS = {
  critical: "#e8402c",   // red    -- the run is in danger here
  urgent:   "#f08a1e",   // orange -- important, not yet critical
  notice:   "#f2cf3f",   // yellow -- look here, nothing is burning
};

export function colorById(id) {
  return PLAYER_COLORS.find((c) => c.id === id) || PLAYER_COLORS.find((c) => c.id === DEFAULT_COLOR);
}

// The run's colour. Reads through a lookup rather than trusting the save: a
// hand-edited or future-dated `playerColor` falls back to green instead of
// painting the board with `undefined`.
export function playerColor() {
  return colorById(S && S.playerColor);
}

// Push the run's colour into CSS custom properties, so every glyph rule can
// say `var(--player-glyph)` instead of the stylesheet needing one block per
// colour. Called once at boot -- the colour is chosen on the start screen and
// fixed for the run (owner ruling), so nothing re-applies it mid-run.
export function applyPlayerColor() {
  const c = playerColor();
  const root = document.documentElement;
  if (!root || !root.style) return;
  root.style.setProperty("--player-glyph", c.glyph);
  root.style.setProperty("--player-ring", c.ring);
  root.style.setProperty("--player-focus", c.focus);
  // The dark board makes a dark halo right for six of the seven. Black gets a
  // light one so its house does not vanish into its own outline.
  root.style.setProperty("--player-halo", c.halo === "light"
    ? "0 0 3px rgba(255,255,255,.95), 0 1px 2px rgba(255,255,255,.85)"
    : "0 0 3px rgba(8,10,14,.95), 0 1px 2px rgba(8,10,14,.9)");
}
