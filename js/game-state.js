let gameState = "menu";

let player;
let star_objects = [];
let score = 0;
let runTick = 0;
let simulationAccumulator = 0;
let difficultyFactor = 1;
let selectedDifficultyIndex = 1;
let currentFormIndex = 0;
let pendingEvolutionIndex = null;
let evolutionNotification = null;
let impactNotification = null;
const steering = { armed:false, centerTicks:0, engaged:false, rampTicks:0 };

function gameplayNotification() { return impactNotification ?? evolutionNotification; }

let runSeed;
let world;
const camera = { x: 0, y: 0, zoom: CAMERA_MAX_ZOOM, targetZoom: CAMERA_MAX_ZOOM };
let movementVisuals;
