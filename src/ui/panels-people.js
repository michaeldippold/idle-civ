import { active } from "../content/compile.js";
import { assign } from "../core/actions.js";
import { CONFIG } from "../core/config.js";
import { capWord, civilians, housing, idle, isRevealed, mults, rates } from "../core/derived.js";
import { S } from "../core/state.js";
import { attachTip, fmtRate, renderTile } from "./dom.js";
import { PERSON_ICONS } from "./icons.js";

export function renderPeople() {
  const tiles = document.getElementById("personTiles");
  const noun = active().popNoun;
  renderTile(tiles, "ptile-", "settler", PERSON_ICONS.settler, capWord(noun.singular), civilians(), "people",
    `An ordinary ${noun.singular}. Put them to work, or train them for something harder.`);
  for (const def of active().units) {
    if (!isRevealed(def)) continue;
    renderTile(tiles, "ptile-", def.id, PERSON_ICONS[def.id] || "", def.name, S.units[def.id] || 0, "people", def.desc);
  }

  // "Housing is full" moved into the ledger's Pop row, where the red at-cap
  // value says it without a sentence. This line now carries only the thing a
  // number can't: when the next arrival is due.
  // Emptying the text is not enough to make this disappear: the element is an
  // inline-block with its own padding, background and min-height, so a blank
  // one painted a small stray patch on the panel. It has to actually go.
  const gl = document.getElementById("growthLine");
  if (active().growth !== "timer") {
    // Conquest growth: a standing sentence, not a countdown. Status lines
    // over widgets, per the interface grammar.
    gl.classList.remove("hidden");
    gl.textContent = "No one arrives unbidden. Your people grow by conquest and fealty.";
  } else if (S.pop >= housing()) {
    gl.classList.add("hidden");
    gl.innerHTML = "";
  } else {
    gl.classList.remove("hidden");
    const remaining = Math.max(0, CONFIG.settlerIntervalSeconds - S.growth);
    gl.innerHTML = `Next ${noun.singular} joins in <span class="cost">${Math.ceil(remaining)}s</span>.`;
  }

  const list = document.getElementById("jobList");
  const r = rates();
  for (const job of active().jobs) {
    // A job in the manifest is normally just shown; `reveal` can defer it.
    const show = !job.reveal || S.seen["job:" + job.id] || job.reveal();
    if (show) S.seen["job:" + job.id] = true;

    let row = document.getElementById("job-" + job.id);
    if (!row) {
      if (!show) continue;
      row = document.createElement("div");
      row.className = "job";
      row.id = "job-" + job.id;
      // Two lines: the name owns the first, the rate and the stepper share the
      // second. At this column width there is no honest way to fit all three
      // on one line, and the name is the control's primary label.
      // The stepper is ONE segmented instrument -- a single bordered group with
      // internal dividers -- because two loose buttons flanking a floating
      // number read as two different kinds of control.
      row.innerHTML =
        `<span class="job-name" id="jname-${job.id}">${job.name}</span>` +
        `<span class="job-out" id="out-${job.id}"></span>` +
        `<span class="stepper-group">` +
          `<button class="stepper dec" data-job="${job.id}" data-d="-1">−</button>` +
          `<span class="job-count" id="cnt-${job.id}">0</span>` +
          `<button class="stepper inc" data-job="${job.id}" data-d="1">+</button>` +
        `</span>`;
      list.appendChild(row);
      row.querySelectorAll(".stepper").forEach((b) =>
        b.addEventListener("click", () => assign(b.dataset.job, Number(b.dataset.d))));
    }
    row.classList.toggle("hidden", !show);
    if (!show) continue;

    const n = S.jobs[job.id] || 0;
    const cnt = document.getElementById("cnt-" + job.id);
    cnt.textContent = n;
    cnt.classList.toggle("zero", n === 0);
    document.getElementById("jname-" + job.id).classList.toggle("idle", n === 0);
    // Per-job output, not the resource total -- two jobs never share a resource
    // today, but showing the job's own contribution is the honest reading.
    const own = n * CONFIG.baseRate * (job.rateMult || 1) * (mults()[job.res] || 1);
    document.getElementById("out-" + job.id).textContent = n > 0 ? fmtRate(own) : "";
    const noOne = idle() <= 0;
    row.querySelector('[data-d="-1"]').disabled = S.dead || n <= 0;
    row.querySelector('[data-d="1"]').disabled = S.dead || noOne;
    attachTip(row, () => ({
      title: job.name,
      body: job.desc || `Assign ${active().popNoun.plural} to gather ${job.res}.`,
      why: noOne && n === 0 ? "No one is idle. Take someone off other work first." : null,
    }));
  }
}

// Hidden until first used, then sticky-visible forever (empty-state message
// on any later empty stretch, rather than disappearing again). [0] is actively
// building, the rest wait their turn. Each card's ETA is cumulative (its own
// remaining plus everything still ahead of it), so the wait visibly counts
// down too. Every card gets a cancel button -- refunds exactly what was paid,
// even mid-construction.
