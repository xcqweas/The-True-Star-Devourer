function drawMenu() {
  fill(255);
  textAlign(CENTER, CENTER);
  textSize(36);
  text("The True Star Devourer", width / 2, height / 2 - 40);

  textSize(16);
  text("Use Mouse to control your star and eat smaller stars!", width / 2, height / 2 + 10);
  text("But watch out for bigger stars!", width / 2, height / 2 + 40);

  textSize(20);
  let selected = DIFFICULTY_PRESETS[selectedDifficultyIndex];
  text("Difficulty: " + selected.name, width / 2, height / 2 + 80);

  textSize(16);
  text("LEFT/RIGHT ARROW: Change difficulty", width / 2, height / 2 + 110);

  textSize(20);
  text("Press SPACE to Start", width / 2, height / 2 + 145);
}

function drawGameOver() {
  fill(255);
  textAlign(CENTER, CENTER);
  textSize(32);
  text("Game Over", width / 2, height / 2 - 20);

  textSize(20);
  text("Final Score: " + score, width / 2, height / 2 + 20);
  text("Press SPACE to Restart", width / 2, height / 2 + 60);
}

function drawProgress() {
  fill(255);
  textAlign(CENTER, CENTER);
  textSize(28);
  text("Congratulations! You've evolved into the next stage!", width / 2, height / 2 - 20);
  textSize(20);
  text("Press SPACE to continue", width / 2, height / 2 + 20);
}

function drawEnding() {
  fill(255);
  textAlign(CENTER, CENTER);
  textSize(32);
  text("You have become the True Star Devourer!", width / 2, height / 2 - 40);
  text("For now... Until the next BIG BOOM", width / 2, height / 2);
  textSize(20);
  text("Well, until next update", width / 2, height / 2 + 40);
  text("You can refresh the page to play again!", width / 2, height / 2 + 80);
}
