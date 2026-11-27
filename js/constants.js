const GROW_TIME = 90; // time in seconds for stars to reach max size
const SIMULATION_FPS = 60;
const SIMULATION_STEP_MS = 1000 / SIMULATION_FPS;
const MAX_FRAME_DELTA_MS = 250; // avoid a long catch-up after a suspended tab
const PLAYER_MAX_SPEED = 1200; // pixels per second
const MIN_SPAWN_INTERVAL = 5; // minimum simulation ticks between spawns
const MAX_SPAWN_INTERVAL = 90; // maximum simulation ticks between spawns
const SHARPNESS = 6; // controls how sharply the spawn interval changes as the screen fills up
const MAX_STARS = 30; // absolute max number of stars
const START_CENTER_BLOCK_W = 0.25;
const START_CENTER_BLOCK_H = 0.25;
const INITIAL_SPAWN_CLEARANCE = 10;

const DIFFICULTY_PRESETS = [
  { name: "Very Easy", factor: 0.8 },
  { name: "Easy", factor: 0.9 },
  { name: "Normal", factor: 1 },
  { name: "Hard", factor: 1.1 },
  { name: "Very Hard", factor: 1.2 }
];

const GAME_STAGES = ["playingStage0", "playingStage1"];
