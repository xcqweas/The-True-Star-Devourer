function getThreatVisual(enemyRadius, playerRadius) {
  const band = Math.max(1, OUTLINE_SIMILAR_RADIUS_RATIO);
  const ratio = enemyRadius / playerRadius;
  if (ratio >= 1 / band && ratio <= band) return { ring: [255, 215, 95, 240], glow: [240, 195, 50, 45] };
  if (ratio < 1 / band) return { ring: [92, 244, 176, 235], glow: [64, 205, 150, 45] };
  return { ring: [255, 112, 110, 240], glow: [230, 70, 80, 50] };
}

function drawThreatRing(body) {
  const visual = getThreatVisual(body.r, player.r, body);
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
  return sweptBodyContact(player, { x: playerStartX, y: playerStartY },
    body, { x: bodyStartX, y: bodyStartY }) !== null;
}

function playerMovementLimits(radius = player.r) {
  // Use settled zoom rather than current rendered zoom: easing/FPS cannot alter physics.
  const scale = constrain(PLAYER_SCREEN_TRAVEL_SPEED /
    (PLAYER_MAX_SPEED * targetZoomForRadius(radius)), 1, PLAYER_MAX_MOVEMENT_SCALE);
  return { scale, speed:PLAYER_MAX_SPEED * scale, acceleration:PLAYER_MAX_ACCELERATION * scale };
}

function steeringActivation(distance, rawStrength) {
  if (!steering.armed) {
    steering.centerTicks = distance <= STEERING_ARM_RADIUS ? steering.centerTicks + 1 : 0;
    if (steering.centerTicks >= STEERING_ARM_HOLD_TICKS) steering.armed = true;
    return 0; // the arming tick remains neutral
  }
  if (rawStrength > 0) steering.engaged = true;
  if (steering.engaged) steering.rampTicks = Math.min(STEERING_ACTIVATION_TICKS, steering.rampTicks + 1);
  const t = constrain(steering.rampTicks / Math.max(1, STEERING_ACTIVATION_TICKS), 0, 1);
  return t * t * (3 - 2 * t);
}

function accumulatePlayerForces(gravity = { ax: 0, ay: 0 }) {
  const dx = mouseX - width / 2;
  const dy = mouseY - height / 2;
  const distance = Math.hypot(dx, dy);
  const rawStrength = constrain((distance - STEERING_DEAD_ZONE) /
    (STEERING_MAX_DISTANCE - STEERING_DEAD_ZONE), 0, 1);
  const strength = rawStrength * steeringActivation(distance, rawStrength);
  const limits = playerMovementLimits();
  player.impactSpeedScale = limits.scale;
  const targetSpeed = limits.speed * strength;
  const targetVx = distance === 0 ? 0 : dx / distance * targetSpeed;
  const targetVy = distance === 0 ? 0 : dy / distance * targetSpeed;
  // Steering controls a drive component, rather than damping away gravity drift.
  const driveVx = player.vx - player.gravityVx;
  const driveVy = player.vy - player.gravityVy;
  let ax = (targetVx - driveVx) * PLAYER_STEERING_RESPONSE;
  let ay = (targetVy - driveVy) * PLAYER_STEERING_RESPONSE;
  const acceleration = Math.hypot(ax, ay);
  if (acceleration > limits.acceleration) {
    ax *= limits.acceleration / acceleration;
    ay *= limits.acceleration / acceleration;
  }
  let nextDriveX = driveVx + ax * SIMULATION_STEP_SECONDS;
  let nextDriveY = driveVy + ay * SIMULATION_STEP_SECONDS;
  const driveSpeed = Math.hypot(nextDriveX, nextDriveY);
  if (driveSpeed > limits.speed) {
    nextDriveX *= limits.speed / driveSpeed;
    nextDriveY *= limits.speed / driveSpeed;
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
  if (impactNotification && runTick >= impactNotification.expiresAtTick) impactNotification = null;
  updateCollisionContacts();
  syncWorldRegions();
  const ambient = syncEcology();
  const sources = updateGravitySources();
  const bodiesById = new Map(ambient.map(body => [body.id, body]));
  for (const body of star_objects) bodiesById.set(body.id, body);
  for (const { body } of sources) bodiesById.set(body.id, body);
  const tickBodies = [...bodiesById.values()];
  const starts = new Map(tickBodies.map(body => [body.id, { x: body.x, y: body.y }]));
  starts.set(player.id, { x: player.x, y: player.y });

  // Every acceleration reads the same tick-start positions. Integrate each body
  // once, including relevant offscreen prescribed sources, before collision tests.
  accumulatePlayerForces(gravityAcceleration(player, sources));
  for (const body of tickBodies) accumulateBodyForces(body, ecologyGravity(body));
  integrateBody(player);
  for (const body of tickBodies) integrateBody(body);
  world.ecologyStats.simulated = tickBodies.length + 1;
  resolveEcologyContacts([player, ...tickBodies], starts);
  followPlayer();
  recordMovementTrail();
  star_objects = star_objects.filter(body=>!world.consumedIds.has(body.id));
}

function drawGame() {
  const showThreatAssist = isThreatAssistEnabled();
  drawParallax();
  push();
  translate(width / 2, height / 2);
  scale(camera.zoom);
  translate(-camera.x, -camera.y);
  drawMovementTrail();
  drawMergeGhosts();
  let detailedCount = 0;
  for (const body of getRenderableBodies()) {
    push();
    drawingContext.globalAlpha *= backgroundBodyOpacity(body);
    const detailed = body.r * camera.zoom >= TINY_BODY_SCREEN_RADIUS && detailedCount < MAX_DETAILED_BODIES;
    if (detailed) {
      detailedCount++;
      if (showThreatAssist && !isLooseDebris(body)) drawThreatRing(body);
    }
    drawBody(body, false, detailed);
    pop();
  }
  drawBody(player, true);
  if (hasImpactGrace(player)) {
    push(); noFill(); stroke(210, 245, 255, 200); strokeWeight(1.5 / camera.zoom);
    circle(player.x, player.y, player.r * 2 + 12 / camera.zoom);
    pop();
  }
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
  const notice = gameplayNotification();
  if (notice) {
    const box = indicatorObstacles()[1];
    fill(8, 14, 25, 220); rect(box.x, box.y, box.w, box.h, 6);
    fill(255, 235, 170);
    textSize(impactNotification ? 14 : 20);
    textAlign(CENTER, CENTER);
    text(notice.text, width / 2, height * 0.8);
  }
  pop();
  drawHazardIndicators();
  if (!steering.armed) {
    push(); noFill(); stroke(130,200,245,180); strokeWeight(1);
    circle(width/2,height/2,STEERING_ARM_RADIUS*2);
    noStroke();fill(220,237,250);textSize(12);textAlign(CENTER,CENTER);
    text('Center cursor to steer',width/2,height/2+Math.min(48,height*0.24));
    pop();
  }
}
