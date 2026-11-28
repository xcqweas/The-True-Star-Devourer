function setup() {
  createCanvas(max(1, windowWidth), max(1, windowHeight));
  startGame();
  gameState = "menu";
}

function windowResized() {
  resizeCanvas(max(1, windowWidth), max(1, windowHeight), true);
  // A resize changes only the viewport and which existing regions are active.
  if (player) {
    followPlayer();
    syncWorldRegions();
  }
}

function draw() {
  background(30);

  if (gameState === "menu") {
    drawMenu();
  } else if (gameState === "playing") {
    runGame();
  } else if (gameState === "evolving") {
    updateCamera(deltaTime / 1000);
    drawGame();
    drawEvolutionChoice();
  } else if (gameState === "gameover") {
    drawGameOver();
  } else if (gameState === "ending") {
    drawEnding();
  }
}

function keyPressed() {
  if (gameState === "evolving") {
    if (key === "1") choosePlayerEvolution("massiveSolid");
    if (key === "2") choosePlayerEvolution("gasGiant");
    return;
  }
  if (gameState === "menu") {
    if (keyCode === LEFT_ARROW) {
      selectedDifficultyIndex = (selectedDifficultyIndex - 1 + DIFFICULTY_PRESETS.length) % DIFFICULTY_PRESETS.length;
    }

    if (keyCode === RIGHT_ARROW) {
      selectedDifficultyIndex = (selectedDifficultyIndex + 1) % DIFFICULTY_PRESETS.length;
    }
  }

  if (key === " ") {
    if (gameState === "menu") {
      difficultyFactor = DIFFICULTY_PRESETS[selectedDifficultyIndex].factor;
      startGame();
      gameState = "playing";
    } else if (gameState === "gameover" || gameState === "ending") {
      startGame();
      gameState = "playing";
    }
  }
}

function mousePressed() {
  if (gameState !== "evolving") return;
  for (const box of evolutionChoiceBounds()) {
    if (mouseX >= box.x && mouseX <= box.x + box.w && mouseY >= box.y && mouseY <= box.y + box.h) {
      choosePlayerEvolution(box.type);
      return;
    }
  }
}
