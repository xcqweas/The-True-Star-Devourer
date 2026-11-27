function getSpawnInterval() {
  let fillRatio = star_objects.length / currentMaxStars;

  // Change the shape of the curve.
  let shaped = 0.5 + 0.5 * Math.tanh((fillRatio - 0.5) * SHARPNESS);

  return lerp(MIN_SPAWN_INTERVAL, MAX_SPAWN_INTERVAL, shaped);
}

function initializeAdaptiveMaxStars() {
  // Scale star cap by canvas area relative to the original 1600x900 baseline.
  let baselineArea = 1600 * 900;
  let currentArea = width * height;
  let areaScale = currentArea / baselineArea;

  // Keep at least 8 stars and never exceed the configured absolute cap.
  currentMaxStars = constrain(round(MAX_STARS * areaScale), 8, MAX_STARS);
}

function getMaxStarRadius() {
  // Leave room for a body to enter and move even on a narrow canvas.
  return min(width, height) / 4;
}

function constrainBodyToCanvas(body) {
  const marginX = min(body.r, width / 2);
  const marginY = min(body.r, height / 2);
  body.x = constrain(body.x, marginX, width - marginX);
  body.y = constrain(body.y, marginY, height - marginY);
}

function resizeGameBodies(previousWidth, previousHeight) {
  initializeAdaptiveMaxStars();
  if (!player) return;

  const scaleX = width / max(1, previousWidth);
  const scaleY = height / max(1, previousHeight);
  player.x *= scaleX;
  player.y *= scaleY;
  constrainBodyToCanvas(player);

  star_objects = star_objects.slice(0, currentMaxStars);
  for (const body of star_objects) {
    body.x *= scaleX;
    body.y *= scaleY;
    body.r = min(body.r, getMaxStarRadius());
    constrainBodyToCanvas(body);
    body.entered = true;
  }
}

function getInitialSpawnPosition(r) {
  let centerX = width / 2;
  let centerY = height / 2;
  let halfBlockW = (width * START_CENTER_BLOCK_W) / 2;
  let halfBlockH = (height * START_CENTER_BLOCK_H) / 2;

  function isSafePosition(x, y) {
    const inCenterBlock = abs(x - centerX) < halfBlockW && abs(y - centerY) < halfBlockH;
    const clearance = player.r + r + INITIAL_SPAWN_CLEARANCE;
    return !inCenterBlock && dist(x, y, player.x, player.y) >= clearance;
  }

  for (let i = 0; i < 50; i++) {
    let x = random(r, width - r);
    let y = random(r, height - r);
    if (isSafePosition(x, y)) {
      return { x, y };
    }
  }

  // Check corners too, but skip the spawn if this canvas has no safe position.
  const corners = [
    { x: r, y: r },
    { x: width - r, y: r },
    { x: r, y: height - r },
    { x: width - r, y: height - r }
  ];
  let corner = floor(random(4));
  for (let i = 0; i < corners.length; i++) {
    const position = corners[(corner + i) % corners.length];
    if (isSafePosition(position.x, position.y)) return position;
  }
  return null;
}

function startGame(newGame = true) {
  if (newGame) {
    score = 0;
  }

  stageTick = 0;
  lastSpawnTick = 0;
  simulationAccumulator = 0;

  player = {
    x: width / 2,
    y: height / 2,
    r: 20,
    angle: random(TWO_PI),
    rotationSpeed: random(-0.02, 0.02),
    shapeRadius: 20,
    shape: makeShapeForCurrentStage(20)
  };

  star_objects = [];

  let initialStars = min(20, currentMaxStars);
  for (let i = 0; i < initialStars; i++) {
    spawnStar(true);
  }
}

function spawnStar(initial = false) {
  // Radius range grows with elapsed time.
  let elapsed = stageTick / SIMULATION_FPS;
  let growth = constrain(elapsed / GROW_TIME, 0, 1);

  // Combine the factors, and game is slightly harder in later stages.
  let factor = difficultyFactor * growth + min(max(0, currentStageIndex * 0.05), 0.25);

  // Both ends of the range must fit the current canvas.
  let minR = min(factor * 80 + 8, getMaxStarRadius());
  let maxR = min(factor * 160 + 30, getMaxStarRadius());
  let r = random(minR, maxR);

  // Smaller stars tend to move faster, but all new stars spawn faster as time goes on.
  let speed = random(1 + factor, 2 + factor) * (25 / r);
  let x;
  let y;
  let vx;
  let vy;
  let shape = makeShapeForCurrentStage(r);
  let angle = random(TWO_PI);
  let rotationSpeed = random(-1, 1) * (0.5 / r);

  if (initial) {
    // Place at startup away from the center area to avoid immediate collisions.
    let spawnPos = getInitialSpawnPosition(r);
    if (!spawnPos) return;
    x = spawnPos.x;
    y = spawnPos.y;
    let initialAngle = random(TWO_PI);
    vx = cos(initialAngle) * speed;
    vy = sin(initialAngle) * speed;
    star_objects.push({ x, y, r, vx, vy, entered: true, shape, shapeRadius: r, angle, rotationSpeed });
    return;
  }

  // Enter from a random edge, velocity points inward.
  let edge = floor(random(4));
  if (edge === 0) {
    x = random(width);
    y = -r;
    vx = random(-1, 1) * speed;
    vy = speed;
  } 
  
  else if (edge === 1) {
    x = random(width);
    y = height + r;
    vx = random(-1, 1) * speed;
    vy = -speed;
  } 
  
  else if (edge === 2) {
    x = -r;
    y = random(height);
    vx = speed;
    vy = random(-1, 1) * speed;
  } 
  
  else {
    x = width + r;
    y = random(height);
    vx = -speed;
    vy = random(-1, 1) * speed;
  }

  star_objects.push({ x, y, r, vx, vy, entered: false, shape, shapeRadius: r, angle, rotationSpeed });
}
