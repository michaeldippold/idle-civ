import { active } from "../content/compile.js";
import { build } from "../core/actions.js";
import { buildCost, canAfford, civilians, defById, isCapped, isRevealed, levyCap, levyUsed, pendingCount, reserved } from "../core/derived.js";
import { S } from "../core/state.js";
import { attachTip, shortfallLine } from "./dom.js";


// Buy cards update IN PLACE, never via innerHTML on the render path. The old
// per-tick `card.innerHTML = ...` destroyed the card's children five times a
// second, and a human click is not instantaneous: mousedown landed on a child
// span, the next tick replaced it before mouseup, and the browser dropped the
// click because the pressed element no longer existed -- the long-standing
// "buys take 2-3 clicks" bug, as old as the first build. The skeleton is
// built once per card; per-tick updates touch only textContent and classList,
// which never replace the element a press started on. (No description on the
// card: it lives in the tooltip, where it can afford to be longer and where
// the refusal reason can sit beside it.)
export function cardSkeleton(card) {
  if (card.__skel) return card.__skel;
  card.innerHTML =
    `<div class="b-top"><span class="b-name"></span>` +
    `<span class="b-owned"><span class="bo-n"></span> <span class="b-pending hidden"></span></span></div>` +
    `<div class="b-cost"><span class="b-costs"></span><span class="b-time"></span></div>`;
  card.__skel = {
    name: card.querySelector(".b-name"),
    ownedBox: card.querySelector(".b-owned"),
    n: card.querySelector(".bo-n"),
    pending: card.querySelector(".b-pending"),
    costs: card.querySelector(".b-costs"),
    time: card.querySelector(".b-time"),
  };
  return card.__skel;
}

export function setText(el, text) { if (el && el.textContent !== text) el.textContent = text; }

// parts: [{ text, short }]. The spans (and their comma separators) are only
// rebuilt when the COUNT of parts changes -- era re-pricing, capped/owned
// flips -- which is rare and never correlated with a click in flight.
export function setCostParts(skel, parts) {
  const box = skel.costs;
  if (box.childElementCount !== parts.length) {
    box.innerHTML = parts.map(() => `<span></span>`).join(", ");
  }
  const spans = box.children;
  parts.forEach((p, i) => {
    const s = spans[i];
    if (!s) return;
    setText(s, p.text);
    if (s.classList) s.classList.toggle("short", !!p.short);
  });
}

export function setPending(skel, count) {
  if (count > 0) {
    setText(skel.pending, `+${count}`);
    skel.pending.classList.remove("hidden");
  } else {
    skel.pending.classList.add("hidden");
  }
}

export function costPartsFor(def) {
  const cost = buildCost(def);
  return Object.keys(cost).map((k) => ({ text: `${cost[k]} ${k}`, short: S.res[k] < cost[k] }));
}

export function renderBuildings() {
  const panel = document.getElementById("panel-build");
  const list = document.getElementById("buildingList");
  let anyRevealed = false;
  const open = [], maxed = [];

  for (const def of active().buildings) {
    const revealed = isRevealed(def);
    let card = document.getElementById("bcard-" + def.id);
    if (revealed && !card) {
      card = document.createElement("button");
      card.className = "building";
      card.id = "bcard-" + def.id;
      // Resolve by id AT CLICK TIME, never through the captured def: a card
      // created in one era outlives it, and a stale closure would buy at the
      // old era's prices -- the Bronze-priced Archer that silently refused to
      // train in Iron. defById answers with the active era's def.
      card.addEventListener("click", () => { const d = defById(def.id); if (d) build(d); });
      list.appendChild(card);
    }
    if (!revealed) continue;
    anyRevealed = true;

    const skel = cardSkeleton(card);
    const owned = S.builds[def.id] || 0;
    const pending = pendingCount(def.id);
    const capped = isCapped(def);

    setText(skel.name, def.name);
    setText(skel.n, capped ? "Maxed" : String(owned));
    setPending(skel, capped ? 0 : pending);
    skel.ownedBox.classList.toggle("is-owned", capped);
    if (capped) {
      setCostParts(skel, [{ text: "Maxed.", short: false }]);
      setText(skel.time, "");
    } else {
      setCostParts(skel, costPartsFor(def));
      setText(skel.time, `${def.buildTime}s`);
    }
    card.disabled = S.dead || capped || !canAfford(buildCost(def));
    card.classList.toggle("owned", capped);
    attachTip(card, () => ({
      title: def.name,
      body: def.desc,
      why: capped ? "You only ever need the one." : shortfallLine(buildCost(def)),
    }));
    (capped ? maxed : open).push(card);
  }

  // Maxed buildings sink to the bottom, so what you can still raise is never
  // buried under things you're finished with. Sorted rather than split into an
  // Available/Owned pair of tabs like Upgrades, and the difference is a real
  // one: Upgrades trends toward being entirely owned, so hiding that half is
  // eventually the whole panel, while only five buildings in the game are
  // cappable at all (all cap-1) and the rest stay buyable forever. A tab
  // holding five cards would be ceremony, and it would hide useful context --
  // a maxed Barracks on screen is the reason the Training panel exists.
  // Same only-touch-the-DOM-when-the-order-changed guard as Upgrades uses.
  const desired = open.concat(maxed);
  const current = Array.from(list.children);
  if (desired.some((el, i) => el !== current[i])) {
    for (const el of desired) list.appendChild(el);
  }

  document.getElementById("buildEmpty").classList.toggle("hidden", anyRevealed);
}

// One-time upgrades: same card shell as renderBuildings, but a card locks
// permanently once owned (or already queued) instead of re-pricing upward.
export function renderUpgrades() {
  const panel = document.getElementById("panel-upgrades");
  const list = document.getElementById("upgradeList");
  let anyRevealed = false;
  const buyable = [], ownedCards = [];

  for (const def of active().upgrades) {
    const revealed = isRevealed(def);
    let card = document.getElementById("bcard-" + def.id);
    if (revealed && !card) {
      card = document.createElement("button");
      card.className = "building";
      card.id = "bcard-" + def.id;
      // Resolve by id AT CLICK TIME, never through the captured def: a card
      // created in one era outlives it, and a stale closure would buy at the
      // old era's prices -- the Bronze-priced Archer that silently refused to
      // train in Iron. defById answers with the active era's def.
      card.addEventListener("click", () => { const d = defById(def.id); if (d) build(d); });
      list.appendChild(card);
    }
    if (!revealed) continue;
    anyRevealed = true;

    const cost = buildCost(def);
    const owned = !!S.upgrades[def.id];
    const pending = pendingCount(def.id) > 0;
    const skel = cardSkeleton(card);
    setText(skel.name, def.name);
    setText(skel.n, owned ? "owned" : pending ? "queued" : "");
    setPending(skel, 0);
    skel.ownedBox.classList.toggle("is-owned", owned);
    skel.ownedBox.classList.toggle("is-queued", !owned && pending);
    if (owned) {
      setCostParts(skel, [{ text: "Permanent.", short: false }]);
      setText(skel.time, "");
    } else {
      setCostParts(skel, costPartsFor(def));
      setText(skel.time, `${def.buildTime}s`);
    }
    card.disabled = S.dead || owned || pending || !canAfford(cost);
    card.classList.toggle("owned", owned);
    attachTip(card, () => ({
      title: def.name,
      body: def.desc,
      why: owned ? "Already yours — permanent." : pending ? "Already in the queue." : shortfallLine(cost),
    }));
    (owned ? ownedCards : buyable).push(card);
  }

  // Owned upgrades are FILTERED OUT of the Available tab rather than dimmed in
  // place at the bottom of one list. Sitting there at reduced contrast, they
  // read as unaffordable -- the opposite of what they are. On the Owned tab
  // they render at full contrast with a green border, because owning them is
  // an achievement rather than a refusal.
  const onOwned = upgradeTab === "owned";
  const shown = onOwned ? ownedCards : buyable;
  for (const el of buyable) el.classList.toggle("hidden", onOwned);
  for (const el of ownedCards) el.classList.toggle("hidden", !onOwned);

  // Manifest order holds within each group, and the DOM is only touched when
  // the order actually changed (an appendChild of an already-attached node
  // MOVES it, so an unconditional loop would thrash every frame).
  const desired = buyable.concat(ownedCards);
  const current = Array.from(list.children);
  if (desired.some((el, i) => el !== current[i])) {
    for (const el of desired) list.appendChild(el);
  }

  const availTab = document.getElementById("tabAvailable");
  const ownTab = document.getElementById("tabOwned");
  if (availTab) {
    availTab.textContent = buyable.length ? `Available (${buyable.length})` : "Available";
    ownTab.textContent = ownedCards.length ? `Owned (${ownedCards.length})` : "Owned";
    availTab.classList.toggle("active", !onOwned);
    ownTab.classList.toggle("active", onOwned);
  }
  const emptyMsg = document.getElementById("upgradesEmpty");
  if (emptyMsg) {
    emptyMsg.classList.toggle("hidden", !anyRevealed || shown.length > 0);
    emptyMsg.textContent = onOwned ? "Nothing owned yet." : "Everything here is already yours.";
  }
  // The tab strip is contents too: it waits until there is something to sort.
  document.getElementById("upgradeTabs").classList.toggle("hidden", !anyRevealed);
  document.getElementById("upgradesUnknown").classList.toggle("hidden", anyRevealed);
}

// Trainable person-types -- same card shell again, but the cost line also
// shows the settler(s) consumed, and unlike Construction/Upgrades this panel
// is fully hidden (not just empty) until a Barracks exists.
export function renderTraining() {
  const panel = document.getElementById("panel-training");
  const list = document.getElementById("trainingList");
  let anyRevealed = false;

  for (const def of active().units) {
    const revealed = isRevealed(def);
    let card = document.getElementById("bcard-" + def.id);
    if (revealed && !card) {
      card = document.createElement("button");
      card.className = "building";
      card.id = "bcard-" + def.id;
      // Resolve by id AT CLICK TIME, never through the captured def: a card
      // created in one era outlives it, and a stale closure would buy at the
      // old era's prices -- the Bronze-priced Archer that silently refused to
      // train in Iron. defById answers with the active era's def.
      card.addEventListener("click", () => { const d = defById(def.id); if (d) build(d); });
      list.appendChild(card);
    }
    if (!revealed) continue;
    anyRevealed = true;

    const cost = buildCost(def);
    const parts = costPartsFor(def);
    const levied = !!active().levy;
    const levyFull = levied && levyUsed() + 1 > levyCap();
    if (def.popCost && !levied) {
      const noun = def.popCost > 1 ? active().popNoun.plural : active().popNoun.singular;
      parts.push({ text: `${def.popCost} ${noun}`, short: civilians() - reserved() < def.popCost });
    } else if (levied) {
      // The levy line: how much of the muster this order would occupy.
      parts.push({ text: `levy ${levyUsed()}/${levyCap()}`, short: levyFull });
    }
    const skel = cardSkeleton(card);
    setText(skel.name, def.name);
    setText(skel.n, String(S.units[def.id] || 0));
    setPending(skel, pendingCount(def.id));
    setCostParts(skel, parts);
    setText(skel.time, `${def.buildTime}s`);
    card.disabled = S.dead || !canAfford(cost) || (!levied && def.popCost && civilians() - reserved() < def.popCost) || levyFull;
    attachTip(card, () => ({
      title: def.name,
      body: def.desc,
      // Two different refusals share this card, and the population one is the
      // easier to miss -- you can be rich in wood and still have nobody spare.
      why: levyFull
        ? `Your ${active().popNoun.plural} can levy no more. Grow your dominion, and the muster grows with it.`
        : (!levied && def.popCost && civilians() - reserved() < def.popCost)
        ? `No one is free to train. A ${active().popNoun.singular} must be idle first.`
        : shortfallLine(cost),
    }));
  }

  document.getElementById("trainingEmpty").classList.toggle("hidden", anyRevealed);
}

// Your People / Settlement can each expand to fill their whole grid column
// (both rows) while their paired action-panel (Training / Construction) has
// nothing revealed yet -- an unexplained blank cell reads as a bug, a taller
// single panel reads as intentional.
// The roster panels used to stretch over their partner's empty cell, because
// the partner wasn't there yet. Every panel the era can fill is now present
// from frame one, so that case no longer arises and only the Chronicle's span
// still does any work: it runs double-height as a luxury until the world opens
// up, then yields its lower half to Expeditions.
// Which Upgrades tab is showing. UI state, same as `paused` and `speed` --
// deliberately not part of S. Lives here (not core/state) because its only
// consumer is renderUpgrades, and the setter re-renders on flip.
export let upgradeTab = "available";
export function setUpgradeTab(tab) { upgradeTab = tab; renderUpgrades(); }
