let gameState = "menu";

let player;
let star_objects = [];
let score = 0;
let stageTick = 0;
let lastSpawnTick = 0;
let simulationAccumulator = 0;
let difficultyFactor = 1;
let selectedDifficultyIndex = 1;
let currentStageIndex = 0;

let currentMaxStars = MAX_STARS;
