let gameState = "menu";

let player;
let star_objects = [];
let score = 0;
let runTick = 0;
let simulationAccumulator = 0;
let difficultyFactor = 1;
let selectedDifficultyIndex = 1;
let currentFormIndex = 0;
let evolutionNotification = null;

let runSeed;
let world;
const camera = { x: 0, y: 0, zoom: CAMERA_MAX_ZOOM, targetZoom: CAMERA_MAX_ZOOM };
let movementVisuals;
