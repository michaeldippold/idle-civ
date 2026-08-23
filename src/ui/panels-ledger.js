import { active } from "../content/compile.js";
import { CONFIG } from "../core/config.js";
import { capWord, caps, ledgerRates } from "../core/derived.js";
import { S } from "../core/state.js";
import { hexPopSum } from "../map/map.js";
import { attachTip, fmt, fmtRate } from "./dom.js";

export function renderPopRow(bar) {
  let row = document.getElementById("res-pop");
  if (!row) {
    row = document.createElement("div");
    row.className = "res";
    row.id = "res-pop";
    row.innerHTML =
      `<span class="res-name">Pop</span>` +
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

  // Engine rework E1: the POP row reads the SUM OF THE HEXES -- the odometer,
  // real at last. During the E1 observation window the old economy still runs
  // on S.pop underneath (upkeep, steppers, the levy), so the two numbers can
  // diverge; that is expected and temporary, and E2 retires S.pop's side.
  const shown = hexPopSum();
  const valEl = document.getElementById("val-pop");
  // Bare count, no housing cap: the hex sum answers to terrain caps now, and
  // printing the old housing ceiling beside it would be a lie ("8 / 6").
  valEl.innerHTML = fmt(shown);
  // The at-cap red belonged to housing; the odometer answers to terrain caps.
  valEl.classList.toggle("full", false);

  const rateEl = document.getElementById("rate-pop");
  rateEl.textContent = "";
  rateEl.classList.toggle("pos", false);

  const noteEl = document.getElementById("note-pop");
  noteEl.textContent = "";   // "idle" died in E2: people work where they live

  attachTip(row, () => ({
    title: capWord(noun.plural),
    body: conquest
      ? `No one arrives unbidden now. Your ${noun.plural} grow by conquest and fealty — and each raises the levy that guards them all.`
      : full
      ? `Every roof is taken. Raise more housing and the next ${noun.singular} will have somewhere to sleep.`
      : `New ${noun.plural} arrive on their own while there is housing to spare. Everyone eats, whether working or not.`,
    why: idleNow === 1
      ? "One of them stands idle — put them to work."
      : idleNow > 1 ? `${idleNow} of them stand idle — put them to work.` : null,
  }));
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
    rateEl.textContent = rate !== 0 ? fmtRate(rate) : "";
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

