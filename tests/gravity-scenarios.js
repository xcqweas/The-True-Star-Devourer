// Shared by Node tests and visual-gravity.html; not loaded by the game entry point.
function loadGravityScenario(name) {
  const scenarios = {
    one: {
      player: [-1100, 0, 0, 0], steering: [0, 0], ticks: 120,
      bodies: [["planet", 0, 0, 600, 0, 0], ["asteroid", -900, -500, 12, 100, 80]]
    },
    multiple: {
      player: [0, 0, 0, 0], steering: [0, 0], ticks: 120,
      bodies: [["planet", 1000, 450, 600, 0, 0], ["moon", -850, -350, 240, 0, 0],
        ["asteroid", -400, 600, 12, 120, -100]]
    },
    close: {
      player: [-1800, -1100, 1000, 0], steering: [180, 0], ticks: 240,
      bodies: [["planet", 0, 0, 600, 0, 0], ["asteroid", -1400, -1250, 12, 800, 0]]
    },
    escape: {
      player: [760, 0, -180, 0], drift: [-180, 0], steering: [180, 0], ticks: 300,
      bodies: [["planet", 0, 0, 600, 0, 0], ["asteroid", 1000, 500, 12, 0, 120]]
    }
  };
  const scenario = scenarios[name];
  if (!scenario) throw new Error("Unknown gravity scenario: " + name);
  startGame({ seed: 721, fixture: true });
  world.regions.clear();
  world.gravitySources.clear();
  [player.x, player.y, player.vx, player.vy] = scenario.player;
  [player.gravityVx, player.gravityVy] = scenario.drift ?? [0, 0];
  scenario.bodies.forEach(([type, x, y, r, vx, vy], index) => {
    const id = `gravity:${name}:${index}`;
    storeWorldBody(world, createBody(id, type, x, y, r, seededRandom(hashSeed(721, id)), vx, vy));
  });
  syncWorldRegions();
  updateGravitySources(true);
  resetCamera();
  resetMovementVisuals();
  gameState = "playing";
  steerGravityScenario(scenario);
  return scenario;
}

function steerGravityScenario(scenario) {
  mouseX = width / 2 + scenario.steering[0];
  mouseY = height / 2 + scenario.steering[1];
}
