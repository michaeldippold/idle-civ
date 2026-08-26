import { active } from "../content/compile.js";
import { S } from "../core/state.js";

// ---------- Progressive reveal / one-time hints -------------
// Hint content lives in HINT_LIB up top; which hints are live is the active
// manifest's `hints` slate.
export function checkReveals() {
  for (const rv of active().hints) {
    if (S.seen[rv.id]) continue;
    if (rv.when()) {
      S.seen[rv.id] = true;
      if (rv.msg) log(rv.msg);
    }
  }
}

// ---------- Logging -----------------------------------------
export function log(text, cls) {
  const el = document.getElementById("log");
  if (!el) return;
  const div = document.createElement("div");
  div.className = "entry" + (cls ? " " + cls : "");
  // A mark in the gutter, and the gutter's right edge is the legal pad's red
  // margin rule. The mark repeats the severity the colour already carries,
  // which is deliberate: it survives being skimmed, and it survives colour
  // blindness. Neutral lines get a quiet mid-dot rather than nothing, so the
  // gutter reads as a ruled column instead of an intermittent one.
  // `news` is the notification thread: a fact arriving from the world rather
  // than prose about your settlement. Marked with a right-pointing guillemet
  // so it reads as "incoming" at a glance, and kept distinct from the flavour
  // marks precisely so the two can be separated when the Chronicle finishes
  // becoming a notification system.
  const MARKS = { good: "+", bad: "!", big: "★", news: "»" };
  div.innerHTML =
    `<span class="mark">${MARKS[cls] || "·"}</span>` +
    `<span class="text"></span>`;
  div.querySelector(".text").textContent = text;

  // Only the newest entry ever carries "latest" -- hand it off from whoever had it.
  const prevLatest = el.querySelector(".entry.latest");
  if (prevLatest) prevLatest.classList.remove("latest");
  div.classList.add("latest");

  el.prepend(div);                                    // newest at the top, no scrolling needed to see it
  while (el.children.length > 60) el.removeChild(el.lastChild);  // oldest is now at the bottom -- trim there
  el.scrollTop = 0;                                    // keep the latest in view even if new lines keep coming
}

