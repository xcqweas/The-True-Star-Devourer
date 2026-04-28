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

function getInitialSpawnPosition(r) {
  let centerX = width / 2;
  let centerY = height / 2;
  let halfBlockW = (width * START_CENTER_BLOCK_W) / 2;
  let halfBlockH = (height * START_CENTER_BLOCK_H) / 2;

  for (let i = 0; i < 50; i++) {
    let x = random(r, width - r);
    let y = random(r, height - r);
    let inCenterBlock = abs(x - centerX) < halfBlockW && abs(y - centerY) < halfBlockH;
    if (!inCenterBlock) {
      return { x, y };
    }
  }

  // Fallback to corners if random sampling fails.
  let corner = floor(random(4));
  if (corner === 0) return { x: r, y: r };
  if (corner === 1) return { x: width - r, y: r };
  if (corner === 2) return { x: r, y: height - r };
  return { x: width - r, y: height - r };
}

function startGame(newGame = true) {
  if (newGame) {
    score = 0;
  }

  startFrame = frameCount;
  lastSpawnFrame = frameCount;

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
  let elapsed = (frameCount - startFrame) / 60; // time in seconds
  let growth = elapsed / GROW_TIME; // reaches highest after given time

  // Combine the factors, and game is slightly harder in later stages.
  let factor = difficultyFactor * growth + min(max(0, currentStageIndex * 0.05), 0.25);

  // Cap the growth factor to prevent excessively large stars in later stages.
  let minR = factor * 80 + 8;
  let maxR = factor * 160 + 30;
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
  } else if (edge === 1) {
    x = random(width);
    y = height + r;
    vx = random(-1, 1) * speed;
    vy = -speed;
  } else if (edge === 2) {
    x = -r;
    y = random(height);
    vx = speed;
    vy = random(-1, 1) * speed;
  } else {
    x = width + r;
    y = random(height);
    vx = -speed;
    vy = random(-1, 1) * speed;
  }

  star_objects.push({ x, y, r, vx, vy, entered: false, shape, shapeRadius: r, angle, rotationSpeed });
}
