// Minimal line-art doodles -- no map, just icons.
// 1.6px stroke on a 24px grid, per the redesign: tiles render these at 21px
// now (down from 24), and 1.4 went thin and grey at that size. Legibility at a
// glance was the whole brief for the icon set.
export const ICON_ATTRS = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"';
// (BUILDING_ICONS and BUILDING_CATS were deleted 2026-08-25 with the
// Construction panel and its holdings grid. They keyed a doodle and a pale
// tint per building id, for tiles that counted what you owned -- a readout
// that stopped meaning anything once buildings became things standing on
// specific hexes. The board shows where they are, which is strictly more.
// What a hex WEARS on the board is the mark ladder in ui/map.js: a resource
// letter for anything that yields, and STRUCTURE_GLYPH for anything that
// does not. That is where a new structure goes now.)

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

