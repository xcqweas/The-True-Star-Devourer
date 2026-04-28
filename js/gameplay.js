function runGame() {
  let palette = getStagePalette();

  // UI
  fill(255);
  textAlign(LEFT, TOP);
  textSize(16);
  text("Time Passed: " + floor((frameCount - startFrame) / 60), 20, 20);
  text("Score: " + score, 20, 40);
  text("Stage: " + (currentStageIndex + 1), 20, 60);

  // Move player toward mouse.
  let dx = mouseX - player.x;
  let dy = mouseY - player.y;
  player.x += dx * 0.05;
  player.y += dy * 0.05;
  player.angle += player.rotationSpeed;

  // Draw player.
  drawBodyForCurrentStage(player, palette.playerBase, palette.playerDetail);

  // Respawn stars over time.
  if (frameCount - lastSpawnFrame >= getSpawnInterval() && star_objects.length < currentMaxStars) {
    spawnStar();
    lastSpawnFrame = frameCount;
  }

  // Draw, move, and resolve collision for all stars.
  for (let i = star_objects.length - 1; i >= 0; i--) {
    let f = star_objects[i];

    f.x += f.vx;
    f.y += f.vy;
    f.angle += f.rotationSpeed;

    drawBodyForCurrentStage(f, palette.starBase, palette.starDetail);

    // Bounce once fully on-screen.
    if (!f.entered) {
      if (f.x - f.r >= 0 && f.x + f.r <= width && f.y - f.r >= 0 && f.y + f.r <= height) {
        f.entered = true;
      }
    } else {
      if (f.x - f.r < 0 || f.x + f.r > width) f.vx *= -1;
      if (f.y - f.r < 0 || f.y + f.r > height) f.vy *= -1;
    }

    let d = dist(player.x, player.y, f.x, f.y);

    if (d < player.r + f.r) {
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
    }
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
