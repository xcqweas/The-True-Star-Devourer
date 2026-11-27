// Shared deterministic encounters for Node and visual-fragmentation.html only.
function loadFragmentationScenario(name) {
  const targetRadii = { smaller: 140, comparable: 240, larger: 1200 };
  const radius = targetRadii[name];
  if (!radius) throw new Error("Unknown fragmentation encounter: " + name);
  selectedDifficultyIndex = 2; difficultyFactor = 1;
  startGame({ seed: 8451, fixture: true });
  steering.armed = steering.engaged = true; steering.rampTicks = STEERING_ACTIVATION_TICKS;
  world.regions.clear(); world.gravitySources.clear();
  setBodyMass(player, massForRadius(240)); updatePlayerEvolution();
  player.x = -radius - player.r - 180;
  player.vx = playerMovementLimits().speed;
  player.impactSpeedScale = playerMovementLimits().scale;
  const target = createBody("encounter:" + name, radius >= 1200 ? "planet" : "moon",
    0, 0, radius, seededRandom(81));
  storeWorldBody(world, target);
  syncWorldRegions(); updateGravitySources(true); resetCamera(); resetMovementVisuals();
  gameState = "playing";
  return { name, target, originalPlayer: player, initialMass: player.mass,
    totalMass: player.mass + target.mass, phase: "approach", impactTick: null,
    afterImpactMass: null, collectedMass: 0, collectedTargetMass: 0,
    escapeGap: null, minimumGap: Infinity, collectionTarget: null };
}

function steerFragmentationScenario(route) {
  if (route.phase === "approach") {
    mouseX = width / 2 + STEERING_MAX_DISTANCE; mouseY = height / 2; return;
  }
  if (route.phase === "escape" && runTick - route.impactTick < 45) {
    mouseX = width / 2 - STEERING_MAX_DISTANCE; mouseY = height / 2; return;
  }
  if (route.phase === "escape") {
    route.phase = "collect";
    route.escapeGap = Math.hypot(player.x-route.target.x, player.y-route.target.y)-player.r-route.target.r;
  }
  const debris = [...world.regions.values()].flatMap(bucket => [...bucket.values()])
    .filter(body => isLooseDebris(body));
  const available = debris.filter(body=>canCollectDebris(player,body));
  const preferred = available.filter(body => body.originId === route.target.originId);
  const candidates = preferred.length ? preferred : available;
  if (!debris.length) { route.phase = "done"; mouseX = width / 2; mouseY = height / 2; return; }
  // Stable nearest waypoint, using the same screen-space throttle as a mouse.
  if (!route.collectionTarget || !canCollectDebris(player,route.collectionTarget) || world.consumedIds.has(route.collectionTarget.id)) {
    candidates.sort((a,b) => Math.hypot(a.x-player.x,a.y-player.y)-Math.hypot(b.x-player.x,b.y-player.y) || a.id.localeCompare(b.id));
    route.collectionTarget = candidates[0];
  }
  const target = route.collectionTarget ?? {x:player.x,y:player.y};
  const dx = target.x - player.x, dy = target.y - player.y, distance = Math.hypot(dx,dy);
  const speed = Math.min(650, distance * 3);
  const driveX = (distance ? dx / distance * speed : 0) - player.gravityVx;
  const driveY = (distance ? dy / distance * speed : 0) - player.gravityVy;
  const drive = Math.hypot(driveX,driveY);
  const pixels = STEERING_DEAD_ZONE + (STEERING_MAX_DISTANCE - STEERING_DEAD_ZONE) * Math.min(1,drive/playerMovementLimits().speed);
  mouseX = width/2 + (drive ? driveX/drive*pixels : 0);
  mouseY = height/2 + (drive ? driveY/drive*pixels : 0);
}

function observeFragmentationScenario(route) {
  if (world.nextImpactId > 0 && route.impactTick === null) {
    route.impactTick = runTick; route.afterImpactMass = player.mass; route.phase = "escape";
    route.fragments = [...world.regions.values()].flatMap(bucket => [...bucket.values()]).filter(isLooseDebris);
  }
  if (route.impactTick !== null) {
    const collected = route.fragments.filter(body => world.consumedIds.has(body.id));
    route.collectedMass = collected.reduce((mass, body) => mass + body.mass, 0);
    route.collectedTargetMass = collected.filter(body => body.originId === route.target.originId).reduce((mass,body)=>mass+body.mass,0);
    route.minimumGap = Math.min(route.minimumGap,
      Math.hypot(player.x-route.target.x, player.y-route.target.y)-player.r-route.target.r);
  }
}

function steerFragmentationDeparture(route) {
  route.departure ??= { tick:runTick, x:route.target.x, y:route.target.y,
    vx:route.target.vx, vy:route.target.vy };
  route.phase = runTick - route.departure.tick >= 10 * SIMULATION_FPS ? 'departed' : 'depart';
  mouseX = width/2 - STEERING_MAX_DISTANCE; mouseY = height/2;
}
