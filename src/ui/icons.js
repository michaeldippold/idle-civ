// Minimal line-art doodles -- no map, just icons.
// 1.6px stroke on a 24px grid, per the redesign: tiles render these at 21px
// now (down from 24), and 1.4 went thin and grey at that size. Legibility at a
// glance was the whole brief for the icon set.
export const ICON_ATTRS = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"';
export const BUILDING_ICONS = {
  hut:        `<svg ${ICON_ATTRS}><path d="M4 12 L12 5 L20 12 M6 12 V20 H18 V12 M11 20 V15 H13 V20"/></svg>`,
  woodshed:   `<svg ${ICON_ATTRS}><path d="M4 20 V10 L12 5 L20 10 V20 M4 20 H20 M7 13 H10 M7 16 H10"/></svg>`,
  granary:    `<svg ${ICON_ATTRS}><path d="M7 20 V9 A5 4 0 0 1 17 9 V20 M7 9 H17 M7 13 H17"/></svg>`,
  stoneYard:  `<svg ${ICON_ATTRS}><path d="M4 20 H20 M5 20 V10 H19 V20"/><circle cx="9" cy="15" r="1" fill="currentColor" stroke="none"/><circle cx="13" cy="17" r="1" fill="currentColor" stroke="none"/><circle cx="16" cy="14" r="1" fill="currentColor" stroke="none"/></svg>`,
  dryingRack: `<svg ${ICON_ATTRS}><path d="M4 8 H20 M4 8 V20 M20 8 V20 M8 8 L6.5 14 M12 8 V15 M16 8 L17.5 14"/></svg>`,
  lumberCamp: `<svg ${ICON_ATTRS}><circle cx="8" cy="16" r="3"/><circle cx="14" cy="16" r="3"/><circle cx="11" cy="10" r="3"/></svg>`,
  stonePit:   `<svg ${ICON_ATTRS}><path d="M4 8 H20 L16 20 H8 Z"/><circle cx="10.5" cy="13" r="0.8" fill="currentColor" stroke="none"/><circle cx="14" cy="15.5" r="0.8" fill="currentColor" stroke="none"/></svg>`,
  infirmary:  `<svg ${ICON_ATTRS}><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M12 8 V16 M8 12 H16"/></svg>`,
  barracks:   `<svg ${ICON_ATTRS}><path d="M4 20 H20 M6 20 V12 L12 7 L18 12 V20 M12 7 V2 M12 3 L17 4.5 L12 6"/></svg>`,
  oreYard:    `<svg ${ICON_ATTRS}><path d="M4 20 H20 M7 20 L10 12 H14 L17 20"/><path d="M10 12 L12 8 L14 12"/><circle cx="12" cy="17" r="1" fill="currentColor" stroke="none"/></svg>`,
  forge:      `<svg ${ICON_ATTRS}><path d="M4 20 H20 M6 20 V13 A6 5 0 0 1 18 13 V20"/><path d="M12 13 V9 M9.5 11 L12 8 L14.5 11"/></svg>`,
  archeryRange: `<svg ${ICON_ATTRS}><path d="M6 3 A13 13 0 0 1 6 21"/><path d="M6 3 L6 21"/><path d="M6 12 H19 M16 9 L19 12 L16 15"/></svg>`,
  stables:    `<svg ${ICON_ATTRS}><path d="M4 20 V11 L12 6 L20 11 V20 M4 20 H20"/><path d="M10 20 V15 H14 V20"/></svg>`,
  ironYard:   `<svg ${ICON_ATTRS}><path d="M4 20 H20 M6 20 V14 H18 V20 M8 14 V10 H16 V14"/><circle cx="12" cy="17" r="1" fill="currentColor" stroke="none"/></svg>`,
  treasury:   `<svg ${ICON_ATTRS}><rect x="4" y="8" width="16" height="12" rx="1"/><path d="M4 12 H20 M12 12 V15"/><path d="M8 8 V6 A4 3 0 0 1 16 6 V8"/></svg>`,
  musterGround: `<svg ${ICON_ATTRS}><path d="M6 21 V4 M6 4 H17 L14 7.5 L17 11 H6"/><path d="M4 21 H10"/></svg>`,
  siegeWorkshop: `<svg ${ICON_ATTRS}><path d="M4 20 H20 M6 20 L12 8 L18 20"/><path d="M12 8 L12 4 L16 6"/><circle cx="9" cy="20" r="1.5"/><circle cx="15" cy="20" r="1.5"/></svg>`,
};
// Tiny queue-card type markers: hammer = build, sword = campaign,
// coins = caravan. Subtle by design -- the card text carries the verb, the
// icon just lets the eye sort the Underway panel without reading.
// A pale tint per category groups the Settlement panel at a glance without
// spending any of the semantic colour channel on it. Keyed by id like the icon
// table above, and safe for the same reason: ids are permanent and global, so
// a building keeps its tint through every rename the eras put it through.
// An id with no entry here simply renders on plain white.
export const BUILDING_CATS = {
  hut: "shelter",
  woodshed: "store", granary: "store", stoneYard: "store", oreYard: "store",
  ironYard: "store", treasury: "store",
  dryingRack: "work", lumberCamp: "work", stonePit: "work", forge: "work",
  infirmary: "care",
  barracks: "people", archeryRange: "people", stables: "people",
  musterGround: "people", siegeWorkshop: "people",
};

export const QUEUE_ICONS = {
  build:    `<svg ${ICON_ATTRS}><path d="M5 21 L12 14"/><path d="M9 7 L13 3 L21 11 L17 15 Z"/></svg>`,
  campaign: `<svg ${ICON_ATTRS}><path d="M5 19 L16 8"/><path d="M13 5 L19 11"/><path d="M3.5 20.5 L6.5 17.5"/></svg>`,
  caravan:  `<svg ${ICON_ATTRS}><circle cx="9" cy="15" r="5.5"/><circle cx="15" cy="9" r="5.5"/></svg>`,
  settle:   `<svg ${ICON_ATTRS}><path d="M6 21 L6 4"/><path d="M6 4 L17 7 L6 10"/></svg>`,
};

export const PERSON_ICONS = {
  settler: `<svg ${ICON_ATTRS}><circle cx="12" cy="7" r="3"/><path d="M6 20 C6 13 8.5 11 12 11 C15.5 11 18 13 18 20"/></svg>`,
  soldier: `<svg ${ICON_ATTRS}><circle cx="10" cy="7" r="3"/><path d="M4.5 20 C4.5 13 7 11 10 11 C13 11 15 13 15 20"/><path d="M8 3 L20 21"/></svg>`,
  archer:  `<svg ${ICON_ATTRS}><circle cx="9" cy="6" r="2.6"/><path d="M4 20 C4 14 6 12 9 12 C12 12 14 14 14 20"/><path d="M17 3 A11 11 0 0 1 17 19"/><path d="M17 3 L17 19 M17 11 H10"/></svg>`,
  horseman:`<svg ${ICON_ATTRS}><circle cx="9" cy="4.5" r="2.2"/><path d="M6 11 C6 8 7.5 7 9 7 C10.5 7 12 8 12 11"/><path d="M3 20 V16 C3 14 5 13 8 13 H14 L18 10 V13 C18 13 20 14 20 16 V20"/><path d="M7 20 V17 M16 20 V17"/></svg>`,
  siegeEngine:`<svg ${ICON_ATTRS}><path d="M4 20 H20 M7 20 V14 H17 V20"/><path d="M9 14 L15 4 M15 4 L18 7 M15 4 L11 5"/><circle cx="9" cy="20" r="1.5"/><circle cx="15" cy="20" r="1.5"/></svg>`,
};

