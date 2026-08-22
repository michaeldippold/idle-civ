import { active } from "../content/compile.js";
import { CONFIG } from "../core/config.js";
import { availableUnits, isRevealed, pluralize } from "../core/derived.js";
import { S } from "../core/state.js";
import { campaignStrength, expeditionOut, findAdversary, hostileRouteRisk, launchCampaign, launchCaravan, riskAdversary, standingWord, wallPower } from "../sim/expeditions.js";
import { closeModal, openModal } from "./modal.js";

export function expeditionsUnlocked() {
  return active().adversaries.length > 0;
}

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
export function openCampaignModal(advId) {
  const adv = findAdversary(advId);
  const st = S.adversaries[advId];
  if (!adv || !st) return;
  muster = {};
  const body =
    `<p class="modal-lead">${adv.desc}</p>` +
    `<div class="exp-status">${adv.disposition} · ${standingWord(st.standing)} · strength ${adv.strength}, ` +
      `fights as ${fightsAsLabel(adv)}. ${stockLine(st)}</div>` +
    `<h3 class="info-h">Muster the column</h3>` +
    `<div class="muster">${musterRowsHTML("cm")}</div>` +
    `<div class="exp-status" id="cmEstimate"></div>` +
    `<div class="exp-status">Provisions: ${CONFIG.campaignFoodCost} food · ${adv.campaignTime}s there and back.</div>`;
  openModal(`Campaign: ${advDisplayName(adv)}`, body, [
    { label: "Stay home", onClick: closeModal },
    { label: "March", danger: true, onClick: () => {
        launchCampaign(advId, muster);
        if (expeditionOut("campaign")) closeModal();
      } },
  ], (bodyEl) => {
    const refresh = () => {
      const total = refreshMusterRows("cm");
      const est = document.getElementById("cmEstimate");
      if (est) {
        const wallsBit = st.walls > 0
          ? ` Their walls stand at ${Math.ceil(st.walls)} — your column brings wall-power ${wallPower(muster).toFixed(1)}.`
          : "";
        est.textContent = total < 1 ? "Muster at least one fighter."
          : `Your ${total} march at strength ${campaignStrength(muster, adv).toFixed(1)}, against theirs of ${adv.strength}.${wallsBit}`;
      }
      const march = confirmButton();
      if (march) march.disabled = S.dead || total < 1 ||
        S.res.food < CONFIG.campaignFoodCost || expeditionOut("campaign");
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

export function renderExpeditions() {
  const panel = document.getElementById("panel-expeditions");
  if (!panel) return;
  const open = expeditionsUnlocked();
  panel.classList.toggle("hidden", !open);
  if (!open) return;

  // Prose status only -- the countdowns and progress bars live in the
  // Underway (queue) panel, where in-progress things belong.
  const campaignAway = expeditionOut("campaign");
  const caravanAway = expeditionOut("caravan");
  const status = document.getElementById("expeditionStatus");
  const parts = [];
  if (campaignAway) parts.push("A campaign is in the field.");
  if (caravanAway) parts.push("A caravan is on the road.");
  if (!parts.length) {
    parts.push((S.builds.musterGround || 0) >= 1
      ? "The Muster Ground stands ready."
      : "You know your neighbors, but you have no one to send. A Muster Ground would change that.");
  }
  status.textContent = parts.join(" ");

  // One card per adversary: who they are, what's left of them, what you can do.
  const list = document.getElementById("adversaryList");
  for (const adv of active().adversaries) {
    const st = S.adversaries[adv.id];
    if (!st) continue;
    let card = document.getElementById("adv-" + adv.id);
    if (!card) {
      card = document.createElement("div");
      card.className = "adv-card";
      card.id = "adv-" + adv.id;
      card.innerHTML =
        `<div class="b-top"><span class="b-name" id="advname-${adv.id}"></span>` +
        `<span class="b-owned" id="advstand-${adv.id}"></span></div>` +
        `<div class="b-desc" id="advdesc-${adv.id}"></div>` +
        `<div class="b-desc adv-stock" id="advstock-${adv.id}"></div>` +
        `<div class="adv-actions">` +
          `<button class="modal-btn" id="advmarch-${adv.id}"></button>` +
          `<button class="modal-btn" id="advtrade-${adv.id}"></button>` +
        `</div>`;
      list.appendChild(card);
      document.getElementById(`advmarch-${adv.id}`).addEventListener("click", () => openCampaignModal(adv.id));
      document.getElementById(`advtrade-${adv.id}`).addEventListener("click", () => {
        if (hostileRouteRisk()) openCaravanModal(adv.id);
        else launchCaravan(adv.id);
      });
    }

    document.getElementById(`advname-${adv.id}`).textContent = advDisplayName(adv);
    document.getElementById(`advstand-${adv.id}`).textContent =
      `${adv.disposition} · ${standingWord(st.standing)}`;
    document.getElementById(`advdesc-${adv.id}`).textContent =
      `${adv.desc} Strength ${adv.strength}, fights as ${fightsAsLabel(adv)}.`;
    document.getElementById(`advstock-${adv.id}`).textContent = stockLine(st) + wallsState(adv, st);

    // The panel now stands before the Muster Ground does, so both verbs gate on
    // it here rather than the whole panel gating on it. Reading the neighbours
    // before you can act on them is the point: the cards are the recruiting
    // poster for the building.
    const noMuster = (S.builds.musterGround || 0) < 1;

    const march = document.getElementById(`advmarch-${adv.id}`);
    march.textContent = `March (${CONFIG.campaignFoodCost} food, ${adv.campaignTime}s)`;
    march.disabled = S.dead || campaignAway || noMuster;
    march.title = noMuster ? "You have nowhere to muster a column. Build a Muster Ground." :
      campaignAway ? "A campaign is already in the field." : "";

    const trade = document.getElementById(`advtrade-${adv.id}`);
    if (adv.buys) {
      const premium = st.standing >= 2 ? 1.25 : 1;
      const wouldPay = Math.min(Math.floor(adv.buys.pays * premium), Math.floor(st.stock.gold || 0));
      trade.classList.remove("hidden");
      trade.textContent = `Caravan: ${adv.buys.amount} ${adv.buys.res} → ${wouldPay} gold (${adv.caravanTime}s)`;
      trade.disabled = S.dead || caravanAway || noMuster || st.standing <= -2 || wouldPay <= 0 ||
        (S.res[adv.buys.res] || 0) < adv.buys.amount;
      trade.title = noMuster ? "You have no one to send. Build a Muster Ground." :
        caravanAway ? "A caravan is already on the road." :
        st.standing <= -2 ? "They remember your raids. They will not trade with you." :
        wouldPay <= 0 ? "They have no gold left to pay with." :
        (S.res[adv.buys.res] || 0) < adv.buys.amount ? `Not enough ${adv.buys.res}.` :
        hostileRouteRisk() ? "The roads are dangerous — you'll be offered an escort." : "";
    } else {
      trade.classList.add("hidden");
    }
  }
}

