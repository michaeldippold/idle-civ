import { active } from "../content/compile.js";
import { cancelBuild } from "../core/actions.js";
import { CONFIG } from "../core/config.js";
import { defById } from "../core/derived.js";
import { S } from "../core/state.js";
import { campaignTarget, findAdversary } from "../sim/expeditions.js";
import { renderTile } from "./dom.js";
import { BUILDING_CATS, BUILDING_ICONS, QUEUE_ICONS } from "./icons.js";

export function renderQueue() {
  const panel = document.getElementById("panel-queue");
  const wrap = document.getElementById("queueBody");
  const emptyMsg = document.getElementById("queueEmpty");
  if (!wrap) return;

  // Always present, empty until something is underway. (It used to hide until
  // first use, tracked by a sticky S.seen.queueUsed; the board is now whole
  // from frame one, so that flag was write-only state in every save and went
  // with it -- see design.md, "Unravel the contents, not the board".)
  const anything = S.buildQueue.length > 0 || S.expeditions.length > 0;
  emptyMsg.classList.toggle("hidden", anything);
  wrap.classList.toggle("hidden", !anything);

  const liveUids = new Set(S.buildQueue.map((q) => String(q.uid))
    .concat(S.expeditions.map((e) => "x" + e.uid)));
  Array.from(wrap.children).forEach((child) => {
    if (!liveUids.has(child.dataset.uid)) wrap.removeChild(child);
  });

  // Expedition cards: same visual language as builds, but dashed -- and no
  // cancel button, because there are no catch windows once a column marches.
  const expCards = [];
  for (const ex of S.expeditions) {
    const target = ex.type === "campaign" ? campaignTarget(ex.adversary) : null;
    const adv = target ? { name: target.name } : findAdversary(ex.adversary);
    let card = wrap.querySelector(`[data-uid="x${ex.uid}"]`);
    if (!card) {
      card = document.createElement("div");
      card.className = "queue-card expedition";
      card.dataset.uid = "x" + ex.uid;
      card.innerHTML =
        `<div class="site-name">` +
          `<span class="q-icon">${QUEUE_ICONS[ex.type] || ""}</span>` +
          `<span class="q-label"></span>` +
          `<span class="b-of q-pct"></span>` +
        `</div>` +
        `<div class="progress"><span class="q-bar" style="width:0%"></span></div>` +
        `<div class="site-meta"><span class="eta q-eta"></span></div>`;
      wrap.appendChild(card);
    }
    const pct = Math.max(0, Math.min(100, (1 - ex.remaining / ex.total) * 100));
    const who = adv ? adv.name : "the road home";
    card.querySelector(".q-label").textContent =
      (ex.type === "campaign" ? "Marching on " : "Caravan to ") + who;
    card.querySelector(".q-pct").textContent = `(${Math.floor(pct)}%)`;
    card.querySelector(".q-bar").style.width = pct + "%";
    card.querySelector(".q-eta").textContent = `returns in ~${Math.max(1, Math.ceil(ex.remaining))}s`;
    expCards.push(card);
  }

  let etaAccum = 0;
  const buildCards = [];
  S.buildQueue.forEach((item, i) => {
    etaAccum += item.remaining;
    const def = defById(item.id);
    const label = item.label || (def && def.name) || item.id;
    let card = wrap.querySelector(`[data-uid="${item.uid}"]`);
    if (!card) {
      card = document.createElement("div");
      card.className = "queue-card";
      card.dataset.uid = String(item.uid);
      card.innerHTML =
        `<div class="site-name">` +
          `<span class="q-icon">${QUEUE_ICONS[item.kind] || QUEUE_ICONS.build}</span>` +
          `<span class="q-label"></span>` +
          `<span class="b-of q-pct"></span>` +
          `<button class="q-cancel" title="Cancel and refund">×</button>` +
        `</div>` +
        `<div class="progress"><span class="q-bar" style="width:0%"></span></div>` +
        `<div class="site-meta"><span class="eta q-eta"></span></div>`;
      wrap.appendChild(card);
      card.querySelector(".q-cancel").addEventListener("click", () => cancelBuild(item.uid));
    }
    const pct = Math.max(0, Math.min(100, (1 - item.remaining / item.total) * 100));
    // No "Raising:" / "Queued:" prefix -- the filled bar and the "~24s left"
    // line already say which item is active, and the prefix was eating the
    // name's space in a narrow column.
    card.querySelector(".q-label").textContent = label;
    card.querySelector(".q-pct").textContent = `(${Math.floor(pct)}%)`;
    card.querySelector(".q-bar").style.width = pct + "%";
    card.querySelector(".q-eta").textContent =
      `~${Math.max(1, Math.ceil(etaAccum / CONFIG.buildSpeed))}s left`;
    card.classList.toggle("queued", i > 0);
    buildCards.push(card);
  });

  // Expeditions read as the headline events: they sit above the builds.
  // Same only-touch-the-DOM-on-change reorder the Upgrades panel uses.
  const desired = expCards.concat(buildCards);
  const current = Array.from(wrap.children);
  if (desired.some((el, i) => el !== current[i])) {
    for (const el of desired) wrap.appendChild(el);
  }
}

// The buy menu abstracts ownership into a small number; this panel makes it
// visible at a glance -- one tile per building type you actually hold.
export function renderHoldings() {
  const panel = document.getElementById("panel-holdings");
  const body = document.getElementById("holdingsBody");
  const emptyMsg = document.getElementById("holdingsEmpty");

  const buildings = active().buildings;
  const owned = buildings.filter((d) => (S.builds[d.id] || 0) > 0);
  emptyMsg.classList.toggle("hidden", owned.length > 0);
  body.classList.toggle("hidden", owned.length === 0);

  for (const def of owned) {
    renderTile(body, "hold-", def.id, BUILDING_ICONS[def.id] || "", def.name, S.builds[def.id],
      BUILDING_CATS[def.id], def.desc);
  }
}
