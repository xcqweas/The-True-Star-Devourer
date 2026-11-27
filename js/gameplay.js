function getThreatVisual(enemyRadius, playerRadius) {
  // Match the collision rule exactly: equal radius is lethal.
  if (enemyRadius < playerRadius) return { ring: [92, 244, 176, 235], glow: [64, 205, 150, 45] };
  return { ring: [255, 112, 110, 240], glow: [230, 70, 80, 50] };
}

function drawThreatRing(body) {
  const visual = getThreatVisual(body.r, player.r);
  const pulse = map(sin(frameCount * 0.08 + body.x * 0.01), -1, 1, 0.96, 1.06);
  push();
  noStroke();
  fill(...visual.glow);
  circle(body.x, body.y, body.r * 2.35);
  noFill();
  stroke(...visual.ring);
  strokeWeight(constrain(body.r * camera.zoom * 0.07, 1, 3) / camera.zoom);
  circle(body.x, body.y, (body.r * 2 + 8) * pulse);
  pop();
}

function isThreatAssistEnabled() { return selectedDifficultyIndex <= 1; }

function runGame() {
  simulationAccumulator += constrain(deltaTime, 0, MAX_FRAME_DELTA_MS);
  while (simulationAccumulator + 0.000001 >= SIMULATION_STEP_MS && gameState === "playing") {
    simulationAccumulator = max(0, simulationAccumulator - SIMULATION_STEP_MS);
    updateGame();
  }
  updateCamera(deltaTime / 1000);
  updateParallax();
  drawGame();
}

function bodiesCollidedDuringStep(playerStartX, playerStartY, bodyStartX, bodyStartY, body) {
  // Sweep relative world-space motion so neither body can tunnel between ticks.
  const startX = playerStartX - bodyStartX;
  const startY = playerStartY - bodyStartY;
  const moveX = (player.x - playerStartX) - (body.x - bodyStartX);
  const moveY = (player.y - playerStartY) - (body.y - bodyStartY);
  const lengthSquared = moveX * moveX + moveY * moveY;
  const t = lengthSquared === 0 ? 0 : constrain(-(startX * moveX + startY * moveY) / lengthSquared, 0, 1);
  const closestX = startX + moveX * t;
  const closestY = startY + moveY * t;
  const radius = player.r + body.r;
  return closestX * closestX + closestY * closestY < radius * radius;
}

function accumulatePlayerForces(gravity = { ax: 0, ay: 0 }) {
  const dx = mouseX - width / 2;
  const dy = mouseY - height / 2;
  const distance = Math.hypot(dx, dy);
  const strength = constrain((distance - STEERING_DEAD_ZONE) /
    (STEERING_MAX_DISTANCE - STEERING_DEAD_ZONE), 0, 1);
  const targetSpeed = PLAYER_MAX_SPEED * strength;
  const targetVx = distance === 0 ? 0 : dx / distance * targetSpeed;
  const targetVy = distance === 0 ? 0 : dy / distance * targetSpeed;
  // Steering controls a drive component, rather than damping away gravity drift.
  const driveVx = player.vx - player.gravityVx;
  const driveVy = player.vy - player.gravityVy;
  let ax = (targetVx - driveVx) * PLAYER_STEERING_RESPONSE;
  let ay = (targetVy - driveVy) * PLAYER_STEERING_RESPONSE;
  const acceleration = Math.hypot(ax, ay);
  if (acceleration > PLAYER_MAX_ACCELERATION) {
    ax *= PLAYER_MAX_ACCELERATION / acceleration;
    ay *= PLAYER_MAX_ACCELERATION / acceleration;
  }
  let nextDriveX = driveVx + ax * SIMULATION_STEP_SECONDS;
  let nextDriveY = driveVy + ay * SIMULATION_STEP_SECONDS;
  const driveSpeed = Math.hypot(nextDriveX, nextDriveY);
  if (driveSpeed > PLAYER_MAX_SPEED) {
    nextDriveX *= PLAYER_MAX_SPEED / driveSpeed;
    nextDriveY *= PLAYER_MAX_SPEED / driveSpeed;
  }
  if (strength === 0 && driveSpeed < 0.01) nextDriveX = nextDriveY = 0;

  const damping = PLAYER_GRAVITY_DAMPING + (PLAYER_BRAKE_DAMPING - PLAYER_GRAVITY_DAMPING) * (1 - strength) ** 2;
  const decay = Math.exp(-damping * SIMULATION_STEP_SECONDS);
  let nextDriftX = player.gravityVx * decay + (gravity.ax + player.externalAx) * SIMULATION_STEP_SECONDS;
  let nextDriftY = player.gravityVy * decay + (gravity.ay + player.externalAy) * SIMULATION_STEP_SECONDS;
  const driftSpeed = Math.hypot(nextDriftX, nextDriftY);
  if (driftSpeed > PLAYER_MAX_DRIFT_SPEED) {
    nextDriftX *= PLAYER_MAX_DRIFT_SPEED / driftSpeed;
    nextDriftY *= PLAYER_MAX_DRIFT_SPEED / driftSpeed;
  }
  if (strength === 0 && driftSpeed < 0.01 && gravity.ax === 0 && gravity.ay === 0 &&
    player.externalAx === 0 && player.externalAy === 0) nextDriftX = nextDriftY = 0;
  player.gravityAx = gravity.ax;
  player.gravityAy = gravity.ay;
  player.driftAx = (nextDriftX - player.gravityVx) / SIMULATION_STEP_SECONDS;
  player.driftAy = (nextDriftY - player.gravityVy) / SIMULATION_STEP_SECONDS;
  player.ax = (nextDriveX - driveVx) / SIMULATION_STEP_SECONDS + player.driftAx;
  player.ay = (nextDriveY - driveVy) / SIMULATION_STEP_SECONDS + player.driftAy;
}

function updateGame() {
  runTick++;
  if (evolutionNotification && runTick >= evolutionNotification.expiresAtTick) evolutionNotification = null;
  syncWorldRegions();
  const sources = updateGravitySources();
  const bodiesById = new Map(star_objects.map(body => [body.id, body]));
  for (const { body } of sources) bodiesById.set(body.id, body);
  const tickBodies = [...bodiesById.values()];
  const playerStartX = player.x;
  const playerStartY = player.y;
  const starts = new Map(tickBodies.map(body => [body.id, { x: body.x, y: body.y }]));

  // Every acceleration reads the same tick-start positions. Integrate each body
  // once, including relevant offscreen prescribed sources, before collision tests.
  accumulatePlayerForces(gravityAcceleration(player, sources));
  for (const body of tickBodies) accumulateBodyForces(body, sources);
  integrateBody(player);
  for (const body of tickBodies) integrateBody(body);
  followPlayer();
  recordMovementTrail();

  for (let i = tickBodies.length - 1; i >= 0; i--) {
    const body = tickBodies[i];
    const start = starts.get(body.id);

    if (bodiesCollidedDuringStep(playerStartX, playerStartY, start.x, start.y, body)) {
      if (player.r > body.r) {
        absorbBodyMass(body);
        consumeWorldBody(body);
        const activeIndex = star_objects.indexOf(body);
        if (activeIndex >= 0) star_objects.splice(activeIndex, 1);
        score++;
        if (gameState === "ending") return;
      } else {
        gameState = "gameover";
        return;
      }
    }
  }
}

function drawGame() {
  const showThreatAssist = isThreatAssistEnabled();
  drawParallax();
  push();
  translate(width / 2, height / 2);
  scale(camera.zoom);
  translate(-camera.x, -camera.y);
  drawMovementTrail();
  let detailedCount = 0;
  for (const body of getRenderableBodies()) {
    const detailed = body.r * camera.zoom >= TINY_BODY_SCREEN_RADIUS && detailedCount < MAX_DETAILED_BODIES;
    if (detailed) {
      detailedCount++;
      if (showThreatAssist) drawThreatRing(body);
    }
    drawBody(body, false, detailed);
  }
  drawBody(player, true);
  pop();

  // Draw last, outside the camera transform, so large planets cannot cover HUD.
  const hud = getHudBounds();
  push();
  rectMode(CORNER);
  noStroke(); fill(8, 14, 25, 210);
  rect(hud.x, hud.y, hud.w, hud.h, 6);
  fill(255);
  textAlign(LEFT, TOP);
  textSize(hud.short ? 11 : hud.compact ? 12 : 16);
  const x = hud.compact ? 16 : 20, y = hud.compact ? 14 : 20;
  const lineHeight = hud.compact ? 16 : 20;
  text("Time Passed: " + floor(runTick / SIMULATION_FPS), x, y);
  text("Score: " + score, hud.short ? 144 : x, hud.short ? y : y + lineHeight);
  text("Form: " + EVOLUTION_FORMS[currentFormIndex].label, x, y + lineHeight * (hud.short ? 1 : 2));
  text("Mass: " + formatMass(player.mass), hud.short ? 144 : x, y + lineHeight * (hud.short ? 1 : 3));
  const progress = getEvolutionProgress();
  text("Next: " + progress.label + " " + (progress.fraction * 100).toFixed(1) + "% / " + formatMass(progress.mass), x, y + lineHeight * (hud.short ? 2 : 4));
  noStroke();
  fill(60);
  const barY = hud.short ? 62 : hud.compact ? 100 : 124;
  const barWidth = Math.max(0, Math.min(180, hud.w - 24));
  rect(x, barY, barWidth, 6);
  fill(100, 190, 240);
  rect(x, barY, barWidth * progress.fraction, 6);
  if (evolutionNotification) {
    const box = indicatorObstacles()[1];
    fill(8, 14, 25, 220); rect(box.x, box.y, box.w, box.h, 6);
    fill(255, 235, 170);
    textSize(20);
    textAlign(CENTER, CENTER);
    text(evolutionNotification.text, width / 2, height * 0.8);
  }
  pop();
  drawHazardIndicators();
}
