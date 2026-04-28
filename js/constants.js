const GROW_TIME = 90; // time in seconds for stars to reach max size
const MIN_SPAWN_INTERVAL = 5; // minimum frames between spawns even when the screen is empty
const MAX_SPAWN_INTERVAL = 90; // maximum frames between spawns when the screen is almost full
const SHARPNESS = 6; // controls how sharply the spawn interval changes as the screen fills up
const MAX_STARS = 30; // base max stars
const START_CENTER_BLOCK_W = 0.25;
const START_CENTER_BLOCK_H = 0.25;

const DIFFICULTY_PRESETS = [
  { name: "Easy", factor: 0.9 },
  { name: "Normal", factor: 1 },
  { name: "Hard", factor: 1.1 }
];

const GAME_STAGES = ["playingStage0", "playingStage1"];
