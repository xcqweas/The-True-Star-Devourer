const SIMULATION_FPS = 60;
const SIMULATION_STEP_MS = 1000 / SIMULATION_FPS;
const SIMULATION_STEP_SECONDS = 1 / SIMULATION_FPS;
const MAX_FRAME_DELTA_MS = 250; // avoid a long catch-up after a suspended tab
const CAMERA_MIN_ZOOM = 0.003; // includes a gas giant at the revised ending (radius 5600)
const CAMERA_MAX_ZOOM = 1;
const CAMERA_REFERENCE_RADIUS = 20; // start pulling back with the first growth
const CAMERA_GROWTH_EXPONENT = 0.96; // 100x physical radius gives about 1.2x screen radius
const CAMERA_ZOOM_RESPONSE = 10; // 95% of the log-zoom change in 0.3 seconds
const PLAYER_MAX_SPEED = 1080; // 10% gentler opening; world units / second
const PLAYER_MAX_ACCELERATION = 6000; // world units / second squared
const PLAYER_STEERING_RESPONSE = 12; // velocity response / second (also brakes at center)
const PLAYER_SCREEN_TRAVEL_SPEED = 300; // settled full-drive target before the world-speed bound
const PLAYER_MAX_MOVEMENT_SCALE = 64; // maintains apparent travel through the massive-planet stage
const STEERING_DEAD_ZONE = 12; // screen pixels
const STEERING_MAX_DISTANCE = 180; // screen pixels, independent of viewport size
const STEERING_ARM_RADIUS = 24; // return to the center after entering/restarting gameplay
const STEERING_ARM_HOLD_TICKS = Math.round(0.12 * SIMULATION_FPS);
const STEERING_ACTIVATION_TICKS = Math.round(0.4 * SIMULATION_FPS);

// Selective gameplay gravity: acceleration is in world units / second squared.
const GRAVITY_ENABLED = true;
const GRAVITY_G = 500;
const GRAVITY_SOURCE_PROFILES = {
  moon: { enabled: true, strength: 0.3, reach: 1000 },
  planet: { enabled: true, strength: 1, reach: 3600 },
  massiveSolid: { enabled: true, strength: 1, reach: 3600 },
  gasGiant: { enabled: true, strength: 1, reach: 3600 }
};
const GRAVITY_MAX_INFLUENCE = 6000; // center distance; hard query bound in world units
const GRAVITY_MIN_SOFTENING = 40;
const GRAVITY_SOFTENING_RATIO = 0.5; // source radius multiplier
const GRAVITY_FADE_START = 0.65; // smoothstep fade over the outer 35% of influence
const GRAVITY_MAX_SOURCE_ACCELERATION = 500;
const GRAVITY_MAX_ACCELERATION = 700; // cap the sum after combining all sources
const GRAVITY_MAX_RESPONDER_RADIUS = 80; // non-player asteroids only
const GRAVITY_SMALL_BODY_MAX_SPEED = 2000;
const GRAVITY_MAX_SOURCES = 64; // plus at most 64 outgoing sources fading away
const GRAVITY_SOURCE_FADE_SECONDS = 0.35;
const GRAVITY_SOURCE_WARMUP_MARGIN = 1024;
const PLAYER_GRAVITY_DAMPING = 0.12; // drift decay / second at full throttle
const PLAYER_BRAKE_DAMPING = 2.4; // center the mouse to brake drift more strongly
const PLAYER_MAX_DRIFT_SPEED = 880; // retains at least the opening's 200-unit outward headroom

// The base mass law models 2D area. Massive branches scale physical radius,
// without changing mass or mass-based feeding eligibility.
const MASS_SCALE = 1;
const MASS_RADIUS_EXPONENT = 2;
const ABSORPTION_MIN_MASS_RATIO = 1; // strictly exceed this ratio for sub-Moon meals
const ABSORPTION_MOON_MASS_RATIO = 3; // inclusive; 1.73x radius under the default mass law
const ABSORPTION_LARGE_MASS_RATIO = 64; // planet emitters retain the risky-raid threshold
const OUTLINE_SIMILAR_RADIUS_RATIO = 1.25; // reciprocal band around the player's physical radius
// Tune the new stage's required gain alongside its substantial raid targets.
const MASSIVE_PLANET_STAGE = {
  mass: 4000000,
  finalMass: 16000000,
  targetMinMass: 4000000,
  targetMaxMass: 6400000,
  targetChance: 0.24 // fraction of occupied planet cells; about one per seven cells overall
};
const MASSIVE_PLANET_BRANCHES = {
  massiveSolid: { label: "Massive solid planet", radiusScale: 0.85, impactLossScale: 0.6,
    strength: "Compact core: 40% less impact loss",
    weakness: "Smaller radius: narrower collection sweep" },
  gasGiant: { label: "Gas giant", radiusScale: 1.4, impactLossScale: 1.35,
    strength: "Wide sweep: 65% wider than solid",
    weakness: "Fragile envelope: 35% more impact loss" }
};
const EVOLUTION_FORMS = [
  { type: "asteroid", label: "Asteroid", mass: 400 }, // initial radius 20
  { type: "moon", label: "Moon", mass: 14400 }, // radius 120
  { type: "planet", label: "Planet", mass: 810000 }, // radius 900 (56.25x Moon entry mass)
  { type: "massivePlanet", label: "Massive planet", mass: MASSIVE_PLANET_STAGE.mass,
    choices: ["massiveSolid", "gasGiant"] }
];
const FINAL_MASS_MILESTONE = MASSIVE_PLANET_STAGE.finalMass;
const EVOLUTION_NOTICE_TICKS = 3 * SIMULATION_FPS;

// Cohesive Moon-mass pairs shed unless their disparity permits direct absorption.
const FRAGMENTATION_MIN_MASS = EVOLUTION_FORMS[1].mass;
const FRAGMENTATION_REFERENCE_SPEED = 900; // normal world speed at drive scale 1; scaled with controlled movement
const FRAGMENTATION_BASE_LOSS = 0.08;
const FRAGMENTATION_IMPACT_LOSS = 0.36;
const FRAGMENTATION_COMPARABLE_BONUS = 0.35; // calibrates equal-mass loss
const FRAGMENTATION_MASS_BIAS = 0.6; // per-participant other/self mass exponent
const FRAGMENTATION_MAX_LOSS = 0.8; // bounded again by available pieces to keep each own core largest
const FRAGMENTATION_PIECES = 5; // per participant; no recursive debris fragmentation
const FRAGMENTATION_SEPARATION = 60; // surface clearance after resolving an impact
const FRAGMENTATION_ESCAPE_SPEED = 240;
const FRAGMENTATION_RESTITUTION = 0.2;
const FRAGMENTATION_GRACE_TICKS = Math.round(2.5 * SIMULATION_FPS); // room to turn back toward fresh loot
const FRAGMENTATION_REARM_TICKS = Math.round(1.5 * SIMULATION_FPS);
const FRAGMENTATION_RELEASE_GAP = 100;
const DEBRIS_EJECTION_SPEED = 100;
const DEBRIS_DRAG = 2; // compact clouds; no expiry or collection-size gate
const DEBRIS_GRAVITY_DELAY_TICKS = 20 * SIMULATION_FPS;
const DEBRIS_HIGHLIGHT_TICKS = 20 * SIMULATION_FPS; // visible throughout the protected collection window
const DEBRIS_HIGHLIGHT_FADE_TICKS = 2 * SIMULATION_FPS;
const DEBRIS_COLLECTION_DELAY_TICKS = 12; // owned source-body recovery only; never blocks other collectors
const DEBRIS_SPACING = 16;
const DEBRIS_FAN_ANGLE = 2.2; // radians; two lateral lobes around the impact site

// Bounded ambient simulation; independent of camera zoom and rendering cadence.
const ECOLOGY_BACKGROUND_BODIES = 128;
const ECOLOGY_FADING_BODIES = 128;
const ECOLOGY_CONTINUITY_BODIES = 64; // reserved moving cores/sources, independent of player proximity
const ECOLOGY_MOVING_MIN_SPEED = 0.1; // ignore imperceptible source drift when reserving slots
const ECOLOGY_REFRESH_TICKS = 6;
const ECOLOGY_OPENING_FOOD_RADIUS = 1800;
const ECOLOGY_FADE_SECONDS = 0.6;
const ECOLOGY_SOURCES_PER_CELL = 32;
const ECOLOGY_COLLISION_CELL_SIZE = 256;
const ECOLOGY_MAX_PAIR_CHECKS = 12000;
const ECOLOGY_CONTACT_PASSES = 3;
const ECOLOGY_MAX_IMPACTS_PER_TICK = 4;
const ECOLOGY_SURFACE_CLEARANCE = 2;
const ECOLOGY_SURFACE_RESTITUTION = 0.08;
const ECOLOGY_SURFACE_RELEASE_SPEED = 180; // minimum outward relative speed; prevents resting stacks
const ECOLOGY_SURFACE_GRAVITY_HOLD_TICKS = Math.round(1.25 * SIMULATION_FPS);
const ECOLOGY_SURFACE_GRAVITY_FADE_TICKS = Math.round(0.5 * SIMULATION_FPS);
const ECOLOGY_MAX_RETIREMENTS = 8;
const ECOLOGY_RETIRE_NEIGHBORS = 64;
const MAX_WORLD_DEBRIS = 512;
const DEBRIS_PUBLIC_COLLECTION_TICKS = 0; // unrelated collectors can collect on the impact tick
const DEBRIS_RECLAIM_TICKS = 20 * SIMULATION_FPS; // neutral parents do not reclaim during a normal collection pass
const DEBRIS_MERGE_AGE_TICKS = 20 * SIMULATION_FPS;
const DEBRIS_MERGE_MAX_RADIUS = 24;
const DEBRIS_MERGED_MAX_RADIUS = 36;
const DEBRIS_MERGE_MAX_SPEED = 80;
const DEBRIS_MERGE_INTERVAL_TICKS = 15;
const DEBRIS_MAX_MERGES_PER_TICK = 8;
const DEBRIS_MERGE_FADE_TICKS = 30;
const DEBRIS_MAX_MERGE_GHOSTS = 32;

const REGION_SIZE = 1024;
const ASTEROIDS_PER_REGION = 10; // protected opening density
const ASTEROIDS_IN_FIELD_REGION = 20;
const ASTEROIDS_IN_TRAVEL_REGION = 2;
const ASTEROID_FIELD_CELL_REGIONS = 8;
const ASTEROID_FIELD_CHANCE = 0.7;
const ASTEROID_FIELD_RADIUS = 2400;
const ASTEROID_FIELD_FEATHER = 800;
const ASTEROID_FIELD_JITTER = 384; // at least 1024 units between neighboring field extents
const SPATIAL_OPENING_RADIUS = 2400; // retains ten placement attempts around accessible starting food
const SPATIAL_OPENING_FADE = 1200;
const MOON_REGION_CHANCE = 0.24;
const MOON_TRAVEL_DENSITY = 0.08; // isolated stepping stones between asteroid regions
const ASTEROID_MIN_RADIUS = 6;
const ASTEROID_RADIUS_SPREAD = 18; // previously 48; mean Normal food mass 688.8 -> 172.8
const ASTEROID_OUTER_RADIUS_SPREAD = 42; // larger existing food outside the protected opening
const ASTEROID_OUTER_START_DISTANCE = 8000; // fixed world distance, independent of player stage
const ASTEROID_OUTER_FADE_DISTANCE = 4000; // full outer spread at distance 12000
const PLACEMENT_ATTEMPTS = 16;
const MAX_ASTEROID_RADIUS = 80;
const MAX_MOON_RADIUS = 240;
const MAX_PLANET_RADIUS = 1800;
const MAX_LARGE_BODY_RADIUS = Math.max(MAX_PLANET_RADIUS,
  (MASSIVE_PLANET_STAGE.targetMaxMass / MASS_SCALE) ** (1 / MASS_RADIUS_EXPONENT) *
  Math.max(...Object.values(MASSIVE_PLANET_BRANCHES).map(branch => branch.radiusScale)));
const PLANET_CELL_REGIONS = 24;
const PLANET_CELL_CHANCE = 0.6;
const PLANET_ROUTE_GAP = 6144; // gap between complete planetary systems, not just planet surfaces
const SYSTEM_MOON_MIN_COUNT = 2;
const SYSTEM_MOON_MAX_COUNT = 4;
const SYSTEM_MOON_MIN_GAP = 1300; // planet-to-moon surface gap
const SYSTEM_MOON_MAX_GAP = 2500;
const SYSTEM_ASTEROID_DENSITY = 0.15; // sparse approaches around planetary landmarks
const LARGE_BODY_CLEARANCE = 320;
const START_SAFE_RADIUS = 300;
const ACTIVE_MARGIN = 512;
const MAX_REGION_REACH = 24; // at most 49 x 49 candidate regions at a time
const MAX_BACKGROUND_CELL_REACH = 32; // distant stationary planets, at most 65 x 65 cells
const MAX_ACTIVE_BODIES = 1024;
const SIMULATION_HALF_WIDTH = 800; // physical activation, independent of camera/viewport
const SIMULATION_HALF_HEIGHT = 450;
const SIMULATION_PLAYER_REACH = 2;
const MAX_RENDER_BODIES = 1600;
const MAX_DETAILED_BODIES = 256;
const TINY_BODY_SCREEN_RADIUS = 2.5;
const BACKGROUND_MIN_SCREEN_RADIUS = 0.6; // distant bodies fade out below this size
const BACKGROUND_FULL_SCREEN_RADIUS = 3; // fully visible above this size
const BACKGROUND_DENSITY_RESPONSE = 3; // relative scale response / second, including rapid growth
const BACKGROUND_FOOD_CLEARANCE = 512; // full visibility near the player's surface
const BACKGROUND_FOOD_FADE_DISTANCE = 1024;
const BACKGROUND_DETAIL_FADE_DISTANCE = 2 * REGION_SIZE; // fade before local generation ends
const PARALLAX_STARS_PER_LAYER = 70;
const TRAIL_MAX_POINTS = 64;
const TRAIL_LIFETIME_TICKS = 96;
const TRAIL_SAMPLE_TICKS = 2;
const TRAIL_MIN_SPEED = 10;

// Readability only; these values never enter the physical simulation.
const HAZARD_SCAN_RADIUS = 14000; // minimum world query; grown movement extends bounded planet queries
const HAZARD_BASE_CLEARANCE = 180;
const HAZARD_RADIUS_PADDING = 0.2;
const HAZARD_REACTION_SECONDS = 2.4;
const HAZARD_ASSIST_REACTION_SECONDS = 3.2;
const HAZARD_WARNING_DECELERATION = 3000; // conservative braking estimate, world units/s²
const HAZARD_GRAVITY_PADDING = 900;
const HAZARD_MIN_CLOSING_SPEED = 25;
const HAZARD_MAX_INDICATORS = 3;
const HAZARD_EDGE_MARGIN = 26;
const PULL_CUE_THRESHOLD = 45;

const DIFFICULTY_PRESETS = [
  { name: "Very Easy", factor: 0.8 },
  { name: "Easy", factor: 0.9 },
  { name: "Normal", factor: 1 },
  { name: "Hard", factor: 1.1 },
  { name: "Very Hard", factor: 1.2 }
];
