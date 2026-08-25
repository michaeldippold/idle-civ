import { active } from "../content/compile.js";
import { CONFIG } from "../core/config.js";
import { capWord, caps, fmtSouls, ledgerRates, souls, soulsPerPerson } from "../core/derived.js";
import { S } from "../core/state.js";
import { atDominionCap, capOf, hexPopSum } from "../map/map.js";
import { attachTip, fmt, fmtRate } from "./dom.js";

export function renderPopRow(bar) {
  let row = document.getElementById("res-pop");
  if (!row) {
    row = document.createElement("div");
    row.className = "res";
    row.id = "res-pop";
    row.innerHTML =
      `<span class="res-name" id="name-pop">Pop</span>` +
      `<span class="res-val" id="val-pop">0</span>` +
      `<span class="res-rate" id="rate-pop"></span>` +
      `<span class="res-note" id="note-pop"></span>`;
    // Always first: it is the resource every other one is in service of.
    bar.insertBefore(row, bar.firstChild);
  }

  // Under conquest growth the row is a COUNT, not a promise: no cap (there
  // is none), no rate (nothing ticks). The number is load-bearing -- it is
  // the levy base and the workforce -- but its growth is a verb now.
  const noun = active().popNoun;

  // THE ODOMETER IS THE TOPLINE NUMBER (owner ruling, 2026-08-25). This row
  // used to print the raw hex sum -- the sim's own unit -- which is fiction-false
  // the moment a hex stops being a clearing: "300 people" while holding twenty
  // fortified holdfasts is showing your working. It prints real beings now,
  // and the true count retreats to the tile, where it is a lever.
  //
  // (An earlier comment here called the raw hex sum "the odometer". It was not;
  // it was the true count. The two words for one thing are what made this
  // confusing enough to need a ruling.)
  // THE LABEL RE-DENOMINATES TOO. It was a hardcoded "Pop" -- the one part of
  // this row that never climbed, while the noun beside it did. Built once and
  // updated in place, per the create-once law.
  const nameEl = document.getElementById("name-pop");
  if (nameEl) nameEl.textContent = noun.plural;

  const truePop = hexPopSum();
  const shown = souls();
  const valEl = document.getElementById("val-pop");
  // Bare count, no cap beside it: a ceiling on the topline would make the
  // odometer a cap, and rule 1 forbids it appearing in one.
  valEl.innerHTML = fmtSouls(shown);
  valEl.classList.toggle("full", false);

  const rateEl = document.getElementById("rate-pop");
  rateEl.textContent = "";
  rateEl.classList.toggle("pos", false);

  const noteEl = document.getElementById("note-pop");
  noteEl.textContent = "";   // "idle" died in E2: people work where they live

  // This tooltip described HOUSING, and housing died in the engine rework: it
  // read three variables (`conquest`, `full`, `idleNow`) that no longer exist
  // anywhere, so it threw a ReferenceError on every hover and the row simply
  // had no tooltip. Rewritten to the law that actually runs now -- population
  // lives on hexes, terrain sets the ceiling, and EXPANSION is the growth verb.
  attachTip(row, () => {
    const owned = S.map && S.map.owned ? S.map.owned : [];
    let ceiling = 0;
    for (const id of owned) ceiling += capOf(id);
    const room = ceiling - truePop;
    const per = soulsPerPerson();
    const tile = active().map && active().map.tileNoun;
    const place = tile ? (owned.length === 1 ? tile.singular : tile.plural) : "hexes";
    // The tooltip is where the two scales are reconciled, and the ONLY place
    // they need to be: descriptions live on hover (interface.md), so the board
    // can show one honest big number and still answer "one what?" on demand.
    return {
      title: capWord(noun.plural),
      body: per > 1
        ? `Your ${noun.plural} live on the ground they work, across ${owned.length} ${place}. ` +
          `The board counts that ground in communities -- ${fmt(truePop)} of them, each about ` +
          `${fmt(per)} ${noun.plural} -- because a ${tile ? tile.singular : "hex"} is far more ` +
          `than one household now. Everyone eats.`
        : `Your ${noun.plural} live on the ground they work, and every ${
            noun.singular} counted here stands on one of your ${owned.length} ${place}. ` +
          `They arrive on their own while that ground has room for them. Everyone eats.`,
      // The ceiling is the whole story of when to expand, so it is the WHY --
      // and it stays in TRUE units, because it is about a cap, and a cap is a
      // lever the odometer may never enter.
      why: room > 0
        ? `Room for ${fmt(room)} more on the ground you hold (${fmt(truePop)} of ${fmt(ceiling)}).`
        : atDominionCap()
        ? "Your ground is full, and you may hold no more of it this era. Build, and advance."
        : "Your ground is full. Claim more, and the ceiling rises with it.",
    };
  });
}

// Rows are built from the manifest's resource list on first appearance rather
// than being written into index.html, so adding a resource needs no markup change.
export function renderResources() {
  const bar = document.getElementById("resourceBar");
  const r = ledgerRates();   // production NET of converter flows -- see ledgerRates()
  const c = caps();
  const resources = active().resources;
  const any = resources.some((res) => S.res[res.id] > 0);
  const empty = document.getElementById("emptyStores");
  if (empty) empty.classList.toggle("hidden", any);

  renderPopRow(bar);

  for (const res of resources) {
    // Food is always shown (it's the thing that can kill you); everything else
    // appears once you hold some, or once its era arrives. Reveals are sticky.
    const show = S.res[res.id] > 0 || res.id === "food" || S.seen["res:" + res.id] ||
      (res.reveal && res.reveal());
    if (show) S.seen["res:" + res.id] = true;

    let row = document.getElementById("res-" + res.id);
    if (!row) {
      if (!show) continue;
      row = document.createElement("div");
      row.className = "res";
      row.id = "res-" + res.id;
      row.innerHTML =
        `<span class="res-name">${res.name}</span>` +
        `<span class="res-val" id="val-${res.id}">0</span>` +
        `<span class="res-rate" id="rate-${res.id}"></span>`;
      bar.appendChild(row);
    }
    row.classList.toggle("hidden", !show);
    if (!show) continue;

    const cap = c[res.id];
    const valEl = document.getElementById("val-" + res.id);
    // Uncapped (Iron onward): a bare value -- the row stops promising a
    // ceiling that no longer exists. Same demotion the POP row got.
    valEl.innerHTML = Number.isFinite(cap)
      ? `${fmt(S.res[res.id])}<span class="cap"> / ${fmt(cap)}</span>`
      : fmt(S.res[res.id]);
    valEl.classList.toggle("full", Number.isFinite(cap) && S.res[res.id] >= cap - 0.01);

    const rateEl = document.getElementById("rate-" + res.id);
    const rate = (res.id === "food" ? r.foodNet : r[res.id]) || 0;
    // Below half a display-digit reads as +0.00/s -- an honest zero shows as
    // nothing, same as a true zero.
    rateEl.textContent = Math.abs(rate) >= 0.005 ? fmtRate(rate) : "";
    rateEl.classList.toggle("pos", rate > 0);
    rateEl.classList.toggle("neg", rate < 0);

    const atCap = S.res[res.id] >= cap - 0.01;
    attachTip(row, () => ({
      title: res.name,
      body: atCap
        ? "The store is full — anything gathered beyond this is wasted. Build to hold more."
        : "Gathered by whoever you put to the work.",
      why: rate < 0 ? "This pile is draining." : null,
    }));
  }
}

