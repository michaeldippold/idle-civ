import { ERA_ORDER, MANIFESTS, active, manifestDiff } from "../content/compile.js";
import { CONFIG } from "../core/config.js";
import { housing, playtime } from "../core/derived.js";
import { setModalHold } from "./chrome.js";
import { suppressSaves } from "../core/persist.js";
import { S } from "../core/state.js";
import { fmtTime } from "./chrome.js";

// ---------- Modal ---------------------------------------------
// One modal at a time, centered over a dimmed page. No dragging, resizing, or
// minimizing by design -- opening one never pauses the game (game over is the
// exception only because death already stops the loop on its own).
// `opts` is deliberately an open bag rather than more positional flags: the
// decision queue (phase 7) will grow it -- designed defaults, dismiss-to-tray,
// whatever future asks need -- without another signature change. Today it
// carries one key:
//   pause (default true) -- an ASKING modal holds the simulation while open;
//   a TELLING modal opts out with { pause: false }. The ceremony register
//   (era transition, game over) holds too: stillness is part of the weight,
//   and reading the age's obituary should not cost world-time. Only the Info
//   reference -- material you browse DURING play -- opts out today.
//   (design.md, Time, Presence & Pause, rule 3.)
export function openModal(title, bodyHTML, actions, onMount, opts = {}) {
  setModalHold(opts.pause !== false);
  document.getElementById("modalTitle").textContent = title;
  const body = document.getElementById("modalBody");
  body.innerHTML = bodyHTML;
  body.scrollTop = 0;
  // Every modal starts from the same clean stock; a caller that wants ruled
  // ground (Info) adds it in its own onMount rather than leaving it behind for
  // whichever modal opens next.
  body.classList.remove("ruled-graph");

  const bar = document.getElementById("modalActions");
  bar.innerHTML = "";
  bar.classList.toggle("hidden", !actions || !actions.length);
  (actions || []).forEach((a) => {
    const b = document.createElement("button");
    b.className = "modal-btn" + (a.danger ? " danger" : "");
    b.textContent = a.label;
    b.addEventListener("click", a.onClick);
    bar.appendChild(b);
  });

  document.getElementById("modalOverlay").classList.remove("hidden");
  if (onMount) onMount(body);
}

export function closeModal() {
  setModalHold(false);
  document.getElementById("modalOverlay").classList.add("hidden");
}
export function modalIsOpen() {
  return !document.getElementById("modalOverlay").classList.contains("hidden");
}

// Reference panel: everything in the game, grouped by era. Shows all content
// regardless of what's been revealed -- it's a reference, and hiding things
// would defeat the point (see design.md for the tension with "unravel").
// Each tab reads straight from that era's compiled manifest, so a Bronze tab
// shows Bronze names and descs even while you're still in the Stone Age.
export function infoPanelHTML() {
  const tabs = ERA_ORDER.map((e) =>
    `<button class="info-tab${e === S.era ? " active" : ""}" data-era="${e}">${MANIFESTS[e].name}</button>`
  ).join("");

  const sections = ERA_ORDER.map((e) => {
    const m = MANIFESTS[e];
    // Ruled ground, boxed content, strong section markers. That combination is
    // what makes a dense reference skimmable: the eye jumps by heading, then
    // lands in a box instead of a wall. Two columns, because these entries are
    // short and a single column of them scrolls forever.
    const group = (label, items) => {
      if (!items.length) return "";
      return `<h3 class="info-h">${label}</h3><div class="info-grid">` + items.map((d) =>
        `<div class="info-item">` +
          `<div class="info-top"><span class="info-name">${d.name}</span>` +
          (d.costLine ? `<span class="info-cost">${d.costLine}</span>` : "") + `</div>` +
          `<div class="info-desc">${d.desc}</div>` +
        `</div>`
      ).join("") + `</div>`;
    };
    // The reference is the one place costs are shown for things you may not
    // have revealed yet -- it exists to answer "what does this age hold".
    // Each cost is its own span so the line can break at the commas between
    // them without ever splitting "400 food" across two lines.
    const priced = (items) => items.map((d) => Object.assign({}, d, {
      costLine: d.base
        ? Object.keys(d.base).map((k) => `<span>${d.base[k]} ${k}</span>`).join(", ") +
          (d.buildTime ? ` <span>· ${d.buildTime}s</span>` : "")
        : null,
    }));
    const neighbors = m.adversaries.map((a) => ({
      name: a.name.charAt(0).toUpperCase() + a.name.slice(1), desc: a.desc,
    }));
    const inner = group("Buildings", priced(m.buildings)) + group("People", priced(m.units)) +
      group("Upgrades", priced(m.upgrades)) + group("Neighbors", neighbors);
    return `<div class="info-era${e === S.era ? "" : " hidden"}" data-era="${e}">${inner}</div>`;
  }).join("");

  return `<div class="info-tabs">${tabs}</div>${sections}`;
}

export function openInfoPanel() {
  openModal(`Reference · ${active().name}`, infoPanelHTML(), null, (body) => {
    body.classList.add("ruled-graph");
    body.querySelectorAll(".info-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        const era = tab.dataset.era;
        body.querySelectorAll(".info-tab").forEach((t) => t.classList.toggle("active", t === tab));
        body.querySelectorAll(".info-era").forEach((s) => s.classList.toggle("hidden", s.dataset.era !== era));
        body.scrollTop = 0;
      });
    });
  }, { pause: false });  // reference material, browsed DURING play: the one telling modal
}

// Hand-authored per era: ONLY the flavor lead. Every list underneath -- what
// changed, what's newly available, what's no longer needed -- derives from
// the manifest diff, so none of it can go stale as content moves. Every age
// is supposed to land as a visible "whoa, look at this" moment (design.md);
// the lead is where that voice lives, the diff is where the facts do.
export const ERA_TRANSITIONS = {
  bronze: {
    lead: "Copper and tin are married in fire. The first bronze is poured, and everything your people know how to make changes with it.",
  },
  iron: {
    lead: "The far mines fall silent and the bronze roads empty. What replaces them is nearer, harder, and everywhere — and the world, it turns out, is full of neighbors.",
  },
};

export function openEraModal(era, before) {
  const t = ERA_TRANSITIONS[era];
  if (!t) return;
  const pi = ERA_ORDER.indexOf(era) - 1;
  const prevM = pi >= 0 ? MANIFESTS[ERA_ORDER[pi]] : null;
  const m = MANIFESTS[era];
  const diff = manifestDiff(prevM, m);

  // "What changed": renames, era-scoped value shifts, and new resources/jobs
  // (which have no buy-card, so they'd otherwise go unannounced).
  const changes = diff.renamed.map((r) => `The ${r.from.name} is now the ${r.to.name}.`);
  if (prevM && prevM.popNoun.plural !== m.popNoun.plural) {
    changes.push(`You count your people in ${m.popNoun.plural} now.`);
  }
  if (before.housing !== housing()) changes.push(`Housing rises from ${before.housing} to ${housing()}.`);
  if (prevM) {
    for (const panelId in m.panelTitles) {
      if (prevM.panelTitles[panelId] && prevM.panelTitles[panelId] !== m.panelTitles[panelId]) {
        changes.push(`The ${prevM.panelTitles[panelId]} is now a ${m.panelTitles[panelId]}.`);
      }
    }
    const newRes = m.resources.filter((r) => !prevM.resources.some((p) => p.id === r.id));
    if (newRes.length) changes.push(`New resources: ${newRes.map((r) => r.name).join(", ")}.`);
    const newJobs = m.jobs.filter((j) => !prevM.jobs.some((p) => p.id === j.id));
    if (newJobs.length) changes.push(`New work: ${newJobs.map((j) => j.name.toLowerCase()).join(", ")}.`);
  }

  const unlocked = diff.added.map((d) => `${d.name} — ${d.desc}`);
  const retired = diff.removed.map((d) => d.name);

  // The three lists are three different shapes of information, so they get
  // three different treatments rather than one bulleted list doing all the
  // work. "Now available" is the one you'll actually shop from, so it reuses
  // the reference's boxed grid; the other two are read once and dismissed.
  const list = (items) => `<ul class="era-list">${items.map((i) => `<li>${i}</li>`).join("")}</ul>`;
  const boxes = (items) => `<div class="info-grid">` + items.map((d) =>
    `<div class="info-item">` +
      `<div class="info-top"><span class="info-name">${d.name}</span></div>` +
      `<div class="info-desc">${d.desc}</div>` +
    `</div>`).join("") + `</div>`;
  const chips = (names) => `<div class="era-chips">` +
    names.map((n) => `<span class="era-chip">${n}</span>`).join("") + `</div>`;

  let html = `<p class="modal-lead">${t.lead}</p>`;
  if (changes.length) html += `<h3 class="info-h">What changed</h3>${list(changes)}`;
  if (unlocked.length) html += `<h3 class="info-h">Now available</h3>${boxes(diff.added)}`;
  if (retired.length) html += `<h3 class="info-h">No longer needed</h3>${chips(retired)}`;

  // No action buttons -- dismiss via the ×, the backdrop, or Escape.
  openModal(`The ${m.name} Begins`, html);
}

// Shared by the Reset button and the game-over "Try Again" button.
export function hardReset() {
  // location.reload() fires pagehide -> save(), which would silently re-write
  // the very save we're clearing (S is still in memory). Suppress saves first;
  // the reload itself resets the flag.
  suppressSaves();
  try { localStorage.removeItem(CONFIG.saveKey); } catch (e) {}
  location.reload();
}

export function openResetModal() {
  const lived = S.tick > 0 ? ` You are ${fmtTime(playtime())} into this one.` : "";
  openModal("Start Over?",
    `<p class="modal-lead">This wipes the settlement completely — every building, every settler, ` +
    `the whole Chronicle.${lived} There is no undo.</p>`,
    [
      { label: "Cancel", onClick: closeModal },
      { label: "Wipe and Restart", onClick: hardReset, danger: true },
    ]);
}

export function openGameOverModal(cause) {
  const lead = cause === "conflict"
    ? "The last defenders fall. Raiders move through the settlement unopposed, and by morning there is no one left to rebuild."
    : "The stores run empty. One by one your people weaken, and the fires go out for the last time.";
  const built = Object.values(S.builds).reduce((a, b) => a + b, 0);
  // Boxed, so the run's numbers read as a record rather than a receipt.
  const stat = (label, val) =>
    `<div class="stat-box"><span class="s-lbl">${label}</span><span class="s-val">${val}</span></div>`;
  const stats =
    `<div class="modal-stats">` +
      stat("Time survived", fmtTime(playtime())) +
      stat("Age reached", active().name) +
      stat("Buildings raised", built) +
      stat("Arrivals welcomed", S.bought) +
      // The run's number: with it (and, after phase 4, the action log) the
      // whole game is reproducible. This is how a bug report becomes a repro.
      stat("World seed", S.seed) +
    `</div>`;
  openModal("The Settlement Has Fallen", `<p class="modal-lead">${lead}</p>${stats}`, [
    { label: "Try Again", onClick: hardReset },
  ]);
}

