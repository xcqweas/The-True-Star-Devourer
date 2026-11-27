function getThreatVisual(enemyRadius, playerRadius) {
  const ratio = enemyRadius / max(playerRadius, 0.001);

  if (ratio < 0.92) {
    return {
      ring: [92, 244, 176, 235],
      glow: [64, 205, 150, 45]
    };
  }

  if (ratio <= 1.08) {
    return {
      ring: [255, 214, 110, 245],
      glow: [255, 191, 90, 55]
    };
  }

  return {
    ring: [255, 112, 110, 240],
    glow: [230, 70, 80, 50]
  };
}

function drawThreatRing(body) {
  const visual = getThreatVisual(body.r, player.r);
  const pulse = map(sin(frameCount * 0.08 + body.x * 0.01), -1, 1, 0.96, 1.06);
  const glowDiameter = body.r * 2.35;
  const ringDiameter = (body.r * 2 + 8) * pulse;

  push();
  noStroke();
  fill(visual.glow[0], visual.glow[1], visual.glow[2], visual.glow[3]);
  circle(body.x, body.y, glowDiameter);

  noFill();
  stroke(visual.ring[0], visual.ring[1], visual.ring[2], visual.ring[3]);
  strokeWeight(constrain(body.r * 0.07, 1.5, 4));
  circle(body.x, body.y, ringDiameter);
  pop();
}

function isThreatAssistEnabled() {
  return selectedDifficultyIndex <= 1;
}

function runGame() {
  simulationAccumulator += constrain(deltaTime, 0, MAX_FRAME_DELTA_MS);
  while (simulationAccumulator + 0.000001 >= SIMULATION_STEP_MS && GAME_STAGES.includes(gameState)) {
    simulationAccumulator = max(0, simulationAccumulator - SIMULATION_STEP_MS);
    updateGame();
  }

  drawGame();
}

function bodiesCollidedDuringStep(playerStartX, playerStartY, bodyStartX, bodyStartY, body) {
  // Sweep relative motion so neither body can skip a collision between ticks.
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

function updateGame() {
  stageTick++;
  const playerStartX = player.x;
  const playerStartY = player.y;

  // Move player toward mouse.
  let dx = mouseX - player.x;
  let dy = mouseY - player.y;
  const distance = Math.hypot(dx, dy);
  const moveScale = distance === 0 ? 0 : min(0.05, PLAYER_MAX_SPEED / SIMULATION_FPS / distance);
  player.x += dx * moveScale;
  player.y += dy * moveScale;
  constrainBodyToCanvas(player);
  player.angle += player.rotationSpeed;

  // Respawn stars over time.
  if (stageTick - lastSpawnTick >= getSpawnInterval() && star_objects.length < currentMaxStars) {
    spawnStar();
    lastSpawnTick = stageTick;
  }

  // Move and resolve collisions before rendering.
  for (let i = star_objects.length - 1; i >= 0; i--) {
    let f = star_objects[i];
    const bodyStartX = f.x;
    const bodyStartY = f.y;

    f.x += f.vx;
    f.y += f.vy;
    f.angle += f.rotationSpeed;
    const escaped = !f.entered && (f.x + f.r < 0 || f.x - f.r > width || f.y + f.r < 0 || f.y - f.r > height);

    // Bounce once fully on-screen.
    if (!f.entered) {
      if (f.x - f.r >= 0 && f.x + f.r <= width && f.y - f.r >= 0 && f.y + f.r <= height) {
        f.entered = true;
      }
    } else {
      if (f.x - f.r < 0) f.vx = abs(f.vx);
      else if (f.x + f.r > width) f.vx = -abs(f.vx);
      if (f.y - f.r < 0) f.vy = abs(f.vy);
      else if (f.y + f.r > height) f.vy = -abs(f.vy);
      constrainBodyToCanvas(f);
    }

    if (bodiesCollidedDuringStep(playerStartX, playerStartY, bodyStartX, bodyStartY, f)) {
      if (player.r > f.r) {
        // Harder difficulties grow less per eaten star, vice versa
        player.r += f.r * 0.05 / difficultyFactor;
        star_objects.splice(i, 1);
        score += 1;

        if (score % 60 === 0) {
          gameState = "progress";
          return;
        }
      } 
      
      else {
        gameState = "gameover";
        return;
      }
    } else if (escaped) {
      // Free missed entry slots after checking for any collision along the path.
      star_objects.splice(i, 1);
    }
  }
}

function drawGame() {
  const palette = getStagePalette();
  const showThreatAssist = isThreatAssistEnabled();

  fill(255);
  textAlign(LEFT, TOP);
  textSize(16);
  text("Time Passed: " + floor(stageTick / SIMULATION_FPS), 20, 20);
  text("Score: " + score, 20, 40);
  text("Stage: " + (currentStageIndex + 1), 20, 60);

  drawBodyForCurrentStage(player, palette.playerBase, palette.playerDetail);
  for (const body of star_objects) {
    if (showThreatAssist) drawThreatRing(body);
    drawBodyForCurrentStage(body, palette.starBase, palette.starDetail);
  }
}

function handleStageProgression() {
  if (currentStageIndex < GAME_STAGES.length - 1) {
    currentStageIndex++;
    gameState = getCurrentStageName();
    startGame(false);
    return;
  }

  // No more stages, end the game with a win state.
  gameState = "ending";
}
