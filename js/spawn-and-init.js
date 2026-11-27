function getRunOptions() {
  if (typeof window === "undefined") return {};
  const params = new URLSearchParams(window.location.search);
  const seed = params.get("seed");
  return {
    seed: seed !== null && /^\d+$/.test(seed) ? Number(seed) >>> 0 : undefined,
    fixture: params.get("fixture") === "scale"
  };
}

function startGame(options = getRunOptions()) {
  score = 0;
  runSeed = options.seed ?? Math.floor(random(4294967296));
  runTick = 0;
  simulationAccumulator = 0;
  currentFormIndex = 0;
  evolutionNotification = null;
  impactNotification = null;
  steering.armed = steering.engaged = false;
  steering.centerTicks = steering.rampTicks = 0;
  const form = EVOLUTION_FORMS[0];
  player = createBody("player", form.type, 0, 0, radiusForMass(form.mass), seededRandom(hashSeed(runSeed, "player", 0)));
  setBodyMass(player, form.mass);
  player.rotationSpeed = (seededRandom(hashSeed(runSeed, "spin"))() * 2 - 1) * 1.2;
  player.ax = player.ay = player.externalAx = player.externalAy = 0;
  player.gravityVx = player.gravityVy = player.driftAx = player.driftAy = 0;
  // Keep the existing generation namespace/configuration fixed throughout a run.
  world = createWorld(runSeed, 0, difficultyFactor, options.fixture);
  resetCamera();
  resetMovementVisuals();
  syncWorldRegions();
  updateGravitySources(true);
  syncEcology(true);
}
