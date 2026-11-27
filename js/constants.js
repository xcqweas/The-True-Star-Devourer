const SIMULATION_FPS = 60;
const SIMULATION_STEP_MS = 1000 / SIMULATION_FPS;
const SIMULATION_STEP_SECONDS = 1 / SIMULATION_FPS;
const MAX_FRAME_DELTA_MS = 250; // avoid a long catch-up after a suspended tab
const CAMERA_MIN_ZOOM = 0.1; // pixels per world unit at the widest view
const CAMERA_MAX_ZOOM = 1;
const CAMERA_REFERENCE_RADIUS = 64; // grow visibly at full zoom before pulling back
const CAMERA_GROWTH_EXPONENT = 0.75; // below 1: apparent player size still grows
const CAMERA_ZOOM_RESPONSE = 0.9; // exponential response / second
const PLAYER_MAX_SPEED = 1200; // world units / second
const PLAYER_MAX_ACCELERATION = 6000; // world units / second squared
const PLAYER_STEERING_RESPONSE = 12; // velocity response / second (also brakes at center)
const STEERING_DEAD_ZONE = 12; // screen pixels
const STEERING_MAX_DISTANCE = 180; // screen pixels, independent of viewport size

// Selective gameplay gravity: acceleration is in world units / second squared.
const GRAVITY_ENABLED = true;
const GRAVITY_G = 500;
const GRAVITY_SOURCE_PROFILES = {
  moon: { enabled: true, strength: 0.3, reach: 1000 },
  planet: { enabled: true, strength: 1, reach: 3600 }
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
const PLAYER_MAX_DRIFT_SPEED = 1000; // below steering speed, retaining outward escape headroom

// Every body uses mass = MASS_SCALE * radius ^ MASS_RADIUS_EXPONENT.
// Defaults model constant-density 2D area; growth uses the inverse relationship.
const MASS_SCALE = 1;
const MASS_RADIUS_EXPONENT = 2;
const CONSUMPTION_MASS_GAIN = 1; // absorbed prey mass, divided by difficulty factor
const EVOLUTION_FORMS = [
  { type: "asteroid", label: "Asteroid", mass: 400 }, // initial radius 20
  { type: "moon", label: "Moon", mass: 14400 }, // radius 120
  { type: "planet", label: "Planet", mass: 1440000 } // radius 1200
];
const FINAL_MASS_MILESTONE = 4000000; // radius 2000; triggers the existing ending
const EVOLUTION_NOTICE_TICKS = 3 * SIMULATION_FPS;

const REGION_SIZE = 1024;
const ASTEROIDS_PER_REGION = 10;
const PLACEMENT_ATTEMPTS = 16;
const MAX_ASTEROID_RADIUS = 80;
const MAX_MOON_RADIUS = 240;
const MAX_PLANET_RADIUS = 1800;
const PLANET_CELL_REGIONS = 6;
const PLANET_ROUTE_GAP = 1024;
const LARGE_BODY_CLEARANCE = 320;
const START_SAFE_RADIUS = 300;
const ACTIVE_MARGIN = 512;
const MAX_REGION_REACH = 24; // at most 49 x 49 candidate regions at a time
const MAX_ACTIVE_BODIES = 1024;
const SIMULATION_HALF_WIDTH = 800; // physical activation, independent of camera/viewport
const SIMULATION_HALF_HEIGHT = 450;
const SIMULATION_PLAYER_REACH = 2;
const MAX_RENDER_BODIES = 1600;
const MAX_DETAILED_BODIES = 256;
const TINY_BODY_SCREEN_RADIUS = 2.5;
const PARALLAX_STARS_PER_LAYER = 70;
const TRAIL_MAX_POINTS = 64;
const TRAIL_LIFETIME_TICKS = 96;
const TRAIL_SAMPLE_TICKS = 2;
const TRAIL_MIN_SPEED = 10;

// Readability only; these values never enter the physical simulation.
const HAZARD_SCAN_RADIUS = 14000; // bounded world-space query, independent of zoom
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
