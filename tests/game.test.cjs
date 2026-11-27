const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const scripts = [
  "js/constants.js",
  "js/game-state.js",
  "js/bodies.js",
  "js/stage-visuals.js",
  "js/spawn-and-init.js",
  "js/screens.js",
  "js/gameplay.js",
  "js/p5-entry.js"
].map(filename => ({ filename, source: fs.readFileSync(path.join(root, filename), "utf8") }));

// Supply p5 math and drawing stubs so the real game scripts can run without a browser.
function createGame(width = 1600, height = 900, seed = 123456789) {
  const context = {
    Math, width, height, windowWidth: width, windowHeight: height,
    mouseX: width / 2, mouseY: height / 2,
    frameCount: 0, deltaTime: 1000 / 60, key: "", keyCode: 0,
    LEFT_ARROW: 37, RIGHT_ARROW: 39, TWO_PI: Math.PI * 2, PI: Math.PI,
    LEFT: "left", TOP: "top", CENTER: "center", CLOSE: "close", texts: [],
    min: Math.min, max: Math.max, abs: Math.abs, round: Math.round,
    floor: Math.floor, sin: Math.sin, cos: Math.cos,
    dist: (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1),
    constrain: (value, low, high) => Math.min(high, Math.max(low, value)),
    lerp: (low, high, amount) => low + (high - low) * amount,
    map: (value, low, high, outLow, outHigh) => outLow + (value - low) / (high - low) * (outHigh - outLow),
    color: (...channels) => channels,
    lerpColor: (low, high, amount) => low.map((value, i) => value + (high[i] - value) * amount),
    red: color => color[0], green: color => color[1], blue: color => color[2],
    random(low, high) {
      seed = (1664525 * seed + 1013904223) >>> 0;
      const fraction = seed / 4294967296;
      if (Array.isArray(low)) return low[Math.floor(fraction * low.length)];
      if (low === undefined) return fraction;
      if (high === undefined) return low * fraction;
      return Math.min(low, high) + Math.abs(high - low) * fraction;
    }
  };
  for (const name of ["push", "pop", "translate", "rotate", "noStroke", "fill", "beginShape", "vertex", "endShape", "circle", "noFill", "stroke", "strokeWeight", "textAlign", "textSize", "textFont", "rectMode", "rect", "line", "ellipse", "background"]) {
    context[name] = () => {};
  }
  context.text = value => context.texts.push(value);
  context.createCanvas = context.resizeCanvas = (w, h) => {
    context.width = w;
    context.height = h;
  };
  vm.createContext(context);
  for (const { filename, source } of scripts) vm.runInContext(source, context, { filename });
  return {
    context,
    run: source => vm.runInContext(source, context),
    frames(count, fps = 60) {
      context.deltaTime = 1000 / fps;
      for (let i = 0; i < count; i++) {
        context.frameCount++;
        vm.runInContext("draw()", context);
      }
    }
  };
}

const bodyFactory = `
  function body(x, y, r, vx = 0, vy = 0, entered = true) {
    return { x, y, r, vx, vy, entered, shape: [], shapeRadius: r, angle: 0, rotationSpeed: 0 };
  }
`;

function beginGame(game) {
  game.run(`setup(); key = " "; keyPressed(); ${bodyFactory}`);
}

test("menu controls select difficulty and start a fresh stage", () => {
  const game = createGame();
  game.run("setup(); keyCode = RIGHT_ARROW; keyPressed();");
  assert.equal(game.run("selectedDifficultyIndex"), 2);
  game.run('key = " "; keyCode = 0; keyPressed();');
  assert.equal(game.run("gameState"), "playingStage0");
  assert.equal(game.run("difficultyFactor"), 1);
  assert.equal(game.run("score"), 0);
  assert.equal(game.run("star_objects.length"), 20);
});

test("eating still grows the player and equal or larger bodies cause death", () => {
  const game = createGame();
  beginGame(game);
  game.run("difficultyFactor = 1; star_objects = [body(player.x, player.y, 10)];");
  game.frames(1);
  assert.equal(game.run("score"), 1);
  assert.equal(game.run("player.r"), 20.5);
  assert.equal(game.run("star_objects.length"), 0);
  game.run("star_objects = [body(player.x, player.y, player.r)];");
  game.frames(1);
  assert.equal(game.run("gameState"), "gameover");
});

test("stage transitions preserve score and restart resets stage, score, and clock", () => {
  const game = createGame();
  beginGame(game);
  game.run("score = 59; star_objects = [body(player.x, player.y, 10)];");
  game.frames(1);
  assert.equal(game.run("gameState"), "progress");
  const stoppedTick = game.run("stageTick");
  game.frames(30);
  assert.equal(game.run("stageTick"), stoppedTick);
  game.run("keyPressed();");
  assert.equal(game.run("gameState"), "playingStage1");
  assert.equal(game.run("score"), 60);
  assert.equal(game.run("player.r"), 20);
  assert.equal(game.run("stageTick"), 0);
  assert.equal(game.run("simulationAccumulator"), 0);
  game.run("score = 119; star_objects = [body(player.x, player.y, 10)];");
  game.frames(1);
  game.run("keyPressed();");
  assert.equal(game.run("gameState"), "ending");
  game.run('gameState = "gameover"; keyPressed();');
  assert.equal(game.run("gameState"), "playingStage0");
  assert.equal(game.run("score"), 0);
  assert.equal(game.run("currentStageIndex"), 0);
  assert.equal(game.run("stageTick"), 0);
});

test("escaped incoming bodies release their spawn slots", () => {
  const game = createGame();
  beginGame(game);
  game.run("currentMaxStars = 1; star_objects = [body(1, -20, 20, -1, 1, false)];");
  game.frames(22);
  assert.equal(game.run("star_objects.length"), 0);
  game.frames(1);
  assert.equal(game.run("star_objects.length"), 1);
  assert.equal(game.run("star_objects[0].entered"), false);
});

test("an inward entrant is kept until it enters, then bounces within the arena", () => {
  const game = createGame();
  beginGame(game);
  game.run("currentMaxStars = 1; star_objects = [body(100, -20, 20, 0, 1, false)];");
  game.frames(40);
  assert.equal(game.run("star_objects.length"), 1);
  assert.equal(game.run("star_objects[0].entered"), true);
  game.run("star_objects[0].x = width - 21; star_objects[0].vx = 5;");
  game.frames(1);
  assert.equal(game.run("star_objects[0].x"), 1580);
  assert.equal(game.run("star_objects[0].vx"), -5);
  game.frames(1);
  assert.equal(game.run("star_objects[0].x"), 1575);
});

test("shrinking the canvas rescales bodies, limits radii, and updates the population cap", () => {
  const game = createGame();
  beginGame(game);
  game.run(`
    player.x = 1400; player.y = 800;
    star_objects = Array.from({ length: 30 }, () => body(1500, 400, 200, 1, 0));
    windowWidth = 800; windowHeight = 600; windowResized();
  `);
  assert.equal(game.run("currentMaxStars"), 10);
  assert.equal(game.run("star_objects.length"), 10);
  assert.equal(game.run("player.x"), 700);
  assert.ok(game.run("star_objects.every(f => f.r <= 150 && f.x - f.r >= 0 && f.x + f.r <= width && f.y - f.r >= 0 && f.y + f.r <= height)"));
  game.run("player.x = 20; player.y = 20; mouseX = 20; mouseY = 20;");
  game.frames(2);
  assert.ok(game.run("star_objects.every(f => f.x + f.r <= width)"));
  game.run("windowWidth = 1600; windowHeight = 900; windowResized();");
  assert.equal(game.run("currentMaxStars"), 30);
});

test("resize also fits incoming bodies and preserves stored shape scaling", () => {
  const game = createGame();
  beginGame(game);
  game.run("star_objects = [body(-200, 400, 200, 1, 0, false)]; windowWidth = 400; windowHeight = 300; windowResized();");
  assert.equal(game.run("star_objects[0].entered"), true);
  assert.equal(game.run("star_objects[0].r"), 75);
  assert.equal(game.run("star_objects[0].shapeRadius"), 200);
  assert.equal(game.run("star_objects[0].x"), 75);
});

test("movement speed is limited without changing nearby cursor smoothing", () => {
  const game = createGame(1920, 1080);
  beginGame(game);
  game.run("currentMaxStars = 0; star_objects = []; player.x = 20; player.y = 20; mouseX = width; mouseY = height;");
  game.frames(1);
  assert.ok(game.run("Math.hypot(player.x - 20, player.y - 20) <= PLAYER_MAX_SPEED / SIMULATION_FPS + 1e-9"));
  game.run("player.x = 500; player.y = 500; mouseX = 600; mouseY = 500;");
  game.frames(1);
  assert.equal(game.run("player.x"), 505);
});

test("swept collisions detect a lethal body between both endpoint positions", () => {
  const game = createGame();
  beginGame(game);
  game.run("player.x = 115; player.y = 73; star_objects = [body(67.5, 46.5, 21)];");
  assert.ok(game.run("dist(20, 20, star_objects[0].x, star_objects[0].y) > 41"));
  assert.ok(game.run("dist(player.x, player.y, star_objects[0].x, star_objects[0].y) > 41"));
  assert.ok(game.run("bodiesCollidedDuringStep(20, 20, 67.5, 46.5, star_objects[0])"));
  game.run("currentMaxStars = 1; player.x = 800; player.y = 450; mouseX = 800; mouseY = 450; star_objects = [body(700, 450, 21, 200, 0)];");
  game.frames(1);
  assert.equal(game.run("gameState"), "gameover");
});

test("swept collision rejects near misses and handles stationary overlaps", () => {
  const game = createGame();
  beginGame(game);
  game.run("player.x = 900; player.y = 450;");
  assert.equal(game.run("bodiesCollidedDuringStep(700, 450, 800, 500, body(800, 500, 21))"), false);
  assert.equal(game.run("bodiesCollidedDuringStep(900, 450, 900, 450, body(900, 450, 21))"), true);
});

test("an incoming body crossing the player is checked before off-screen cleanup", () => {
  const game = createGame();
  beginGame(game);
  game.run("currentMaxStars = 1; star_objects = [body(700, 450, 21, 2000, 0, false)];");
  game.frames(1);
  assert.equal(game.run("gameState"), "gameover");
});

test("30, 60, and 144 FPS produce the same clock, player movement, and spawn simulation", () => {
  const snapshots = [];
  for (const fps of [30, 60, 144]) {
    const game = createGame();
    beginGame(game);
    game.run("star_objects = []; currentMaxStars = 30; mouseX = 900; mouseY = 450;");
    game.frames(fps * 5, fps);
    snapshots.push(JSON.stringify(game.run("({ stageTick, lastSpawnTick, player, star_objects, score, gameState })")));
    assert.equal(game.run("stageTick"), 300);
    assert.equal(game.context.texts.at(-3), "Time Passed: 5");
  }
  assert.equal(snapshots[0], snapshots[1]);
  assert.equal(snapshots[1], snapshots[2]);
});

test("suspended-tab deltas do not cause an unbounded catch-up", () => {
  const game = createGame();
  beginGame(game);
  game.run("star_objects = []; currentMaxStars = 0; deltaTime = 60000; draw();");
  assert.equal(game.run("stageTick"), 15);
  assert.ok(game.run("simulationAccumulator < SIMULATION_STEP_MS"));
});

test("spawn growth stops at 90 seconds on all difficulties and stays within the canvas", () => {
  const game = createGame();
  beginGame(game);
  game.run("random = (low, high) => Array.isArray(low) ? low[0] : high === undefined ? low * 0.5 : (low + high) / 2;");
  for (let difficulty = 0; difficulty < 5; difficulty++) {
    for (let stage = 0; stage < 2; stage++) {
      game.run(`difficultyFactor = DIFFICULTY_PRESETS[${difficulty}].factor; currentStageIndex = ${stage}; stageTick = 90 * SIMULATION_FPS; star_objects = []; spawnStar();`);
      const radiusAtLimit = game.run("star_objects[0].r");
      game.run("stageTick = 600 * SIMULATION_FPS; star_objects = []; spawnStar();");
      assert.equal(game.run("star_objects[0].r"), radiusAtLimit);
      game.run("windowWidth = 80; windowHeight = 60; windowResized(); star_objects = []; spawnStar();");
      assert.ok(game.run("star_objects[0].r > 0 && star_objects[0].r <= 15"));
      game.run("windowWidth = 1600; windowHeight = 900; windowResized();");
    }
  }
});

test("initial populations have player clearance across short and tiny canvases", () => {
  for (const [width, height] of [[640, 300], [320, 180], [160, 120], [40, 40]]) {
    const game = createGame(width, height);
    for (let iteration = 0; iteration < 30; iteration++) {
      game.run("setup(); currentStageIndex = 1; startGame();");
      assert.ok(game.run("star_objects.every(f => dist(f.x, f.y, player.x, player.y) >= player.r + f.r + INITIAL_SPAWN_CLEARANCE && f.x - f.r >= 0 && f.x + f.r <= width && f.y - f.r >= 0 && f.y + f.r <= height)"));
    }
    if (width >= 160) assert.ok(game.run("star_objects.length > 0"));
    else assert.equal(game.run("star_objects.length"), 0);
  }
});

test("fallback positions are checked for safety when random sampling fails", () => {
  const game = createGame(640, 300);
  beginGame(game);
  game.run("random = (low, high) => Array.isArray(low) ? low[0] : high === undefined ? 0 : (low + high) / 2;");
  assert.ok(game.run("getInitialSpawnPosition(30) !== null"));
  assert.ok(game.run("(() => { const p = getInitialSpawnPosition(30); return dist(p.x, p.y, player.x, player.y) >= 60; })()"));
});

test("every screen still renders through its p5 entry point", () => {
  const game = createGame();
  beginGame(game);
  for (const state of ["menu", "playingStage0", "playingStage1", "gameover", "progress", "ending"]) {
    assert.doesNotThrow(() => game.run(`gameState = ${JSON.stringify(state)}; draw();`));
  }
});
