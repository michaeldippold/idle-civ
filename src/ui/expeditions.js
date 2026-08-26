import { active } from "../content/compile.js";
import { CONFIG } from "../core/config.js";
import { availableUnits, isRevealed, pluralize } from "../core/derived.js";
import { S, me, playerByKey } from "../core/state.js";
import { campaignPlan, campaignRefusal, campaignStrength, columnSize, expeditionOut, findAdversary, hostileRouteRisk, launchCampaign, launchCaravan, provisionsFor, riskAdversary, standingWord, wallPower } from "../sim/expeditions.js";
import { closeModal, openModal } from "./modal.js";
import { formArmy, formRefusal } from "../sim/armies.js";
import { DEFAULT_STANCE, STANCES, unitHit } from "../sim/battle.js";
import { requestRender } from "../core/bus.js";

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
  const s = Object.keys(st.res).filter((k) => st.res[k] > 0)
    .map((k) => `${Math.floor(st.res[k])} ${k}`).join(", ");
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
      // THE TO-HIT NUMBER TRAVELS WITH THE UNIT, everywhere one is drawn. The
      // game will never print your odds, so what it owes you is the inputs --
      // and a muster screen is exactly where you are deciding what to bring.
      `<span class="job-name">${pluralize(def.name)}` +
        `<span class="army-stat">hits on ${unitHit(def)}+</span></span>` +
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
        const short = me().res.food < provisions;
        prov.innerHTML =
          `Provisions: <b${short ? ' class="bad"' : ""}>${provisions} food</b> for ${total || "no"} ` +
          `${total === 1 ? "fighter" : "fighters"} · ${plan.time}s there and back` +
          `${plan.tilesOff != null ? ` · a route of ${plan.tilesOff}` : ""}.` +
          (short ? ` You have ${Math.floor(me().res.food)}.` : "");
      }
      const march = confirmButton();
      if (march) march.disabled = S.dead || total < 1 ||
        me().res.food < provisions || expeditionOut("campaign");
    };
    wireMusterRows(bodyEl, refresh);
    refresh();
  });
}

// Only exists while the roads are dangerous -- on safe roads a caravan is a
// one-click send, and the escort question doesn't arise.
export function openCaravanModal(advId) {
  const adv = findAdversary(advId);
  const st = playerByKey(advId);
  const raiders = riskAdversary();
  if (!adv || !adv.buys || !st || !raiders) return;
  muster = {};
  const premium = st.standing >= 2 ? 1.25 : 1;
  const wouldPay = Math.min(Math.floor(adv.buys.pays * premium), Math.floor(st.res.gold || 0));
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

// ---- Raising an army -------------------------------------------------------
// The same muster grammar a campaign uses -- the player learned this control in
// the first minute and there is no reason a second one exists -- plus the one
// thing a campaign never had to ask: THE STANCE.
//
// It is set here, loudly, because it has to be a choice actively made rather
// than a default nobody read. With no reinforcement and no between-rounds, a
// pre-set withdrawal is the ONLY exit from a battle you are losing, including a
// siege that is clearly not going to crack. If a player loses an army because
// they never noticed this control existed, that is on us and not on them.
let raiseStance = DEFAULT_STANCE;

function stancePickHTML() {
  return `<div class="stance-pick">` + STANCES.map((s) =>
    `<button class="stance-opt${s.id === raiseStance ? " on" : ""}" data-stance="${s.id}">${s.name}</button>`
  ).join("") + `</div>`;
}

export function openRaiseModal(hexId) {
  muster = {};
  raiseStance = DEFAULT_STANCE;
  const body =
    `<p class="modal-lead">Soldiers raised here stand on this ground until you send them somewhere. ` +
    `A garrison is not a different thing from an army — it is an army that has not been told to leave.</p>` +
    `<h3 class="info-h">Who marches under this banner</h3>` +
    `<div class="muster">${musterRowsHTML("ra")}</div>` +
    `<h3 class="info-h">Standing order</h3>` +
    `<div id="raStance">${stancePickHTML()}</div>` +
    `<div class="exp-status" id="raNote"></div>` +
    `<div class="exp-status hidden" id="raRefusal"></div>`;
  openModal("Raise an army", body, [
    { label: "Not yet", onClick: closeModal },
    { label: "Raise", danger: false, onClick: () => {
        if (formArmy(hexId, muster, raiseStance)) { closeModal(); requestRender(); }
      } },
  ], (bodyEl) => {
    const refresh = () => {
      const total = refreshMusterRows("ra");
      const note = document.getElementById("raNote");
      if (note) {
        note.textContent = total
          ? `${total} under arms. They hold this ground until ordered elsewhere.`
          : "An army needs somebody in it.";
      }
      const why = formRefusal(hexId, muster);
      const ref = document.getElementById("raRefusal");
      if (ref) { ref.textContent = why || ""; ref.classList.toggle("hidden", !why); }
      const go = confirmButton();
      if (go) go.disabled = !!why;
      const pick = document.getElementById("raStance");
      if (pick) pick.innerHTML = stancePickHTML();
      wireStance(bodyEl, refresh);
    };
    const wireStance = (root, again) => {
      root.querySelectorAll(".stance-opt").forEach((b) => b.addEventListener("click", () => {
        raiseStance = b.dataset.stance;
        again();
      }));
    };
    wireMusterRows(bodyEl, refresh);
    wireStance(bodyEl, refresh);
    refresh();
  });
}
