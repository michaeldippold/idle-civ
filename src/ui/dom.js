import { S } from "../core/state.js";

// ---------- Rendering ---------------------------------------
export function fmt(n) { return Math.floor(n).toLocaleString(); }
export function fmtRate(n) { return (n > 0 ? "+" : "") + n.toFixed(2) + "/s"; }

// ---------- Tooltips ----------------------------------------
// Descriptions live here and nowhere else. Inline descriptions clogged the
// board once eight panels were open; moving them to hover means they can be
// MORE verbose, not less. The tooltip also carries the refusal reason, so
// there is exactly one place to look when something won't buy.
//
// Content is computed at hover time via a getter stashed on the element
// (`el.__tip`), not baked in at creation -- cards update in place, so a
// snapshot taken when the card was built would go stale immediately.
export let tipEl = null;
export function attachTip(el, getter) {
  el.__tip = getter;
  if (el.__tipWired) return;
  el.__tipWired = true;
  el.addEventListener("mouseenter", (e) => tipShow(el, e));
  el.addEventListener("mousemove", (e) => tipMove(e));
  el.addEventListener("mouseleave", tipHide);
  // A card that becomes disabled mid-hover stops firing mouseleave in some
  // browsers, so blur is a second exit.
  el.addEventListener("blur", tipHide);
}

export function tipShow(el, ev) {
  const t = el.__tip && el.__tip();
  if (!t || !t.title) return;
  tipEl = tipEl || document.getElementById("tooltip");
  if (!tipEl) return;
  document.getElementById("tipTitle").textContent = t.title;
  document.getElementById("tipBody").textContent = t.body || "";
  const why = document.getElementById("tipWhy");
  why.textContent = t.why || "";
  why.classList.toggle("hidden", !t.why);
  tipEl.classList.remove("hidden");
  tipMove(ev);
}

export function tipMove(ev) {
  if (!tipEl || tipEl.classList.contains("hidden")) return;
  const pad = 14, w = tipEl.offsetWidth, h = tipEl.offsetHeight;
  // Flip to the other side of the cursor rather than letting the box run off
  // the viewport -- the rightmost column is where the wordiest cards live.
  let x = ev.clientX + pad;
  let y = ev.clientY + pad;
  if (x + w > window.innerWidth - 8) x = ev.clientX - w - pad;
  if (y + h > window.innerHeight - 8) y = ev.clientY - h - pad;
  tipEl.style.left = Math.max(8, x) + "px";
  tipEl.style.top = Math.max(8, y) + "px";
}

export function tipHide() {
  tipEl = tipEl || document.getElementById("tooltip");
  if (tipEl) tipEl.classList.add("hidden");
}

// "Short 24 wood, 3 stone." -- the refusal reason, in the tooltip, in red.
export function shortfallLine(cost) {
  const short = Object.keys(cost)
    .filter((k) => (S.res[k] || 0) < cost[k])
    .map((k) => `${Math.ceil(cost[k] - (S.res[k] || 0))} ${k}`);
  return short.length ? `Short ${short.join(", ")}.` : null;
}

// Shared create-once-update-in-place tile, used by Settlement (buildings) and
// Your People (person-types) -- same visual language, different data source.
// Icon + count side by side, no label: the old stacked icon/name/number
// arrangement read as a fraction. The name moves to the tooltip along with the
// description -- everything except the first three settlers was built
// deliberately, so the player already has context for what they're looking at.
export function renderTile(container, prefix, id, icon, name, count, cat, desc) {
  let tile = document.getElementById(prefix + id);
  if (!tile) {
    tile = document.createElement("div");
    tile.className = "holding";
    tile.id = prefix + id;
    tile.innerHTML =
      `<span class="h-icon">${icon}</span>` +
      `<span class="h-count" id="${prefix}${id}-count"></span>`;
    container.appendChild(tile);
  }
  if (cat) tile.dataset.cat = cat;
  document.getElementById(`${prefix}${id}-count`).textContent = count;
  // Name is read fresh on every hover rather than baked in at creation -- an
  // era change renames existing tiles in place (Medicine Tent -> Infirmary).
  attachTip(tile, () => ({ title: name, body: desc || "" }));
}

// Population leads the ledger. It has a value, a cap and a rate, so it IS a
// resource, and it belongs with the others rather than in a bespoke widget
// inside Your People. Two sentences died to make this row: "Housing is full"
// (the red at-cap value says it better) and the idle readout (now a red note
// riding in this same cell, because idle labour is a problem to fix).
