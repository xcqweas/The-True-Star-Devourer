function getCurrentStageName() {
  return GAME_STAGES[currentStageIndex] || GAME_STAGES[0];
}

function getStagePalette() {
  if (currentStageIndex === 1) {
    return {
      playerBase: color(176, 184, 196),
      playerDetail: color(128, 138, 150),
      starBase: color(156, 162, 170),
      starDetail: color(108, 116, 124)
    };
  }

  // Future stage palettes can be added here.
  // if (currentStageIndex === 2) {
  //   return { ... };
  // }

  // Stage 0 default visuals.
  return {
    playerBase: color(180, 205, 235),
    playerDetail: color(130, 155, 185),
    starBase: color(150, 128, 102),
    starDetail: color(105, 88, 68)
  };
}

function makeShapeForCurrentStage(radius) {
  if (currentStageIndex === 1) {
    // Stage 1: more points + low roughness to keep bodies very circular.
    return makeAsteroidShape(radius, floor(random(18, 28)), 0.08);
  }

  // Future stage implementations:
  // if (currentStageIndex === 2) {
  //   return makeSomethingElse(radius);
  // }

  // Stage 0 default shape.
  return makeAsteroidShape(radius, floor(random(9, 14)), 0.28);
}
