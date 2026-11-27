// Deterministic play route shared by Node and visual-integration.html only.
function loadIntegrationScenario() {
  selectedDifficultyIndex = 2;
  difficultyFactor = 1;
  startGame({ seed: 1948, fixture: true });
  world.regions.clear(); world.gravitySources.clear();
  const route = { foods: [], next: 0, phase: "feed", peakPull: 0, warnings: 0,
    evolved: false, passClearance: Infinity, world, seed: runSeed };
  let predictedMass = player.mass, x = 360;
  for (let i = 0; i < 10; i++) {
    const radius = radiusForMass(predictedMass) * 0.8;
    const food = createBody("route:food:" + i, "asteroid", x, 0, radius, seededRandom(i + 1));
    storeWorldBody(world, food); route.foods.push(food);
    predictedMass += food.mass;
    x += Math.max(320, (radiusForMass(predictedMass) + radius) * 2 + 80);
  }
  route.planet = createBody("route:planet", "planet", 10000, 2200, 1800, seededRandom(71));
  storeWorldBody(world, route.planet);
  syncWorldRegions(); updateGravitySources(true); resetCamera(); resetMovementVisuals();
  gameState = "playing";
  return route;
}

function steerIntegrationScenario(route) {
  while (route.next < route.foods.length && world.consumedIds.has(route.foods[route.next].id)) route.next++;
  if (route.next === route.foods.length && route.phase === "feed") route.phase = "pass";
  if (route.phase === "pass" && Math.hypot(player.x - 10000, player.y + 1000) < 35) route.phase = "impact";
  const target = route.phase === "feed" ? route.foods[route.next] :
    route.phase === "pass" ? { x: 10000, y: -1000 } : route.planet;
  const dx = target.x - player.x, dy = target.y - player.y;
  const distance = Math.hypot(dx, dy);
  const speed = Math.min(900, distance * 3);
  // Test-only waypoint controller uses the exact same screen throttle as a mouse.
  const driveX = (distance ? dx / distance * speed : 0) - player.gravityVx;
  const driveY = (distance ? dy / distance * speed : 0) - player.gravityVy;
  const driveSpeed = Math.hypot(driveX, driveY);
  const pixels = STEERING_DEAD_ZONE + (STEERING_MAX_DISTANCE - STEERING_DEAD_ZONE) * Math.min(1, driveSpeed / PLAYER_MAX_SPEED);
  mouseX = width / 2 + (driveSpeed ? driveX / driveSpeed * pixels : 0);
  mouseY = height / 2 + (driveSpeed ? driveY / driveSpeed * pixels : 0);
}

function observeIntegrationScenario(route) {
  route.peakPull = Math.max(route.peakPull, Math.hypot(player.gravityAx, player.gravityAy));
  route.warnings = Math.max(route.warnings, collectHazardWarnings().length);
  route.evolved ||= player.type === "moon";
  if (route.phase === "pass") route.passClearance = Math.min(route.passClearance,
    Math.hypot(player.x - route.planet.x, player.y - route.planet.y) - player.r - route.planet.r);
}
