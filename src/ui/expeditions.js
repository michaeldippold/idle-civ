import { active } from "../content/compile.js";
import { CONFIG } from "../core/config.js";
import { availableUnits, isRevealed, pluralize } from "../core/derived.js";
import { S } from "../core/state.js";
import { campaignPlan, campaignRefusal, campaignStrength, columnSize, expeditionOut, findAdversary, hostileRouteRisk, launchCampaign, launchCaravan, provisionsFor, riskAdversary, standingWord, wallPower } from "../sim/expeditions.js";
import { closeModal, openModal } from "./modal.js";

// The Expeditions panel is gone (the flip, 2026-08-22): the map's Selected
// Tile panel carries the adversary card and its actions now. The muster and
// escort modals below are its surviving -- and thriving -- machinery.


// Muster allocation is UI state, not game state (like `paused`): it's what
// the NEXT expedition would take. It lives in the campaign/caravan modals
// and resets every time one opens.
export let muster = {};

export function fightsAsLabel(adv) {
  return adv.fightsAs === "massed" ? "a massed charge"
       : adv.fightsAs === "riders" ? "a band of riders" : "a warband";
}
export function advDisplayName(adv) { return adv.name.charAt(0).toUpperCase() + adv.name.slice(1); }
export function stockLine(st) {
  const s = Object.keys(st.stock).filter((k) => st.stock[k] > 0)
    .map((k) => `${Math.floor(st.stock[k])} ${k}`).join(", ");
  return s ? `Known stock: ${s}.` : "Nothing left worth taking.";
}
// Wall damage is narrated, never numbered, on the card -- the numbers live in
// the campaign modal where the muster math already does.
export function wallsState(adv, st) {
  if (!(adv.walls > 0)) return "";
  if (st.walls <= 0) return " Their walls lie in ruin.";
  if (st.walls < adv.walls) return " Their walls are battered.";
  return "";
}

// Stepper rows shared by the campaign and caravan modals. `prefix` keeps the
// two modals' element ids distinct; wiring clamps against live availability
// (the game does not pause for modals, so "what's home" can change under you).
export function musterRowsHTML(prefix) {
  return active().units.filter(isRevealed).map((def) =>
    // Same two-line row and same segmented stepper as job assignment: the
    // player already learned this control in the first minute, and mustering a
    // column is the same verb as assigning labour pointed somewhere else.
    `<div class="job">` +
      `<span class="job-name">${pluralize(def.name)}</span>` +
      `<span class="job-out" id="${prefix}avail-${def.id}"></span>` +
      `<span class="stepper-group">` +
        `<button class="stepper dec" data-mid="${def.id}" data-d="-1">−</button>` +
        `<span class="job-count" id="${prefix}cnt-${def.id}">0</span>` +
        `<button class="stepper inc" data-mid="${def.id}" data-d="1">+</button>` +
      `</span>` +
    `</div>`).join("");
}
export function wireMusterRows(bodyEl, refresh) {
  bodyEl.querySelectorAll(".stepper").forEach((b) => b.addEventListener("click", () => {
    const id = b.dataset.mid, d = Number(b.dataset.d);
    // No ceiling but the one you can feed -- the stepper stops at what you
    // OWN, and the provisions line below does the arguing.
    muster[id] = Math.max(0, Math.min(availableUnits(id), (muster[id] || 0) + d));
    refresh();
  }));
}
export function refreshMusterRows(prefix) {
  for (const def of active().units) {
    const cnt = document.getElementById(prefix + "cnt-" + def.id);
    if (!cnt) continue;
    muster[def.id] = Math.max(0, Math.min(availableUnits(def.id), muster[def.id] || 0));
    cnt.textContent = muster[def.id] || 0;
    const avail = document.getElementById(prefix + "avail-" + def.id);
    if (avail) avail.textContent = `${availableUnits(def.id)} home`;
  }
  return Object.values(muster).reduce((a, b) => a + b, 0);
}
export function confirmButton() {
  const btns = document.querySelectorAll("#modalActions button");
  return btns.length ? btns[btns.length - 1] : null;
}

// The campaign is a decision worth a ceremony: the modal carries the
// target's description (which IS the strength hint -- see design.md, flavor
// is load-bearing), the muster, and a live estimate.
// Takes a unified target ref (6d): a major's adversary id, or "tile:q,r"
// for a minor seat. One modal, one muster grammar, two prizes -- plunder
// from a major, fealty from a minor.
export function openCampaignModal(ref) {
  const plan = campaignPlan(ref);
  if (!plan) return;
  const t = plan.target;
  const lead = t.kind === "major" ? t.adv.desc
    : `${t.name.charAt(0).toUpperCase() + t.name.slice(1)} — win, and it swears fealty: one more holdfast under your banner, its stores besides.`;
  const statusBits = t.kind === "major"
    ? `${t.adv.disposition} · ${standingWord(t.st.standing)} · strength ${t.strength}, fights as ${fightsAsLabel(t.adv)}. ${stockLine(t.st)}`
    : `strength ${t.strength}.` + (plan.tilesOff != null ? ` ${plan.tilesOff} tiles off.` : "");
  muster = {};
  const body =
    `<p class="modal-lead">${lead}</p>` +
    `<div class="exp-status">${statusBits}</div>` +
    `<h3 class="info-h">Muster the column</h3>` +
    `<div class="muster">${musterRowsHTML("cm")}</div>` +
    `<div class="exp-status" id="cmEstimate"></div>` +
    `<div class="exp-status" id="cmProvisions"></div>` +
    `<div class="exp-status hidden" id="cmRefusal"></div>`;
  openModal(`Campaign: ${t.name.charAt(0).toUpperCase() + t.name.slice(1)}`, body, [
    { label: "Stay home", onClick: closeModal },
    { label: "March", danger: true, onClick: () => {
        launchCampaign(ref, muster);
        if (expeditionOut("campaign")) closeModal();
      } },
  ], (bodyEl) => {
    const refresh = () => {
      const total = refreshMusterRows("cm");
      const est = document.getElementById("cmEstimate");
      if (est) {
        const wallsNow = t.st.walls || 0;
        const wallsBit = wallsNow > 0
          ? ` Their walls stand at ${Math.ceil(wallsNow)} — your column brings wall-power ${wallPower(muster).toFixed(1)}.`
          : "";
        est.innerHTML = total < 1 ? ""
          : `Your ${total} march at strength ${campaignStrength(muster, { strength: t.strength, fightsAs: t.fightsAs }).toFixed(1)}, against theirs of ${t.strength}.${wallsBit}`;
      }
      // AN ARMY EATS IN PROPORTION TO ITSELF, and the number has to move while
      // you decide -- a static cost printed above the steppers was the reason
      // column size needed an arbitrary cap to mean anything at all.
      // THE BUTTON SAYS NO, AND SAYS WHY. Reads the same function launchCampaign
      // guards on, so the modal cannot claim a march is possible that the sim
      // will then silently refuse.
      const refusal = campaignRefusal(ref, muster);
      const goBtn = confirmButton();
      if (goBtn) goBtn.disabled = !!refusal;
      const why = document.getElementById("cmRefusal");
      if (why) {
        why.innerHTML = refusal ? `<span class="short">${refusal}</span>` : "";
        why.classList.toggle("hidden", !refusal);
      }

      const provisions = provisionsFor(plan, total);
      const prov = document.getElementById("cmProvisions");
      if (prov) {
        const short = S.res.food < provisions;
        prov.innerHTML =
          `Provisions: <b${short ? ' class="bad"' : ""}>${provisions} food</b> for ${total || "no"} ` +
          `${total === 1 ? "fighter" : "fighters"} · ${plan.time}s there and back` +
          `${plan.tilesOff != null ? ` · a route of ${plan.tilesOff}` : ""}.` +
          (short ? ` You have ${Math.floor(S.res.food)}.` : "");
      }
      const march = confirmButton();
      if (march) march.disabled = S.dead || total < 1 ||
        S.res.food < provisions || expeditionOut("campaign");
    };
    wireMusterRows(bodyEl, refresh);
    refresh();
  });
}

// Only exists while the roads are dangerous -- on safe roads a caravan is a
// one-click send, and the escort question doesn't arise.
export function openCaravanModal(advId) {
  const adv = findAdversary(advId);
  const st = S.adversaries[advId];
  const raiders = riskAdversary();
  if (!adv || !adv.buys || !st || !raiders) return;
  muster = {};
  const premium = st.standing >= 2 ? 1.25 : 1;
  const wouldPay = Math.min(Math.floor(adv.buys.pays * premium), Math.floor(st.stock.gold || 0));
  const body =
    `<p class="modal-lead">The roads are not safe — ${raiders.name} prowl them. An escort won't keep a caravan from being found; it decides what happens when it is.</p>` +
    `<div class="exp-status">Exchange: ${adv.buys.amount} ${adv.buys.res} → ${wouldPay} gold · ${adv.caravanTime}s round trip.</div>` +
    `<h3 class="info-h">Escort (optional)</h3>` +
    `<div class="muster">${musterRowsHTML("cv")}</div>` +
    `<div class="exp-status" id="cvEstimate"></div>`;
  openModal(`Caravan: ${advDisplayName(adv)}`, body, [
    { label: "Hold the caravan", onClick: closeModal },
    { label: "Send it", onClick: () => {
        launchCaravan(advId, muster);
        if (expeditionOut("caravan")) closeModal();
      } },
  ], (bodyEl) => {
    const refresh = () => {
      const total = refreshMusterRows("cv");
      const est = document.getElementById("cvEstimate");
      if (est) {
        est.textContent = total < 1
          ? "Unescorted: if the roads find it, the cargo is gone."
          : `Escort of ${total}, strength ${campaignStrength(muster, raiders).toFixed(1)} against raiders at ${raiders.strength}.`;
      }
      const send = confirmButton();
      if (send) send.disabled = S.dead || expeditionOut("caravan");
    };
    wireMusterRows(bodyEl, refresh);
    refresh();
  });
}


