// Shared Node/browser fixture. Uses real steering, impacts and collection at late-game scale.
function loadMassiveStageScenario(branch = "massiveSolid") {
  selectedDifficultyIndex = 2; difficultyFactor = 1;
  startGame({ seed: 94851, fixture: true });
  world = createWorld(runSeed, 0, difficultyFactor, true);
  world.regions.clear(); world.sourceRegions.clear();
  gameState = "playing";
  steering.armed = steering.engaged = true; steering.rampTicks = STEERING_ACTIVATION_TICKS;
  setBodyMass(player, MASSIVE_PLANET_STAGE.mass);
  updatePlayerEvolution();
  choosePlayerEvolution(branch);
  resetCamera(); resetMovementVisuals();
  const route = { branch, phase: "ready", encounters: 0, meals: 0, originalPlayer: player,
    originalWorld: world, totalMass: player.mass, massError: 0, impactCount: 0, recoveries: [],
    peakPairs: 0, peakBodies: 0, peakDebris: 0, elapsed: 0 };
  addMassiveStageEncounter(route);
  return route;
}

function addMassiveStageEncounter(route) {
  // Alternate target branches; use real configured target masses. Keep prior
  // remnants in the world and approach away from the previous encounter.
  const type = route.encounters % 2 ? "massiveSolid" : "gasGiant";
  const mass = MASSIVE_PLANET_STAGE.targetMaxMass;
  const r = radiusForMass(mass) * bodyRadiusScale(type);
  const old = route.target;
  const angle = old ? Math.atan2(player.y - old.y, player.x - old.x) : 0;
  const distance = player.r + r + 12000;
  const target = createBody("massive-route:" + route.encounters, type,
    player.x + Math.cos(angle) * distance, player.y + Math.sin(angle) * distance,
    r, seededRandom(route.encounters + 56));
  setBodyMass(target, mass);
  storeWorldBody(world, target);
  route.target = target; route.encounters++; route.totalMass += target.mass;
  route.beforeMass = player.mass; route.impactTick = null; route.fragments = [];
  route.phase = "approach";
  syncWorldRegions(); updateGravitySources(true); syncEcology(true);
}

function steerMassiveStageScenario(route) {
  let target = route.target;
  let speed = playerMovementLimits().speed;
  if (route.phase === "escape") {
    const dx = player.x - target.x, dy = player.y - target.y, length = Math.hypot(dx, dy);
    target = { x: player.x + dx / length * 10000, y: player.y + dy / length * 10000 };
    if (runTick - route.impactTick >= 24) route.phase = "collect";
  } else if (route.phase === "collect") {
    const fragments = route.fragments.filter(body => residentBody(body) && canCollectDebris(player, body));
    fragments.sort((a, b) => (Math.hypot(a.x - player.x, a.y - player.y) - a.r) -
      (Math.hypot(b.x - player.x, b.y - player.y) - b.r) || a.id.localeCompare(b.id));
    target = fragments[0];
    if (!target) { mouseX = width / 2; mouseY = height / 2; return; }
    speed = Math.min(speed * 0.3, Math.hypot(target.x - player.x, target.y - player.y) * 3);
  }
  const dx = target.x - player.x, dy = target.y - player.y, distance = Math.hypot(dx, dy);
  const vx = (distance ? dx / distance * speed : 0) - player.gravityVx;
  const vy = (distance ? dy / distance * speed : 0) - player.gravityVy;
  const drive = Math.hypot(vx, vy);
  const pixels = STEERING_DEAD_ZONE + (STEERING_MAX_DISTANCE - STEERING_DEAD_ZONE) *
    Math.min(1, drive / playerMovementLimits().speed);
  mouseX = width / 2 + (drive ? vx / drive * pixels : 0);
  mouseY = height / 2 + (drive ? vy / drive * pixels : 0);
}

function observeMassiveStageScenario(route) {
  if (route.impactTick === null && world.nextImpactId > route.impactCount) {
    route.impactTick = runTick; route.retainedMass = player.mass; route.phase = "escape";
    route.fragments = [...world.debris.values()];
  }
  route.impactCount = world.nextImpactId;
  const total = player.mass + [...world.regions.values()].flatMap(bucket => [...bucket.values()])
    .reduce((sum, body) => sum + body.mass, 0);
  route.massError = Math.max(route.massError, Math.abs(total - route.totalMass));
  route.peakPairs = Math.max(route.peakPairs, world.ecologyStats.pairChecks);
  route.peakBodies = Math.max(route.peakBodies, world.ecologyStats.simulated);
  route.peakDebris = Math.max(route.peakDebris, world.debris.size);
  route.elapsed = runTick / SIMULATION_FPS;
  if (route.phase === "collect" && route.fragments.every(body => !residentBody(body))) {
    route.recoveries.push({ before: route.beforeMass, retained: route.retainedMass, after: player.mass,
      tick: runTick, targetType: route.target.type });
    route.phase = "recovered";
  }
  if (gameState === "ending") route.phase = "ending";
}
