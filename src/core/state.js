import { CONFIG } from "./config.js";
import { newSeed } from "./rng.js";

// ---------- State -------------------------------------------
export let S;

// A CIVILIZATION. Everything that belongs to ONE player and not to the world:
// what it owns, what it knows, what it has built and learned, and which age it
// is living in.
//
// This split is the whole point (design brief, pillar 1: symmetric players).
// Before 2026-08-26 all of it hung directly off S, which encoded "there is one
// player and the world is theirs" into every read in the codebase -- a second
// civilization had nowhere to exist. Now `S.players` is a list and the human is
// simply the one at `S.me`; a bot is a record with the same fields and a
// different decision-maker. Someday-multiplayer is that list getting longer.
//
// `id` is the INDEX and the identity: it keys ownership on the board, colours
// the rims, and stamps the action journal. It never changes for a run.
export function freshPlayer(id, opts = {}) {
  return {
    id,
    // The colour this civ wears on the board (core/palette.js). Chosen on the
    // start screen for the human, authored for everyone else, and fixed for
    // the run by ruling -- nothing writes it after boot.
    //
    // The literal default is deliberate: palette.js reads S, so importing
    // DEFAULT_COLOR here would make state and palette a cycle for one string.
    // The harness asserts this equals palette's DEFAULT_COLOR instead, which is
    // the cheaper of the two ways to keep one fact honest in two files.
    color: opts.color || "purple",
    // What this civ calls its capital. Optional by design -- empty means the
    // game's own words ("Your Seat"), which is a perfectly good answer and the
    // reason naming is never a gate on starting a run.
    seatName: opts.seatName || "",

    // THE MANIFEST ID THIS CIV IS AUTHORED UNDER, or null for the human. The
    // three neighbours are content ("hillClans", "riverKingdom", "saltNomads")
    // -- named, described and statted per era -- so a bot record needs a way
    // back to its own authoring. The human has no key because nobody authored
    // them.
    key: opts.key || null,

    // A NEIGHBOUR'S STANDING WITH THIS CIV, and the walls it keeps. Both are
    // adversary-shaped today and both are on the road to becoming ordinary:
    // walls want to be fortification structures standing on their hexes, and
    // standing wants to be whatever survives the trade-and-diplomacy ruling.
    // They live on the player record so that when they do become ordinary,
    // there is no second home to migrate out of.
    standing: 0,
    walls: 0,

    // WHERE THIS CIV SITS -- the tile id of its capital, and the point every
    // administrative distance is measured from. Null until the world exists;
    // seated by ensureMap for the human and, when adversaries become players,
    // by the seat the generator already gives them.
    //
    // This is what `world.home` was, generalised: the generator translates the
    // frame so the HUMAN's seat lands on "0,0" (the camera and a dozen reads
    // assume it), which is fine for one civ and meaningless for the rest --
    // only one of N seats can be the origin. The seat that matters to a
    // calculation is the seat of the civ doing the calculating.
    seat: opts.seat || null,

    // THE AGE THIS CIV IS LIVING IN. Per-player from the start of the split,
    // because the alternative -- one world era -- is the thing the design
    // explicitly killed (Empire Earth: everyone advances on their own clock,
    // and being first is a real advantage). Everything still reads the human's
    // era today; `active(civ)` is what makes the rest true.
    era: opts.era || "stone",
    // Frozen pre-transition snapshots, keyed by the era just left. Per civ,
    // because each one crosses its own borders. See advanceEra().
    eraHistory: {},

    res: { food: CONFIG.startFood, wood: 0, stone: 0, copper: 0, tin: 0, bronze: 0,
           iron: 0, steel: 0, gold: 0 },
    // (`jobs` was removed 2026-08-25: the jobs system died in E2 and the bucket
    // rode along in every save for two months. Saves that still carry one keep
    // it -- state is inert, never deleted -- but nothing seeds or reads it.)
    // `builds` is likewise inert since the Construction panel retired: every
    // era declares an empty buildings list, and what you raise stands on a hex.
    // Kept so legacy counts land somewhere and Iron's migrations have a bucket.
    builds: { hut: 0, dryingRack: 0, lumberCamp: 0, stonePit: 0,
              infirmary: 0, barracks: 0, forge: 0, archeryRange: 0, stables: 0,
              warCamp: 0, musterGround: 0, siegeWorkshop: 0 },
    // Trained person-types owned; renders in Your People.
    units: { soldier: 0, archer: 0, horseman: 0, siegeEngine: 0 },
    upgrades: {},     // { [upgradeId]: true } -- presence means owned, one-time
    buildQueue: [],   // FIFO: [{ id, kind, uid, total, remaining, cost }] -- only [0] progresses
    buildSeq: 0,
    expeditions: [],
    // ARMIES ON THE BOARD. An army is an expedition that knows where it is
    // standing: it occupies a hex, can be seen on it, walked into, and fought
    // with the resolver rather than a strength number. p.units still counts
    // EVERY unit this civ owns, home or away; an army lists the subset that is
    // currently committed. See sim/armies.js.
    armies: [],  // { uid, type, adversary, units?, cargo?, total, remaining }

    // WHAT THIS CIV KNOWS OF THE BOARD. Knowledge, not board truth, which is
    // why it lives here and not on the world: a bot reading the true map is
    // cheating, and a bot reading YOUR map is broken. `revealed` is sticky --
    // ground once charted stays charted; `sighted` is live vision, recomputed
    // from what this civ currently holds.
    revealed: [],
    sighted: [],

    pop: CONFIG.startPop,   // MIRROR of the hex sums plus the standing army
    bought: 0,              // lifetime arrivals -- the game-over screen's one stat
    // (No per-civ `dead` yet: S.dead is the RUN's flag and the only one anything
    // reads. A civ-level one arrives when a bot can actually be eliminated --
    // adding it now would be a field nothing reads, which is a lie in waiting.)
  };
}

export function freshState() {
  // World and run state only. Anything belonging to a civilization lives in
  // `players` (see freshPlayer above).
  const seed = newSeed();
  return {
    // The world's number (phase 2): `seed` is the run's permanent identity,
    // shown on the game-over screen and logged at boot; `rngState` is the dice
    // stream's current position, advanced by every rng() draw and carried in
    // the save so a reload resumes the sequence mid-stream.
    seed,
    rngState: seed,

    // THE CIVILIZATIONS. Index 0 is the human today; `me` is which one the
    // interface is looking through, and it is a field rather than a constant
    // precisely so that "render from another seat's perspective" is a value
    // change and not a rewrite.
    players: [freshPlayer(0)],
    me: 0,

    // HOW MANY RIVAL PEOPLES THIS WORLD HAS (owner ruling, 2026-08-28, for the
    // human-vs-human playtests). `null` means "every one the era authors",
    // which is the default and what every save before this field carried; a
    // NUMBER caps the roster, and **0 means an empty world -- no majors, no
    // minor steadings, nothing but the players.**
    //
    // The reason is experimental design rather than difficulty: bots move on
    // their own schedules, and while they do, "does this play badly?" cannot
    // be asked cleanly. A baseline needs one variable. (Owner: *"they add more
    // variables than we need to establish a baseline of 'does it play bad?'"*)
    // It is a genuine tunable afterwards -- world density, chosen per run --
    // which is why it is a count and not a switch.
    //
    // Fixed for the run, like the continent and the colour: the roster is read
    // at boot and the seats are placed during generation.
    bots: null,

    // The living remnants of the world's adversaries: { [id]: { stock, standing } }.
    // The manifest entry is the template; this is what actually depletes.
    // (These become entries in `players` as the bots grow real economies --
    // the roadmap in the design brief, expressed as state.)
    adversaries: {},

    // The persisted half of the map: sub-seed, generator version, the tile noun
    // it was cut for, and the per-tile facts. Geometry is REGENERATED from the
    // seed at load -- a world is a number (map.md §2).
    map: null,
    // BATTLES IN PROGRESS (contact, A4): sim objects, global because a war
    // has two sides. Each row keeps its seal-time rosters and one drawn seed,
    // so a save mid-fight resumes the same dice. See sim/contact.js.
    battles: [],
    battleSeq: 0,
    tick: 0,          // the master clock: fixed TICK_SECONDS slices simulated -- see step()
    seen: {},         // reveal latches and one-time flags (interface state)
    dead: false,      // the RUN is over -- today, when the human falls
  };
}

// THE CIVILIZATION THE INTERFACE IS LOOKING THROUGH. Every read of player state
// goes through here rather than reaching into S, which is what makes "whose?"
// a visible question at each site instead of an assumption.
export function me() { return S.players[S.me]; }

// A civ by id, for the systems that already know whose turn it is.
export function playerById(id) { return S.players[id] || null; }

// A civ by its MANIFEST id -- how the three neighbours are named in content
// and referenced by every campaign, caravan and rim on the board. This is the
// bridge that let adversaries become players without rewriting the systems
// that talk to them by name.
export function playerByKey(key) {
  return S.players.find((p) => p.key === key) || null;
}

// Every civ that is not the human. Named for what it will keep meaning when
// one of them is another person rather than a bot.
export function rivals() { return S.players.filter((p) => p.key !== null); }

// ES-module live bindings are read-only from outside their home module; every
// cross-module reassignment of the mutables above goes through these.
export function setS(v) { S = v; }

// The two interval handles boot() starts and die() clears. They live here, not
// in main.js, so that no core module ever imports main -- main's body STARTS
// the game on evaluation, and an import edge into it from the sim would run
// boot() mid-link, before the manifests exist.
export let loopId = null, saveId = null;
export function setLoops(l, s) { loopId = l; saveId = s; }
