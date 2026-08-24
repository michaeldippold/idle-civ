// ---------- The authored continents (map.md §2.6, slice 4) ----------
// The frame decides where land ENDS; the dice decide what land IS. These
// shapes are hand-authored and the pool is small ON PURPOSE: a player who
// has seen Broadwater a few times starts recognising it from a corner of
// coastline, which is the orientation drama the fog cannot otherwise give
// ("am I on the narrow stretch, or the wide part?"). Terrain, lakes, rivers,
// your start and your neighbours are all still rolled per run.
//
// AUTHORED AS ASCII so the shape is legible to whoever edits it next:
//   #  land
//   ~  ocean (unsettleable; sight rays travel through it)
// Rows are odd-r offset rows of a pointy-top hex grid, so ODD ROWS SIT HALF
// A HEX TO THE RIGHT of even ones. Straight ASCII columns therefore zigzag
// slightly in hex space, which flatters organic coastlines and is why these
// read as land rather than as rectangles.
//
// THE ISLAND LAW (checked by the harness, implemented in generate.js): every
// island must be within sight range of SOME other land -- the mainland, or
// another island already in the chain. An island nobody can ever see is not a
// promise, it is a secret. Chains rather than mainland-adjacency, because an
// archipelago is by definition far from the mainland and near itself; add an
// island beyond every chain and the harness fails, loudly, naming its size.

export const SIGHT_RANGE = 3;   // water steps a coastal hex can see (slice 4b)

export const CONTINENTS = [
  {
    id: "broadwater",
    name: "Broadwater",
    blurb: "A wide country around a deep bay, with islands off the eastern shore.",
    rows: [
      "~~~~~~~~~~~~~~~~~~~~~~~~",
      "~~~~~~####~~~~~~~~~~~~~~",
      "~~~~#########~~~~~~~~~~~",
      "~~~###########~~~~~~~~~~",
      "~~#############~~~##~~~~",
      "~~##############~~~#~~~~",
      "~~###############~~~~~~~",
      "~~###############~~~~~~~",
      "~~##############~~~~~~~~",
      "~~#####~~~~#####~~~##~~~",
      "~~####~~~~~~####~~~~~~~~",
      "~~###~~~~~~~~###~~~~~~~~",
      "~~####~~~~~~####~~~~~~~~",
      "~~######~~######~~~~~~~~",
      "~~############~~~~~~~~~~",
      "~~~~#######~~~~~~~~~~~~~",
      "~~~~~~~~~~~~~~~~~~~~~~~~",
    ],
  },
  {
    id: "longreach",
    name: "The Long Reach",
    blurb: "A narrow country stretched between two seas, strung with islands.",
    rows: [
      "~~~~~~~~~~~~~~~~~~~~~~~~~~",
      "~~~~~~~~~~~~~~~~~#######~~",
      "~~~~~~~~~~~~~~~~########~~",
      "~~~~~~~~~~~~~~~########~~~",
      "~~~~~~~~~~~~~~########~~~~",
      "~~~~~~~~~~~~~#######~~~~~~",
      "~~~~~~~~~~~~#######~~~~~~~",
      "~~~~~~~~~~~######~~~~##~~~",
      "~~~~~~~~~~######~~~~~###~~",
      "~~~~~~~~~######~~~~~~##~~~",
      "~~~~~~~~######~~~~~~~~~~~~",
      "~~~~~~~######~~~~~~~~~~~~~",
      "~~~~~~#######~~~~~~~~~~~~~",
      "~~~###~#######~~~~~~~~~~~~",
      "~~~~~########~~~~~~~~~~~~~",
      "~~~~########~~~~~~~~~~~~~~",
      "~~~########~~~~~~~~~~~~~~~",
      "~~~#######~~~~~~~~~~~~~~~~",
      "~~~######~~~~~~~~~~~~~~~~~",
      "~~~~#####~~~~~~~~~~~~~~~~~",
      "~~~~~###~~~~~~~~~~~~~~~~~~",
      "~~~~~~~~~~~~~~~~~~~~~~~~~~",
    ],
  },
  {
    id: "thescatter",
    name: "The Scatter",
    blurb: "A modest mainland in an archipelago — more coast than any country needs.",
    rows: [
      "~~~~~~~~~~~~~~~~~~~~~~~~~~",
      "~~~~~~~#####~~~~~~~~~~~~~~",
      "~~~~~########~~~~###~~~~~~",
      "~~~~##########~~~~###~~~~~",
      "~~~###########~~~~~~~~~~~~",
      "~~~############~~~~~~~~~~~",
      "~~############~~~~~###~~~~",
      "~~###########~~~~~~####~~~",
      "~~##########~~~~~~~###~~~~",
      "~~~#########~~~~~~~~~~~~~~",
      "~~~########~~~~###~~~~~~~~",
      "~~~#######~~~~~####~~~~~~~",
      "~~~~######~~~~~###~~~~~~~~",
      "~~~~#####~~~~~~~~~~~~~~~~~",
      "~~~~~###~~~~~###~~~~~~~~~~",
      "~~~~~~~~~~~~~~##~~~~~~~~~~",
      "~~~~~~~~~~~~~~~~~~~~~~~~~~",
    ],
  },
];

// Parse an authored frame into axial cells. Odd-r offset -> axial, per the
// header note. Returns land and ocean id sets in FRAME-LOCAL coordinates;
// generate.js translates them so the chosen start sits at the origin, which
// keeps `home` at "0,0" for every system that already assumes it.
export function parseFrame(rows) {
  const land = [], ocean = [];
  for (let row = 0; row < rows.length; row++) {
    const line = rows[row];
    for (let col = 0; col < line.length; col++) {
      const ch = line[col];
      if (ch !== "#" && ch !== "~") continue;
      const q = col - ((row - (row & 1)) >> 1);
      (ch === "#" ? land : ocean).push([q, row]);
    }
  }
  return { land, ocean };
}

export function continentById(id) {
  return CONTINENTS.find((c) => c.id === id) || CONTINENTS[0];
}
