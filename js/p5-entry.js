function setup() {
  createCanvas(1600, 900);
  startGame();
  gameState = "menu";
}

function draw() {
  background(30);

  if (gameState === "menu") {
    drawMenu();
  } else if (GAME_STAGES.includes(gameState)) {
    runGame();
  } else if (gameState === "gameover") {
    drawGameOver();
  } else if (gameState === "progress") {
    drawProgress();
  } else if (gameState === "ending") {
    drawEnding();
  }
}

function keyPressed() {
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
      currentStageIndex = 0;
      startGame();
      gameState = getCurrentStageName();
    } else if (gameState === "gameover") {
      currentStageIndex = 0;
      startGame();
      gameState = getCurrentStageName();
    } else if (gameState === "progress") {
      handleStageProgression();
    }
  }
}
