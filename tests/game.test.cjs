const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
// Use the browser's actual dependency order so new scripts cannot be omitted.
const scripts = [...fs.readFileSync(path.join(root, "index.html"), "utf8")
  .matchAll(/<script src="(js\/[^"]+)"/g)].map(([, filename]) => ({
    filename, source: fs.readFileSync(path.join(root, filename), "utf8")
  }));
scripts.push({ filename: "tests/gravity-scenarios.js", source: fs.readFileSync(path.join(root, "tests/gravity-scenarios.js"), "utf8") });
scripts.push({ filename: "tests/integration-scenario.js", source: fs.readFileSync(path.join(root, "tests/integration-scenario.js"), "utf8") });

function createGame(width = 1600, height = 900, seed = 123456789, constants = {}) {
  const context = {
    Math, URLSearchParams, width, height, windowWidth: width, windowHeight: height,
    mouseX: width / 2, mouseY: height / 2,
    frameCount: 0, deltaTime: 1000 / 60, key: "", keyCode: 0,
    LEFT_ARROW: 37, RIGHT_ARROW: 39, TWO_PI: Math.PI * 2, PI: Math.PI,
    LEFT: "left", TOP: "top", CENTER: "center", CORNER: "corner", CLOSE: "close", texts: [],
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
  for (const name of ["push", "pop", "translate", "scale", "rotate", "noStroke", "fill", "beginShape", "vertex", "endShape", "circle", "noFill", "stroke", "strokeWeight", "textAlign", "textSize", "textFont", "rectMode", "rect", "line", "triangle", "ellipse", "background"]) {
    context[name] = () => {};
  }
  context.text = value => context.texts.push(value);
  context.createCanvas = context.resizeCanvas = (w, h) => {
    context.width = w;
    context.height = h;
  };
  vm.createContext(context);
  for (const { filename, source } of scripts) {
    let configuredSource = source;
    if (filename === "js/constants.js") {
      for (const [name, value] of Object.entries(constants)) {
        configuredSource = configuredSource.replace(new RegExp(`const ${name} = [^;]+;`), `const ${name} = ${JSON.stringify(value)};`);
      }
    }
    vm.runInContext(configuredSource, context, { filename });
  }
  return {
    context,
    run: source => vm.runInContext(source, context),
    json: source => JSON.parse(vm.runInContext(`JSON.stringify(${source})`, context)),
    frames(count, fps = 60) {
      context.deltaTime = 1000 / fps;
      for (let i = 0; i < count; i++) {
        context.frameCount++;
        vm.runInContext("draw()", context);
      }
    }
  };
}

function beginGame(game, isolated = false) {
  game.run(`setup(); key = " "; keyPressed();
    let testBodySerial = 0;
    function body(x, y, r, vx = 0, vy = 0, type = "asteroid") {
      const object = createBody("test:" + testBodySerial++, type, x, y, r, seededRandom(42), vx, vy);
      // General-purpose collision/render fixtures opt out of gravity as sources.
      object.gravitySource = false;
      return object;
    }
    function movePlayer() { accumulatePlayerForces(); integrateBody(player); }
    function addBody(...args) {
      const object = body(...args);
      storeWorldBody(world, object);
      syncWorldRegions();
      return object;
    }
    function addSource(x, y, r = 600, type = 'planet', vx = 0, vy = 0) {
      const object = addBody(x, y, r, vx, vy, type);
      object.gravitySource = true;
      return object;
    }
    function allBodies() { return [...world.regions.values()].flatMap(bucket => [...bucket.values()]); }
  `);
  if (isolated) game.run("world = createWorld(42, 0, 1, true); world.regions.clear(); syncWorldRegions();");
}

function close(actual, expected, tolerance = 1e-8) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
}

test("menu difficulty, safe startup, and restart retain existing rules", () => {
  const game = createGame();
  game.run("setup(); keyCode = RIGHT_ARROW; keyPressed();");
  assert.equal(game.run("selectedDifficultyIndex"), 2);
  game.run('key = " "; keyCode = 0; keyPressed();');
  assert.equal(game.run("gameState"), "playing");
  assert.equal(game.run("difficultyFactor"), 1);
  assert.equal(game.run("score"), 0);
  assert.ok(game.run("star_objects.length > 0"));
  assert.ok(game.run("star_objects.every(f => Math.hypot(f.x, f.y) >= f.r + START_SAFE_RADIUS)"));
});

test("eating, difficulty growth, and equal/larger body death use world radii", () => {
  const game = createGame();
  beginGame(game, true);
  game.run("difficultyFactor = 1.2; const eaten = addBody(0, 0, 10);");
  game.frames(1);
  assert.equal(game.run("score"), 1);
  close(game.run("player.mass"), 400 + 100 / 1.2);
  close(game.run("player.r"), Math.sqrt(400 + 100 / 1.2));
  assert.ok(game.run("world.consumedIds.has(eaten.id)"));
  assert.equal(game.run("star_objects.length"), 0);
  game.run("addBody(player.x, player.y, player.r, 0, 0, 'moon');");
  game.frames(1);
  assert.equal(game.run("gameState"), "gameover");
});

test("score milestones are statistics and never pause, evolve, or reset the world", () => {
  const game = createGame();
  beginGame(game, true);
  game.run("const originalWorld = world; score = 59; addBody(0, 0, 10);");
  game.frames(1);
  assert.equal(game.run("gameState"), "playing");
  assert.equal(game.run("score"), 60);
  assert.equal(game.run("player.type"), "asteroid");
  assert.ok(game.run("world === originalWorld"));
  game.frames(30);
  assert.equal(game.run("runTick"), 31);
  game.run("score = 119; addBody(0, 0, 10);");
  game.frames(1);
  assert.equal(game.run("gameState"), "playing");
  assert.equal(game.run("score"), 120);
  assert.equal(game.run("currentFormIndex"), 0);
  assert.ok(game.run("world === originalWorld && world.consumedIds.size === 2"));
});

test("camera centers the player at arbitrary signed world coordinates", () => {
  const game = createGame();
  beginGame(game, true);
  for (const [x, y] of [[0, 0], [-15000, 25000], [42000, -9000]]) {
    game.run(`player.x = ${x}; player.y = ${y}; followPlayer();`);
    assert.deepEqual(game.json("worldToScreen(player.x, player.y)"), { x: 800, y: 450 });
    assert.deepEqual(game.json("screenToWorld(800, 450)"), { x, y });
    assert.deepEqual(game.json("worldToScreen(player.x + 37, player.y - 25)"), { x: 837, y: 425 });
  }
});

test("steering uses center direction, dead zone, capped strength, and acceleration", () => {
  const game = createGame();
  beginGame(game, true);
  game.run("player.x = -10000; player.y = 5000; mouseX = width / 2 + 10; movePlayer();");
  assert.equal(game.run("player.vx"), 0);
  game.run("mouseX = width / 2 + 96; movePlayer();");
  assert.ok(game.run("player.vx > 0 && player.ax > 0 && player.vy === 0"));
  assert.ok(game.run("Math.hypot(player.ax, player.ay) <= PLAYER_MAX_ACCELERATION"));
  game.run("mouseX = 1e6; mouseY = 1e6; for (let i = 0; i < 120; i++) movePlayer();");
  assert.ok(game.run("Math.hypot(player.vx, player.vy) <= PLAYER_MAX_SPEED + 1e-8"));
  game.run("mouseX = width / 2; mouseY = height / 2; for (let i = 0; i < 90; i++) movePlayer();");
  assert.equal(game.run("player.vx"), 0);
  assert.equal(game.run("player.vy"), 0);
  const speedAt = distance => {
    game.run(`player.vx = player.vy = 0; mouseX = width / 2 + ${distance};
      for (let i = 0; i < 120; i++) movePlayer();`);
    return game.run("player.vx");
  };
  close(speedAt(96), 600);
  close(speedAt(180), 1200);
  close(speedAt(10000), 1200);
});

test("player supports explicit external acceleration in world units without gravity", () => {
  const game = createGame();
  beginGame(game, true);
  game.run("player.externalAx = 60; player.externalAy = -120; movePlayer();");
  assert.equal(game.run("player.vx"), 1);
  assert.equal(game.run("player.vy"), -2);
  close(game.run("player.x"), 1 / 60);
  close(game.run("player.y"), -2 / 60);
});

test("player crosses viewport edges and regions with no physical clamps or bounces", () => {
  const game = createGame(320, 180);
  beginGame(game, true);
  game.run("mouseX = width / 2 - 180;");
  game.frames(180);
  assert.ok(game.run("player.x < -3000"));
  assert.ok(game.run("player.vx < 0"));
  assert.deepEqual(game.json("worldToScreen(player.x, player.y)"), { x: 160, y: 90 });
});

test("moving bodies use units/second, cross region boundaries, and keep identity", () => {
  const game = createGame();
  beginGame(game, true);
  game.run("player.x = 700; followPlayer(); const moving = addBody(1023, 300, 10, 120, -60);");
  const angle = game.run("moving.angle");
  game.frames(1);
  close(game.run("moving.x"), 1025);
  close(game.run("moving.y"), 299);
  close(game.run("moving.angle"), angle + game.run("moving.rotationSpeed") / 60);
  assert.equal(game.run("moving.vx"), 120);
  assert.equal(game.run("moving.regionKey"), "1,0");
  assert.equal(game.run("allBodies().filter(f => f.id === moving.id).length"), 1);
});

test("resizing only changes viewport, preserving all world and rendering data", () => {
  const game = createGame();
  beginGame(game, true);
  game.run("player.x = -1400; player.y = 800; player.vx = 123; setBodyMass(player, massForRadius(600)); updatePlayerEvolution(); addBody(-1500, 400, 1800, 30, 0, 'planet'); followPlayer();");
  const before = game.json("({ player, bodies: allBodies() })");
  for (const [w, h] of [[400, 300], [40, 40], [1920, 1080]]) {
    game.run(`windowWidth = ${w}; windowHeight = ${h}; windowResized();`);
    assert.deepEqual(game.json("({ player, bodies: allBodies() })"), before);
    assert.deepEqual(game.json("worldToScreen(player.x, player.y)"), { x: w / 2, y: h / 2 });
  }
});

test("swept collisions catch a fast world body crossing both endpoint positions", () => {
  const game = createGame();
  beginGame(game, true);
  game.run("player.x = -50000; player.y = 30000; followPlayer(); addBody(player.x - 100, player.y, 21, 12000);");
  game.frames(1);
  assert.equal(game.run("gameState"), "gameover");
});

test("relative swept collision is camera-independent and rejects near misses", () => {
  const game = createGame();
  beginGame(game, true);
  game.run("player.x = 900; player.y = 450; const target = body(800, 450, 21);");
  assert.ok(game.run("bodiesCollidedDuringStep(700, 450, 800, 450, target)"));
  game.run("camera.x = -1e6; camera.y = 1e6;");
  assert.ok(game.run("bodiesCollidedDuringStep(700, 450, 800, 450, target)"));
  assert.equal(game.run("bodiesCollidedDuringStep(700, 450, 800, 500, body(800, 500, 21))"), false);
  assert.ok(game.run("bodiesCollidedDuringStep(900, 450, 900, 450, body(900, 450, 21))"));
  game.run("player.x = 100; player.y = 0;");
  assert.ok(game.run("bodiesCollidedDuringStep(-100, 0, 100, 0, body(-100, 0, 21))"));
});

test("mixed-scale fixture activates and renders an oversized planet by its surface", () => {
  const game = createGame();
  beginGame(game);
  game.run("startGame({ seed: 42, fixture: true });");
  assert.deepEqual(game.json("[...new Set(star_objects.map(f => f.type))].sort()"), ["asteroid", "moon", "planet"]);
  assert.ok(game.run("star_objects.some(f => f.type === 'planet' && f.x > width && f.r * 2 > width && isBodyVisible(f))"));
  game.run("const rendered = []; drawBody = b => rendered.push(b.id); drawGame();");
  assert.ok(game.run("rendered.includes('fixture:4')"));
  assert.equal(game.run("player.r"), 20);
});

test("other bodies' shapes and palettes do not change when the player evolves", () => {
  const game = createGame();
  beginGame(game, true);
  game.run("const objects = ['asteroid', 'moon', 'planet'].map(type => body(0, 0, 100, 0, 0, type));");
  const before = game.json("objects.map(b => ({ type: b.type, shape: b.shape, palette: getBodyPalette(b) }))");
  game.run("setBodyMass(player, EVOLUTION_FORMS[2].mass); updatePlayerEvolution();");
  assert.deepEqual(game.json("objects.map(b => ({ type: b.type, shape: b.shape, palette: getBodyPalette(b) }))"), before);
  assert.ok(game.run("objects[0].shape.length < objects[1].shape.length && objects[2].shape.length === 0"));
});

test("the asteroid player can navigate a full route around the fixture planet", () => {
  const game = createGame();
  beginGame(game);
  game.run(`startGame({ seed: 42, fixture: true });
    for (const [x, y] of [[0, -2300], [4800, -2300], [4800, 2300], [0, 2300]]) {
      let ticks = 0;
      while (Math.hypot(player.x - x, player.y - y) > 20 && ticks++ < 600) {
        // Aim the drive component against accumulated drift to follow the route.
        const dx = x - player.x, dy = y - player.y, distance = Math.hypot(dx, dy);
        const speed = Math.min(PLAYER_MAX_SPEED, distance * 4);
        const driveX = dx / distance * speed - player.gravityVx;
        const driveY = dy / distance * speed - player.gravityVy;
        const driveSpeed = Math.hypot(driveX, driveY);
        const offset = STEERING_DEAD_ZONE + (STEERING_MAX_DISTANCE - STEERING_DEAD_ZONE) * Math.min(1, driveSpeed / PLAYER_MAX_SPEED);
        mouseX = width / 2 + driveX / driveSpeed * offset;
        mouseY = height / 2 + driveY / driveSpeed * offset;
        updateGame();
        if (gameState !== 'playing') throw new Error('Route was blocked');
      }
      if (ticks >= 600) throw new Error('Waypoint not reached: ' + JSON.stringify({ target: [x,y], x: player.x, y: player.y, drift: [player.gravityVx, player.gravityVy] }));
    }`);
  assert.equal(game.run("player.type"), "asteroid");
  assert.equal(game.run("player.r"), 20);
  assert.equal(game.run("gameState"), "playing");
});

test("generated planet surfaces activate even with centers well outside the viewport", () => {
  const game = createGame(400, 300);
  beginGame(game);
  game.run(`const planet = allBodies().find(b => b.type === 'planet');
    player.x = planet.x - planet.r - 100; player.y = planet.y;
    followPlayer(); syncWorldRegions();`);
  assert.ok(game.run("Math.abs(planet.x - player.x) > width && star_objects.includes(planet) && isBodyVisible(planet)"));
});

test("HUD remains in screen space after camera transformation and body rendering", () => {
  const game = createGame();
  beginGame(game, true);
  let translation = { x: 0, y: 0 };
  const stack = [];
  const positions = [];
  game.context.push = () => stack.push({ ...translation });
  game.context.pop = () => { translation = stack.pop(); };
  game.context.translate = (x, y) => { translation.x += x; translation.y += y; };
  game.context.text = (text, x, y) => positions.push({ text, x: x + translation.x, y: y + translation.y });
  game.run("player.x = -4000; player.y = 9000; followPlayer(); drawGame();");
  assert.deepEqual(positions, [
    { text: "Time Passed: 0", x: 20, y: 20 },
    { text: "Score: 0", x: 20, y: 40 },
    { text: "Form: Asteroid", x: 20, y: 60 },
    { text: "Mass: 400", x: 20, y: 80 },
    { text: "Next: Moon 0.0% / 14.4K", x: 20, y: 100 }
  ]);
});

test("region generation is deterministic across order, clocks, viewports, and seeds", () => {
  const game = createGame();
  beginGame(game);
  const coords = [[0, 0], [-1, 0], [0, -1], [-8, -6], [8, 3]];
  const originals = coords.map(([x, y]) => game.json(`generateRegion(17, ${x}, ${y})`));
  game.run("runTick = 99999; width = 40; height = 40; random(); setBodyMass(player, EVOLUTION_FORMS[1].mass); updatePlayerEvolution();");
  for (const index of [4, 2, 0, 3, 1]) {
    const [x, y] = coords[index];
    assert.deepEqual(game.json(`generateRegion(17, ${x}, ${y})`), originals[index]);
  }
  assert.notDeepEqual(game.json("generateRegion(18, 0, 0)"), originals[0]);
});

test("signed region boundaries use floor and all bodies have unique owning identities", () => {
  const game = createGame();
  beginGame(game);
  assert.deepEqual(game.json("[-1024.01, -1024, -0.01, 0, 1023.99, 1024].map(coordinateRegion)"), [-2, -1, -1, 0, 0, 1]);
  game.run(`const generated = [];
    for (let y = -12; y <= 12; y++) for (let x = -12; x <= 12; x++) {
      for (const b of generateRegion(42, x, y)) {
        if (coordinateRegion(b.x) !== x || coordinateRegion(b.y) !== y) throw new Error('Wrong owner');
        generated.push(b);
      }
    }`);
  assert.equal(game.run("new Set(generated.map(b => b.id)).size"), game.run("generated.length"));
  const counts = game.json("generated.reduce((counts, b) => { counts[b.type] = (counts[b.type] || 0) + 1; return counts; }, {})");
  assert.ok(counts.asteroid > counts.moon && counts.moon > counts.planet && counts.planet > 0);
  assert.ok(game.run("generated.some(b => b.r < 20) && generated.some(b => b.r > 1200)"));
});

test("placement reserves safe starts and routes around large bodies across seams", () => {
  const game = createGame();
  beginGame(game);
  game.run(`const sample = [];
    for (let y = -12; y <= 12; y++) for (let x = -12; x <= 12; x++) sample.push(...generateRegion(42, x, y));
    const large = sample.filter(b => b.type !== 'asteroid');
  `);
  assert.ok(game.run("sample.every(isOutsideStartingArea)"));
  assert.ok(game.run(`large.every((a, i) => large.slice(i + 1).every(b =>
    Math.hypot(a.x - b.x, a.y - b.y) >= a.r + b.r +
    (a.type === 'planet' && b.type === 'planet' ? PLANET_ROUTE_GAP : LARGE_BODY_CLEARANCE)))`));
  assert.ok(game.run("sample.filter(b => b.type === 'asteroid').every(b => hasClearance(b, large, 64))"));
});

test("repeated region activation and boundary traversal never duplicate objects", () => {
  const game = createGame();
  beginGame(game);
  game.run(`for (const x of [1023, 1024, 1025, -1, -1024, -1025, 0, 1024, 0]) {
    player.x = x; syncWorldRegions(); syncWorldRegions();
    if (new Set(star_objects.map(b => b.id)).size !== star_objects.length) throw new Error('Duplicate active ID');
    if (new Set(allBodies().map(b => b.id)).size !== allBodies().length) throw new Error('Duplicate resident ID');
  }`);
  assert.ok(game.run("star_objects.length > 0"));
});

test("eaten generated objects stay gone after leaving and revisiting", () => {
  const game = createGame();
  beginGame(game);
  game.run(`const food = star_objects.find(b => b.r < player.r);
    const foodId = food.id; const homeX = food.x; const homeY = food.y;
    player.x = food.x; player.y = food.y; followPlayer(); updateGame();`);
  assert.ok(game.run("world.consumedIds.has(foodId)"));
  game.run("player.x = -30000; player.y = 30000; syncWorldRegions(); player.x = homeX; player.y = homeY; syncWorldRegions();");
  assert.ok(game.run("!allBodies().some(b => b.id === foodId) && !star_objects.some(b => b.id === foodId)"));
});

test("distant moving bodies freeze and resume full state after revisiting", () => {
  const game = createGame();
  beginGame(game, true);
  game.run("const moving = addBody(1023, 300, 10, 120, 0); updateGame();");
  const afterMove = game.json("moving");
  game.run("player.x = -30000; followPlayer();");
  game.frames(120);
  assert.deepEqual(game.json("moving"), afterMove);
  assert.ok(game.run("!star_objects.includes(moving)"));
  game.run("player.x = 700; followPlayer(); syncWorldRegions();");
  assert.ok(game.run("star_objects.includes(moving)"));
  assert.deepEqual(game.json("moving"), afterMove);
  game.frames(1);
  close(game.run("moving.x"), afterMove.x + 2);
  assert.equal(game.run("allBodies().filter(b => b.id === moving.id).length"), 1);
});

test("activation queries and active simulation stay bounded on huge viewports", () => {
  const game = createGame(100000, 100000);
  beginGame(game);
  assert.ok(game.run("world.generatedRegions.size <= (2 * MAX_REGION_REACH + 1) ** 2"));
  assert.ok(game.run("star_objects.length <= MAX_ACTIVE_BODIES"));
  game.run(`world = createWorld(42, 0, 1, true); world.regions.clear();
    for (let i = 0; i < MAX_ACTIVE_BODIES + 20; i++) storeWorldBody(world, body(100 + i / 10, 300, 5, 1));
    syncWorldRegions(); const frozen = allBodies().find(b => !star_objects.includes(b)); const frozenX = frozen.x;
    updateGame();`);
  assert.equal(game.run("star_objects.length"), 1024);
  assert.equal(game.run("frozen.x"), game.run("frozenX"));
});

test("bounded placement attempts terminate even when clearance rejects every position", () => {
  const game = createGame();
  beginGame(game);
  game.run("let placementChecks = 0; hasClearance = () => { placementChecks++; return false; }; const rejected = generateRegion(42, 20, -20);");
  assert.equal(game.run("rejected.filter(b => b.type === 'asteroid').length"), 0);
  assert.ok(game.run("placementChecks <= (ASTEROIDS_PER_REGION + 9) * PLACEMENT_ATTEMPTS"));
});

test("difficulty affects asteroid sizes without removing small types", () => {
  const game = createGame();
  beginGame(game);
  game.run("const easy = generateRegion(42, 0, 0, 0, 0.8); const hard = generateRegion(42, 0, 0, 0, 1.2);");
  assert.ok(game.run("hard.some(b => b.type === 'asteroid' && b.r < 20)"));
  assert.ok(game.run("hard.find(b => b.type === 'asteroid').r > easy.find(b => b.type === 'asteroid').r"));
});

test("30, 60, and 144 render FPS give identical world traversal and simulation", () => {
  const snapshots = [];
  for (const fps of [30, 60, 144]) {
    const game = createGame();
    beginGame(game);
    // Remain off the generated asteroid lanes to exercise generation while alive.
    game.run("player.y = 0; mouseX = width / 2 + 180; mouseY = height / 2;");
    game.frames(fps * 5, fps);
    assert.equal(game.run("runTick"), 300);
    assert.ok(game.run("player.x > 5 * REGION_SIZE"));
    assert.equal(game.context.texts.filter(text => text.startsWith("Time Passed:")).at(-1), "Time Passed: 5");
    snapshots.push(game.json(`({ runTick, player, currentFormIndex, evolutionNotification, bodies: allBodies().sort((a,b) => a.id.localeCompare(b.id)),
      activeIds: star_objects.map(b => b.id), consumed: [...world.consumedIds],
      regions: [...world.generatedRegions], score, gameState, camera })`));
  }
  assert.deepEqual(snapshots[0], snapshots[1]);
  assert.deepEqual(snapshots[1], snapshots[2]);
});

test("suspended-tab deltas keep bounded fixed-tick catch-up", () => {
  const game = createGame();
  beginGame(game, true);
  game.run("deltaTime = 60000; draw();");
  assert.equal(game.run("runTick"), 15);
  assert.ok(game.run("simulationAccumulator < SIMULATION_STEP_MS"));
});

test("tiny canvases keep safe world sizes and every screen renders", () => {
  for (const [w, h] of [[320, 180], [40, 40]]) {
    const game = createGame(w, h);
    beginGame(game);
    assert.ok(game.run("star_objects.every(isOutsideStartingArea)"));
    assert.ok(game.run("allBodies().some(b => b.r > width)"));
    for (const state of ["menu", "playing", "gameover", "ending"]) {
      assert.doesNotThrow(() => game.run(`gameState = ${JSON.stringify(state)}; draw();`));
    }
  }
});

test("every generated, fixture, and player body shares the invertible mass/radius law", () => {
  const game = createGame();
  beginGame(game);
  assert.ok(game.run("[player, ...allBodies()].every(b => b.mass === massForRadius(b.r))"));
  game.run(`const fixture = createWorld(42, 0, 1, true);
    const fixtureBodies = [...fixture.regions.values()].flatMap(bucket => [...bucket.values()]);`);
  assert.ok(game.run("fixtureBodies.every(b => b.mass === massForRadius(b.r))"));
  assert.deepEqual(game.json("['asteroid', 'moon', 'planet'].map(type => body(0, 0, 100, 0, 0, type).mass)"), [10000, 10000, 10000]);
  for (const radius of [0, 0.01, 6, 20, 123.456, 1800, 2000]) {
    close(game.run(`radiusForMass(massForRadius(${radius}))`), radius);
  }
});

test("mass scale, radius exponent, and milestone configuration are actually used", () => {
  const forms = [
    { type: "asteroid", label: "Asteroid", mass: 20 },
    { type: "moon", label: "Moon", mass: 67.5 },
    { type: "planet", label: "Planet", mass: 160 }
  ];
  const game = createGame(1600, 900, 1, {
    MASS_SCALE: 2.5, MASS_RADIUS_EXPONENT: 3, EVOLUTION_FORMS: forms, FINAL_MASS_MILESTONE: 312.5
  });
  beginGame(game, true);
  assert.equal(game.run("player.mass"), 20);
  close(game.run("player.r"), 2);
  close(game.run("body(0, 0, 3).mass"), 67.5);
  for (const [mass, radius, form] of [[67.5, 3, "moon"], [160, 4, "planet"], [312.5, 5, "planet"]]) {
    game.run(`setBodyMass(player, ${mass}); updatePlayerEvolution();`);
    close(game.run("player.r"), radius);
    assert.equal(game.run("player.type"), form);
  }
  assert.equal(game.run("gameState"), "ending");
});

test("consumption adds prey mass at each difficulty and score stays a count", () => {
  for (const factor of [0.8, 0.9, 1, 1.1, 1.2]) {
    const game = createGame();
    beginGame(game, true);
    game.run(`difficultyFactor = ${factor}; addBody(0, 0, 10, 0, 0, 'moon');`);
    game.frames(1);
    close(game.run("player.mass"), 400 + 100 / factor);
    close(game.run("player.r ** 2"), 400 + 100 / factor);
    game.run("addBody(player.x, player.y, 15, 0, 0, 'planet');");
    game.frames(1);
    close(game.run("player.mass"), 400 + 325 / factor);
    assert.equal(game.run("score"), 2);
    assert.equal(game.run("world.consumedIds.size"), 2);
    assert.equal(game.run("gameState"), "playing");
  }
});

test("appropriate prey gives noticeable radius progress without an arbitrary radius bonus", () => {
  const game = createGame();
  beginGame(game, true);
  game.run("difficultyFactor = 1; addBody(0, 0, 15);");
  game.frames(1);
  assert.equal(game.run("player.mass"), 625);
  assert.equal(game.run("player.r"), 25); // 25% radius growth from a 75%-radius prey
  assert.ok(game.context.texts.includes("Next: Moon 1.6% / 14.4K"));
});

test("equal and larger prey kill regardless of type without granting mass or points", () => {
  for (const [type, radius] of [["asteroid", 20], ["moon", 21], ["planet", 100]]) {
    const game = createGame();
    beginGame(game, true);
    game.run(`addBody(0, 0, ${radius}, 0, 0, '${type}');`);
    game.frames(1);
    assert.equal(game.run("gameState"), "gameover");
    assert.equal(game.run("player.mass"), 400);
    assert.equal(game.run("score"), 0);
    assert.equal(game.run("world.consumedIds.size"), 0);
  }
});

test("form milestones trigger at the exact mass threshold and use each renderer", () => {
  const game = createGame();
  beginGame(game, true);
  game.run(`const drawnTypes = [];
    drawAsteroidBody = () => drawnTypes.push('asteroid');
    drawRockyMoonBody = () => drawnTypes.push('moon');
    drawPlanetBody = () => drawnTypes.push('planet');
    drawGame();`);
  for (const index of [1, 2]) {
    game.run(`setBodyMass(player, EVOLUTION_FORMS[${index}].mass - 1); updatePlayerEvolution();`);
    assert.equal(game.run("currentFormIndex"), index - 1);
    game.run(`setBodyMass(player, EVOLUTION_FORMS[${index}].mass); updatePlayerEvolution(); drawGame();`);
    assert.equal(game.run("currentFormIndex"), index);
    assert.equal(game.run("player.mass"), game.run(`EVOLUTION_FORMS[${index}].mass`));
    assert.equal(game.run("gameState"), "playing");
  }
  assert.deepEqual(game.json("drawnTypes"), ["asteroid", "moon", "planet"]);
  assert.equal(game.run("player.shape.length"), 0);
});

test("eating through either form milestone preserves motion, world state, and eaten IDs", () => {
  for (const index of [1, 2]) {
    const game = createGame();
    beginGame(game, true);
    game.run(`difficultyFactor = 1;
      setBodyMass(player, EVOLUTION_FORMS[${index}].mass - 100); updatePlayerEvolution();
      player.x = -4000; player.y = 6000; player.vx = 120; player.vy = -60;
      runTick = 401; score = 59; simulationAccumulator = 7;
      const originalPlayer = player; const originalWorld = world; const originalSeed = runSeed;
      const consumed = world.consumedIds; consumed.add('previously-eaten');
      const neighbor = addBody(player.x + player.r + 500, player.y, 30);
      const moon = addBody(player.x, player.y + player.r + 800, 180, 0, 0, 'moon');
      const planet = addBody(player.x + player.r + 2000, player.y, 1800, 0, 0, 'planet');
      const eaten = addBody(player.x, player.y, 10);
      const future = JSON.stringify(generateRegion(world.seed, -18, 17, world.stageIndex, world.difficulty));
      updateGame();`);
    assert.equal(game.run("player.type"), index === 1 ? "moon" : "planet");
    assert.ok(game.run("player === originalPlayer && world === originalWorld && runSeed === originalSeed"));
    close(game.run("player.vx"), 96);
    close(game.run("player.vy"), -48);
    close(game.run("player.x"), -3998.4);
    close(game.run("player.y"), 5999.2);
    assert.equal(game.run("player.mass"), game.run(`EVOLUTION_FORMS[${index}].mass`));
    assert.equal(game.run("score"), 60);
    assert.equal(game.run("runTick"), 402);
    assert.equal(game.run("simulationAccumulator"), 7);
    assert.equal(game.run("gameState"), "playing");
    assert.ok(game.run("world.consumedIds === consumed && consumed.has('previously-eaten') && consumed.has(eaten.id)"));
    assert.ok(game.run("allBodies().includes(neighbor) && allBodies().includes(moon) && allBodies().includes(planet)"));
    assert.deepEqual(game.json("[neighbor.type, moon.type, planet.type]"), ["asteroid", "moon", "planet"]);
    assert.ok(game.run("future === JSON.stringify(generateRegion(world.seed, -18, 17, world.stageIndex, world.difficulty))"));
    game.run("player.x = 30000; player.y = -30000; syncWorldRegions(); player.x = -4000; player.y = 6000; syncWorldRegions();");
    assert.ok(game.run("!allBodies().some(b => b.id === eaten.id)"));
  }
});

test("a single valid consumption can cross multiple configured forms without losing excess mass", () => {
  const game = createGame(1600, 900, 1, {
    EVOLUTION_FORMS: [
      { type: "asteroid", label: "Asteroid", mass: 400 },
      { type: "moon", label: "Moon", mass: 500 },
      { type: "planet", label: "Planet", mass: 600 }
    ], FINAL_MASS_MILESTONE: 1000
  });
  beginGame(game, true);
  game.run("difficultyFactor = 1; addBody(0, 0, Math.sqrt(300));");
  game.frames(1);
  close(game.run("player.mass"), 700);
  assert.equal(game.run("player.type"), "planet");
  assert.equal(game.run("score"), 1);
  assert.equal(game.run("gameState"), "playing");
  assert.equal(game.run("evolutionNotification.text"), "Evolved into Planet!");
  close(game.run("getEvolutionProgress().fraction"), 0.25);
});

test("evolution notification is brief, nonblocking, and is not extended by more meals", () => {
  const game = createGame();
  beginGame(game, true);
  game.run(`setBodyMass(player, EVOLUTION_FORMS[1].mass); updatePlayerEvolution();
    const expiry = evolutionNotification.expiresAtTick;
    const moving = addBody(0, 600, 10, 60);
    mouseX = width / 2 + 96;`);
  game.frames(30);
  assert.ok(game.run("player.x > 0 && moving.x > 0"));
  assert.equal(game.run("gameState"), "playing");
  assert.equal(game.run("evolutionNotification.expiresAtTick"), game.run("expiry"));
  game.run("addBody(player.x, player.y, 10);");
  game.frames(1);
  assert.equal(game.run("score"), 1);
  assert.equal(game.run("evolutionNotification.expiresAtTick"), game.run("expiry"));
  const originalWorld = game.run("world");
  game.run("keyPressed();");
  assert.equal(game.run("world"), originalWorld); // SPACE during play never resets
  game.frames(game.run("EVOLUTION_NOTICE_TICKS - runTick - 1"));
  assert.ok(game.run("evolutionNotification !== null"));
  game.frames(1);
  assert.equal(game.run("evolutionNotification"), null);
});

test("HUD reports interval mass progress, current form, and the final goal", () => {
  const game = createGame();
  beginGame(game, true);
  for (const index of [0, 1, 2]) {
    game.run(`{ const from = EVOLUTION_FORMS[${index}].mass;
      const to = EVOLUTION_FORMS[${index + 1}]?.mass ?? FINAL_MASS_MILESTONE;
      setBodyMass(player, (from + to) / 2); updatePlayerEvolution(); drawGame(); }`);
    close(game.run("getEvolutionProgress().fraction"), 0.5);
    assert.equal(game.run("getEvolutionProgress().label"), ["Moon", "Planet", "True Star Devourer"][index]);
    assert.ok(game.context.texts.includes(`Form: ${["Asteroid", "Moon", "Planet"][index]}`));
    assert.ok(game.context.texts.some(text => text.startsWith(`Next: ${["Moon", "Planet", "True Star Devourer"][index]} 50.0%`)));
  }
});

test("a grown player eats offscreen prey within its physical collision footprint", () => {
  const game = createGame(400, 300);
  beginGame(game, true);
  game.run("difficultyFactor = 1; setBodyMass(player, EVOLUTION_FORMS[2].mass); updatePlayerEvolution(); const prey = addBody(1000, 0, 30);");
  assert.ok(game.run("!isBodyVisible(prey) && star_objects.includes(prey)"));
  game.frames(1);
  assert.equal(game.run("score"), 1);
  assert.equal(game.run("player.mass"), 1440900);
  assert.ok(game.run("world.consumedIds.has(prey.id)"));
});

test("only the explicit final mass milestone ends the run, preserving its world", () => {
  const game = createGame();
  beginGame(game, true);
  game.run(`difficultyFactor = 1; score = 9999;
    setBodyMass(player, FINAL_MASS_MILESTONE - 100); updatePlayerEvolution();
    const originalWorld = world; const originalSeed = runSeed; addBody(0, 0, 10);`);
  assert.equal(game.run("gameState"), "playing");
  game.frames(1);
  assert.equal(game.run("gameState"), "ending");
  assert.equal(game.run("player.mass"), 4000000);
  assert.equal(game.run("player.type"), "planet");
  assert.equal(game.run("getEvolutionProgress().fraction"), 1);
  assert.ok(game.run("world === originalWorld && runSeed === originalSeed && world.consumedIds.size === 1"));
  assert.equal(game.run("score"), 10000);
  game.frames(30);
  assert.equal(game.run("runTick"), 1);
  assert.ok(game.context.texts.includes("Final Mass: 4.00M | Score: 10000"));
  game.run("keyPressed();");
  assert.equal(game.run("gameState"), "playing");
  assert.equal(game.run("player.mass"), 400);
  assert.equal(game.run("score"), 0);
});

test("death restart resets growth and run data while keeping selected difficulty", () => {
  const game = createGame();
  beginGame(game, true);
  game.run(`selectedDifficultyIndex = 4; difficultyFactor = 1.2;
    setBodyMass(player, EVOLUTION_FORMS[1].mass); updatePlayerEvolution();
    score = 75; runTick = 900; player.x = -1000; player.y = 2000;
    world.consumedIds.add('old-meal'); const oldWorld = world; const oldSeed = runSeed;
    addBody(player.x, player.y, player.r, 0, 0, 'planet');`);
  game.frames(1);
  assert.equal(game.run("gameState"), "gameover");
  game.run("simulationAccumulator = 7; keyPressed();");
  assert.deepEqual(game.json("({ type: player.type, mass: player.mass, r: player.r, x: player.x, y: player.y, vx: player.vx, vy: player.vy })"),
    { type: "asteroid", mass: 400, r: 20, x: 0, y: 0, vx: 0, vy: 0 });
  assert.equal(game.run("selectedDifficultyIndex"), 4);
  assert.equal(game.run("difficultyFactor"), 1.2);
  assert.equal(game.run("world.difficulty"), 1.2);
  assert.equal(game.run("currentFormIndex"), 0);
  assert.equal(game.run("evolutionNotification"), null);
  assert.equal(game.run("runTick"), 0);
  assert.equal(game.run("score"), 0);
  assert.equal(game.run("simulationAccumulator"), 0);
  assert.equal(game.run("world.consumedIds.size"), 0);
  assert.ok(game.run("world !== oldWorld && runSeed !== oldSeed"));
  assert.deepEqual(game.json("[player.gravityVx, player.gravityVy, player.gravityAx, player.gravityAy]"), [0, 0, 0, 0]);
});

test("a pinned seed restarts the same layout with fresh bodies and consumption records", () => {
  const game = createGame();
  beginGame(game);
  game.context.window = { location: { search: "?fixture=scale&seed=42" } };
  game.run("startGame(); const originalBodies = JSON.stringify(allBodies()); player.x = 180; followPlayer(); updateGame();");
  assert.ok(game.run("world.consumedIds.has('fixture:0')"));
  game.run("gameState = 'gameover'; keyPressed();");
  assert.equal(game.run("runSeed"), 42);
  assert.equal(game.run("world.consumedIds.size"), 0);
  assert.ok(game.run("JSON.stringify(allBodies()) === originalBodies"));
});

test("growth, evolution, and notice expiration are equivalent at 30/60/144 render FPS", () => {
  const snapshots = [];
  for (const fps of [30, 60, 144]) {
    const game = createGame();
    beginGame(game, true);
    game.run("difficultyFactor = 1; setBodyMass(player, EVOLUTION_FORMS[1].mass - 100); addBody(0, 0, 10); mouseX = width / 2 + 96;");
    game.frames(fps * 4, fps);
    assert.equal(game.run("player.type"), "moon");
    assert.equal(game.run("runTick"), 240);
    assert.equal(game.run("evolutionNotification"), null);
    snapshots.push(game.json("({ player, currentFormIndex, score, gameState, runTick, consumed: [...world.consumedIds] })"));
  }
  assert.deepEqual(snapshots[0], snapshots[1]);
  assert.deepEqual(snapshots[1], snapshots[2]);
});

test("coordinate conversions round-trip at every zoom and signed world position", () => {
  const game = createGame();
  beginGame(game, true);
  for (const zoom of [0.1, 0.25, 0.6, 1]) {
    game.run(`camera.zoom = ${zoom}; player.x = -12345; player.y = 9876; followPlayer();`);
    assert.deepEqual(game.json("worldToScreen(player.x, player.y)"), { x: 800, y: 450 });
    const position = game.json("worldToScreen(player.x + 1000, player.y - 500)");
    close(position.x, 800 + 1000 * zoom);
    close(position.y, 450 - 500 * zoom);
    const inverse = game.json(`screenToWorld(${position.x}, ${position.y})`);
    close(inverse.x, -11345);
    close(inverse.y, 9376);
  }
});

test("size targets and actual zoom obey configurable bounds with visible growth", () => {
  const game = createGame(1600, 900, 1, { CAMERA_MIN_ZOOM: 0.2, CAMERA_MAX_ZOOM: 1.25 });
  beginGame(game, true);
  assert.equal(game.run("targetZoomForRadius(20)"), 1.25);
  assert.equal(game.run("targetZoomForRadius(1e9)"), 0.2);
  const radii = [20, 64, 120, 300, 1200, 2000, 1e6];
  const targets = radii.map(radius => game.run(`targetZoomForRadius(${radius})`));
  assert.ok(targets.every(value => value >= 0.2 && value <= 1.25));
  assert.ok(targets.every((value, index) => index === 0 || value <= targets[index - 1]));
  assert.ok(game.run("1200 * targetZoomForRadius(1200) > 120 * targetZoomForRadius(120)"));
  game.run("camera.zoom = 100; setBodyMass(player, massForRadius(1200)); updateCamera(1 / 60);");
  assert.ok(game.run("camera.zoom >= CAMERA_MIN_ZOOM && camera.zoom <= CAMERA_MAX_ZOOM"));
});

test("zoom easing is frame-rate independent and reveals space gradually after growth", () => {
  const values = [];
  for (const fps of [30, 60, 144]) {
    const game = createGame();
    beginGame(game, true);
    game.run(`setBodyMass(player, massForRadius(300));
      const zoomBefore = camera.zoom; updateCamera(1 / ${fps});`);
    assert.ok(game.run("camera.zoom < zoomBefore && camera.zoom > camera.targetZoom"));
    assert.ok(game.run("player.r * camera.zoom > player.r * camera.targetZoom"));
    game.run(`for (let i = 1; i < ${fps * 3}; i++) updateCamera(1 / ${fps});`);
    values.push(game.run("camera.zoom"));
  }
  close(values[0], values[1], 1e-12);
  close(values[1], values[2], 1e-12);
});

test("camera updates leave body state, mass, force inputs, and collision results untouched", () => {
  const game = createGame();
  beginGame(game, true);
  game.run(`player.x = -700; player.y = 400; player.vx = 123; player.vy = -45;
    player.externalAx = 37; player.externalAy = -28;
    setBodyMass(player, massForRadius(300));
    const target = addBody(-600, 400, 10, -60, 0); followPlayer();
    const collided = bodiesCollidedDuringStep(-900, 400, -600, 400, target);`);
  const before = game.json("({ player, bodies: allBodies(), runTick, score, consumed: [...world.consumedIds] })");
  game.run("for (let i = 0; i < 120; i++) updateCamera(1 / 60);");
  assert.deepEqual(game.json("({ player, bodies: allBodies(), runTick, score, consumed: [...world.consumedIds] })"), before);
  assert.equal(game.run("bodiesCollidedDuringStep(-900, 400, -600, 400, target)"), game.run("collided"));
});

test("steering direction, throttle, and physical integration are identical across zooms", () => {
  const snapshots = [];
  for (const zoom of [0.1, 0.35, 1]) {
    const game = createGame();
    beginGame(game, true);
    game.run(`camera.zoom = ${zoom}; mouseX = width / 2 + 96; mouseY = height / 2 + 20;
      player.externalAx = 10; player.externalAy = -20;
      for (let i = 0; i < 60; i++) movePlayer();`);
    snapshots.push(game.json("player"));
  }
  assert.deepEqual(snapshots[0], snapshots[1]);
  assert.deepEqual(snapshots[1], snapshots[2]);
});

test("world generation, moving bodies, collisions, and consumption do not depend on zoom", () => {
  const snapshots = [];
  for (const zoom of [0.1, 0.4, 1]) {
    const game = createGame();
    beginGame(game);
    game.run(`camera.zoom = ${zoom};
      const food = star_objects.find(b => b.r < player.r);
      player.x = food.x; player.y = food.y; followPlayer(); updateGame();
      player.y = 0; mouseX = width / 2 + 180;
      for (let i = 0; i < 120 && gameState === 'playing'; i++) updateGame();`);
    assert.ok(game.run("score > 0"));
    snapshots.push(game.json(`({ player, runTick, gameState, score,
      bodies: allBodies().sort((a,b) => a.id.localeCompare(b.id)),
      generated: [...world.generatedRegions], consumed: [...world.consumedIds],
      active: star_objects.map(b => b.id) })`));
  }
  assert.deepEqual(snapshots[0], snapshots[1]);
  assert.deepEqual(snapshots[1], snapshots[2]);
});

test("resize at low zoom preserves physical and visual state while keeping the player centered", () => {
  const game = createGame();
  beginGame(game, true);
  game.run(`player.x = -6000; player.y = 12000; player.vx = 120;
    camera.zoom = 0.2; camera.targetZoom = 0.1; followPlayer();
    const distant = addBody(player.x + 2200, player.y, 1800, 0, 0, 'planet');
    runTick = 2; recordMovementTrail(); updateParallax();`);
  const before = game.json("({ player, bodies: allBodies(), movementVisuals, zoom: camera.zoom, target: camera.targetZoom, runTick })");
  for (const [width, height] of [[400, 300], [1920, 1080]]) {
    game.run(`windowWidth = ${width}; windowHeight = ${height}; windowResized();`);
    assert.deepEqual(game.json("({ player, bodies: allBodies(), movementVisuals, zoom: camera.zoom, target: camera.targetZoom, runTick })"), before);
    assert.deepEqual(game.json("worldToScreen(player.x, player.y)"), { x: width / 2, y: height / 2 });
  }
});

test("zoomed views render distant dormant bodies and oversized surfaces without waking them", () => {
  const game = createGame(400, 300);
  beginGame(game, true);
  game.run(`const small = addBody(1800, 0, 10, 120);
    const planet = addBody(3500, 0, 1800, 0, 0, 'planet');
    const before = JSON.stringify(small); camera.zoom = 0.1;`);
  assert.ok(game.run("!star_objects.includes(small) && getRenderableBodies().includes(small)"));
  assert.ok(game.run("getRenderableBodies().includes(planet) && isBodyVisible(planet) && planet.x > width / (2 * camera.zoom)"));
  game.run("updateGame(); getRenderableBodies();");
  assert.ok(game.run("JSON.stringify(small) === before"));
});

test("widest supported view has generated coverage before the camera zooms out", () => {
  const game = createGame();
  beginGame(game);
  game.run("const regionCount = world.generatedRegions.size; camera.zoom = CAMERA_MIN_ZOOM; const visible = getRenderableBodies(); syncWorldRegions();");
  assert.equal(game.run("world.generatedRegions.size"), game.run("regionCount"));
  assert.ok(game.run("visible.some(b => Math.abs(b.x - player.x) > 5000)"));
  assert.ok(game.run("visible.some(b => b.type === 'planet')"));
});

test("LOD and render budgets keep large/near bodies while preserving hidden body state", () => {
  const game = createGame();
  beginGame(game, true);
  game.run(`camera.zoom = CAMERA_MIN_ZOOM;
    for (let i = 0; i < MAX_RENDER_BODIES + 20; i++) storeWorldBody(world, body(3000 + i / 10, 2000, 6));
    for (let i = 0; i < MAX_DETAILED_BODIES + 20; i++) storeWorldBody(world, body(4000 + i / 10, 1500, 60));
    const planet = addBody(8500, 0, 1800, 0, 0, 'planet');
    const before = JSON.stringify(allBodies());
    const rendered = getRenderableBodies();
    const detailFlags = []; const realDrawBody = drawBody;
    drawBody = (b, isPlayer, detailed = true) => { if (!isPlayer) detailFlags.push(detailed); realDrawBody(b, isPlayer, detailed); };
    drawGame();`);
  assert.equal(game.run("rendered.length"), 1600);
  assert.ok(game.run("rendered.includes(planet)"));
  assert.equal(game.run("detailFlags.filter(Boolean).length"), game.run("MAX_DETAILED_BODIES"));
  assert.ok(game.run("detailFlags.includes(false) && JSON.stringify(allBodies()) === before"));
});

test("trail samples are bounded, zoom-independent, fade at rest, and reset on a new run", () => {
  const snapshots = [];
  for (const zoom of [0.1, 1]) {
    const game = createGame();
    beginGame(game, true);
    game.run(`camera.zoom = ${zoom}; mouseX = width / 2 + 180;
      for (let i = 0; i < 300; i++) updateGame();`);
    assert.ok(game.run("movementVisuals.trail.length > 2 && movementVisuals.trail.length <= TRAIL_MAX_POINTS"));
    snapshots.push(game.json("movementVisuals.trail"));
    game.run("mouseX = width / 2;");
    game.frames(200);
    assert.equal(game.run("movementVisuals.trail.length"), 0);
    game.run("startGame({ seed: 42, fixture: true });");
    assert.equal(game.run("movementVisuals.trail.length"), 0);
  }
  assert.deepEqual(snapshots[0], snapshots[1]);
});

test("parallax is deterministic decoration with distinct depths and no physics side effects", () => {
  const game = createGame();
  beginGame(game, true);
  game.run(`const original = JSON.stringify({ player, bodies: allBodies(), runTick, score });
    const far = movementVisuals.layers[0], near = movementVisuals.layers[1];
    const star = { u: 0.5, v: 0.5 }; const farStart = parallaxStarPosition(far, star);
    const nearStart = parallaxStarPosition(near, star);
    movementVisuals.parallaxX = 100;
    const farEnd = parallaxStarPosition(far, star); const nearEnd = parallaxStarPosition(near, star);
    drawParallax();`);
  close(game.run("farStart.x - farEnd.x"), 3.5);
  close(game.run("nearStart.x - nearEnd.x"), 9);
  assert.ok(game.run("original === JSON.stringify({ player, bodies: allBodies(), runTick, score })"));
  assert.equal(game.run("movementVisuals.layers.reduce((n, layer) => n + layer.stars.length, 0)"), 140);
});

test("HUD and evolution notification stay in screen space under a scaled camera", () => {
  const game = createGame();
  beginGame(game, true);
  let transform = { x: 0, y: 0, s: 1 };
  const stack = [];
  const textPositions = [];
  const bodyPositions = [];
  game.context.push = () => stack.push({ ...transform });
  game.context.pop = () => { transform = stack.pop(); };
  game.context.translate = (x, y) => { transform.x += x * transform.s; transform.y += y * transform.s; };
  game.context.scale = s => { transform.s *= s; };
  game.context.text = (text, x, y) => textPositions.push({ text, x: transform.x + x * transform.s, y: transform.y + y * transform.s, scale: transform.s });
  game.context.drawBody = body => bodyPositions.push({ id: body.id,
    x: transform.x + body.x * transform.s, y: transform.y + body.y * transform.s, radius: body.r * transform.s });
  game.run("player.x = -2000; player.y = 7000; camera.zoom = 0.1; followPlayer(); setBodyMass(player, EVOLUTION_FORMS[1].mass); updatePlayerEvolution(); drawGame();");
  assert.equal(textPositions[0].x, 20);
  assert.equal(textPositions[0].y, 20);
  assert.ok(textPositions.every(position => position.scale === 1));
  assert.deepEqual(textPositions.at(-1), { text: "Evolved into Moon!", x: 800, y: 720, scale: 1 });
  assert.deepEqual(bodyPositions.find(body => body.id === "player"), { id: "player", x: 800, y: 450, radius: 12 });
});

test("gravity sources are configurable moons/planets and never the evolved player", () => {
  const game = createGame();
  beginGame(game, true);
  game.run(`const moonSource = createBody('moon', 'moon', 1000, 0, 240, seededRandom(1));
    const planetSource = createBody('planet', 'planet', 2000, 0, 600, seededRandom(2));
    setBodyMass(player, EVOLUTION_FORMS[2].mass); updatePlayerEvolution();`);
  assert.ok(game.run("isGravitySource(moonSource) && isGravitySource(planetSource) && !isGravitySource(player)"));
  assert.equal(game.run("gravityInfluenceRadius(planetSource)"), 4200);
  assert.equal(game.run("gravityFromSource(body(0, 0, 10), player).ax"), 0);
  game.run("GRAVITY_SOURCE_PROFILES.moon.enabled = false;");
  assert.equal(game.run("isGravitySource(moonSource)"), false);
  assert.ok(game.run("isGravitySource(planetSource)"));
});

test("gravity attraction points toward the source and falls off outside the surface", () => {
  const game = createGame();
  beginGame(game, true);
  game.run("const source = addSource(0, 0); const left = gravityFromSource(body(-900, 0, 10), source); const top = gravityFromSource(body(0, -900, 10), source);");
  assert.ok(game.run("left.ax > 0 && top.ay > 0"));
  assert.equal(game.run("left.ay"), 0);
  assert.equal(game.run("top.ax"), 0);
  assert.ok(game.run("gravityFromSource(body(-900, 0, 10), source).ax > gravityFromSource(body(-1800, 0, 10), source).ax"));
});

test("softened gravity is finite at zero separation and acceleration caps hold", () => {
  const game = createGame();
  beginGame(game, true);
  game.run("const source = addSource(0, 0, 1800);");
  assert.deepEqual(game.json("gravityFromSource(body(0, 0, 10), source)"), { ax: 0, ay: 0 });
  for (const distance of [1e-12, 0.01, 40, 400, 1800, 5000, 6000]) {
    const force = game.json(`gravityFromSource(body(-${distance}, 0, 10), source)`);
    assert.ok(Number.isFinite(force.ax) && Number.isFinite(force.ay));
    assert.ok(Math.hypot(force.ax, force.ay) <= 500 + 1e-9);
  }
  game.run("const dense = Array.from({ length: 20 }, (_, i) => addSource(100 + i, 0, 1800));");
  assert.ok(game.run("Math.hypot(...Object.values(gravityAcceleration(player, dense))) <= GRAVITY_MAX_ACCELERATION + 1e-9"));
});

test("gravity cutoff has a smooth zero limit from inside and no force outside", () => {
  const game = createGame();
  beginGame(game, true);
  game.run("const source = addSource(0, 0); const influence = gravityInfluenceRadius(source);");
  assert.deepEqual(game.json("gravityFromSource(body(influence, 0, 10), source)"), { ax: 0, ay: 0 });
  assert.deepEqual(game.json("gravityFromSource(body(influence + 0.01, 0, 10), source)"), { ax: 0, ay: 0 });
  const forces = [1, 0.1, 0.01].map(delta => Math.abs(game.run(`gravityFromSource(body(influence - ${delta}, 0, 10), source).ax`)));
  assert.ok(forces[1] < forces[0] / 50 && forces[2] < forces[1] / 50);
  assert.ok(forces[2] < 1e-6);
});

test("multiple gravity sources add vectors before the combined acceleration cap", () => {
  const game = createGame();
  beginGame(game, true);
  game.run(`const a = addSource(1000, 0), b = addSource(0, 1200);
    const forceA = gravityFromSource(player, a), forceB = gravityFromSource(player, b);
    const sum = gravityAcceleration(player, [a,b]);`);
  close(game.run("sum.ax"), game.run("forceA.ax + forceB.ax"));
  close(game.run("sum.ay"), game.run("forceA.ay + forceB.ay"));
  game.run("b.x = -1000; b.y = 0;");
  close(game.run("gravityAcceleration(player, [a,b]).ax"), 0);
});

test("all forces use tick-start positions and each body integrates exactly once", () => {
  for (const sourceX of [0, 2000]) {
    const game = createGame();
    beginGame(game, true);
    game.run(`player.x = -1100;
      const source = addSource(${sourceX}, 0, 600, 'planet', 60);
      const small = addBody(-1000, -400, 10, 0, 100);
      updateGravitySources(true);
      const expectedPlayer = gravityFromSource(player, source);
      const expectedSmall = gravityFromSource(small, source);
      const counts = new Map(); const realIntegrate = integrateBody;
      integrateBody = b => { counts.set(b.id, (counts.get(b.id) || 0) + 1); realIntegrate(b); };
      updateGame();`);
    close(game.run("player.vx"), game.run("expectedPlayer.ax / SIMULATION_FPS"));
    close(game.run("small.vx"), game.run("expectedSmall.ax / SIMULATION_FPS"));
    close(game.run("source.x"), sourceX + 1);
    assert.equal(game.run("source.vx"), 60);
    assert.equal(game.run("source.ax"), 0);
    assert.ok(game.run("[...counts.values()].every(count => count === 1) && counts.size === 3"));
  }
});

test("massive sources follow prescribed velocities without mutual gravitational reactions", () => {
  const game = createGame();
  beginGame(game, true);
  game.run(`const planet = addSource(1100, 500, 600, 'planet', 60, -30);
    const moon = addSource(-1000, -400, 240, 'moon', -60, 30);
    updateGravitySources(true); updateGame();`);
  close(game.run("planet.x"), 1101);
  close(game.run("planet.y"), 499.5);
  close(game.run("moon.x"), -1001);
  assert.deepEqual(game.json("[planet.ax, planet.ay, moon.ax, moon.ay]"), [0, 0, 0, 0]);
  assert.deepEqual(game.json("[planet.vx, planet.vy, moon.vx, moon.vy]"), [60, -30, -60, 30]);
});

test("offscreen sources warm up before field entry and persist across signed region seams", () => {
  const game = createGame(400, 300);
  beginGame(game, true);
  game.run("player.x = -5500; const source = addSource(0, 0); updateGravitySources(true);");
  game.run(`let firstForce = false;
    for (let x = -5500; x <= -3900; x += 20) {
      player.x = x; syncWorldRegions(); const sources = updateGravitySources();
      const actual = gravityAcceleration(player, sources); const raw = gravityFromSource(player, source);
      if (raw.ax > 0 && !firstForce) {
        if (world.gravitySources.get(source.id).activation !== 1) throw new Error('Late field activation');
        firstForce = true;
      }
      if (Math.abs(actual.ax - raw.ax) > 1e-9) throw new Error('Field changed at region seam');
    }`);
  assert.ok(game.run("firstForce && !star_objects.includes(source)"));
  assert.ok(game.run("gravityAcceleration(player, updateGravitySources()).ax > 0"));
});

test("source-budget changes fade overlapping fields and keep source caches bounded", () => {
  const game = createGame(1600, 900, 1, { GRAVITY_MAX_SOURCES: 1 });
  beginGame(game, true);
  game.run(`const right = addSource(1000, 0), left = addSource(-1001, 0);
    updateGravitySources(true);
    const before = gravityAcceleration(player, [...world.gravitySources.values()]);
    player.x = -2; const after = gravityAcceleration(player, updateGravitySources());`);
  assert.ok(game.run("before.ax > 0 && after.ax > 0 && Math.abs(after.ax - before.ax) < 10"));
  assert.ok(game.run("world.gravitySources.size <= GRAVITY_MAX_SOURCES * 2"));
  game.run("for (let i = 0; i < 30; i++) updateGravitySources();");
  assert.ok(game.run("world.gravitySources.size === 1 && world.gravitySources.has(left.id)"));
});

test("gravity bends the close-pass path and can add speed above steering's speed cap", () => {
  const game = createGame();
  beginGame(game);
  game.run(`const scenario = loadGravityScenario('close');
    let closest = Infinity; let fastest = 0;
    for (let i = 0; i < scenario.ticks; i++) {
      steerGravityScenario(scenario); updateGame();
      closest = Math.min(closest, Math.hypot(player.x, player.y) - player.r - 600);
      fastest = Math.max(fastest, Math.hypot(player.vx, player.vy));
      if (gameState !== 'playing') throw new Error('Close-pass collision');
    }`);
  assert.ok(game.run("player.y > -1050 && closest > 20"));
  assert.ok(game.run("fastest > PLAYER_MAX_SPEED + 10 && fastest <= PLAYER_MAX_SPEED + PLAYER_MAX_DRIFT_SPEED + 1e-8"));
});

test("full outward steering escapes a near-surface field while preserving inward drift", () => {
  const game = createGame();
  beginGame(game);
  game.run(`const scenario = loadGravityScenario('escape');
    const initialDrift = player.gravityVx;
    updateGame(); const retainedDrift = player.gravityVx;
    for (let i = 1; i < scenario.ticks; i++) {
      steerGravityScenario(scenario); updateGame();
      if (gameState !== 'playing') throw new Error('Escape collision');
    }`);
  assert.ok(game.run("retainedDrift < initialDrift"));
  assert.ok(game.run("player.x > 4400 && player.vx > 0"), JSON.stringify(game.json("({ x:player.x, vx:player.vx })")));
  assert.equal(game.run("player.gravityAx"), 0);
});

test("procedural starts are free of gravity fields and remain physically stationary at neutral input", () => {
  const game = createGame();
  beginGame(game);
  assert.ok(game.run("allBodies().filter(isGravitySource).every(s => Math.hypot(s.x, s.y) >= gravityInfluenceRadius(s) + START_SAFE_RADIUS)"));
  game.frames(120);
  assert.equal(game.run("player.x"), 0);
  assert.equal(game.run("player.y"), 0);
  assert.equal(game.run("gameState"), "playing");
});

test("consuming a source removes its field permanently without creating player gravity", () => {
  const game = createGame();
  beginGame(game, true);
  game.run(`setBodyMass(player, massForRadius(700)); updatePlayerEvolution();
    const source = addSource(1000, 0); updateGravitySources(true); updateGame();`);
  assert.ok(game.run("world.consumedIds.has(source.id) && !world.gravitySources.has(source.id)"));
  game.run("updateGame();");
  assert.equal(game.run("player.gravityAx"), 0);
  assert.equal(game.run("isGravitySource(player)"), false);
  game.run("player.x = -30000; syncWorldRegions(); updateGravitySources(); player.x = 0; syncWorldRegions(); updateGravitySources();");
  assert.ok(game.run("!allBodies().some(b => b.id === source.id) && !world.gravitySources.has(source.id)"));
});

test("small-body softened trajectories remain finite and speed-bounded over long integration", () => {
  const game = createGame();
  beginGame(game, true);
  game.run(`const source = addSource(0, 0), small = body(900, 0, 12, 0, 200);
    for (let i = 0; i < 1200; i++) {
      accumulateBodyForces(small, [source]); integrateBody(small);
      if (![small.x, small.y, small.vx, small.vy].every(Number.isFinite)) throw new Error('Non-finite trajectory');
      if (Math.hypot(small.vx, small.vy) > GRAVITY_SMALL_BODY_MAX_SPEED + 1e-8) throw new Error('Unbounded speed');
    }`);
  assert.equal(game.run("small.mass"), 144);
});

test("all four gravity scenarios are deterministic and equivalent at 30/60/144 render FPS", () => {
  for (const name of ["one", "multiple", "close", "escape"]) {
    const snapshots = [];
    for (const fps of [30, 60, 144]) {
      const game = createGame();
      beginGame(game);
      game.run(`const scenario = loadGravityScenario('${name}');`);
      const ticks = game.run("scenario.ticks");
      game.frames(ticks / 60 * fps, fps);
      assert.equal(game.run("runTick"), ticks, name);
      assert.equal(game.run("gameState"), "playing", name);
      snapshots.push(game.json(`({ player, score, runTick, bodies: allBodies().sort((a,b) => a.id.localeCompare(b.id)),
        consumed: [...world.consumedIds], sources: [...world.gravitySources].map(([id,e]) => [id,e.activation]) })`));
    }
    assert.deepEqual(snapshots[0], snapshots[1], name);
    assert.deepEqual(snapshots[1], snapshots[2], name);
  }
});

test("crowded gravity queries and integration stay within their explicit budgets", () => {
  const game = createGame(1600, 900, 1, { GRAVITY_MAX_SOURCES: 4 });
  beginGame(game, true);
  game.run(`for (let i = 0; i < MAX_ACTIVE_BODIES + 20; i++) storeWorldBody(world, body(300 + i / 10, 700, 6));
    for (let i = 0; i < 30; i++) addSource(2000 + i * 10, 100, 600);
    updateGravitySources(true);
    let integrations = 0; const realIntegration = integrateBody;
    integrateBody = body => { integrations++; realIntegration(body); };
    updateGame();`);
  assert.ok(game.run("world.gravitySources.size <= 2 * GRAVITY_MAX_SOURCES"));
  assert.ok(game.run("integrations <= 1 + MAX_ACTIVE_BODIES + 2 * GRAVITY_MAX_SOURCES"));
  assert.ok(game.run("Math.hypot(player.gravityAx, player.gravityAy) <= GRAVITY_MAX_ACCELERATION + 1e-8"));
});

test("outward thrust retains escape authority even at maximum inward gravity drift", () => {
  const game = createGame();
  beginGame(game);
  game.run(`const scenario = loadGravityScenario('escape');
    player.vx = player.gravityVx = -PLAYER_MAX_DRIFT_SPEED;
    let clearance = Infinity;
    for (let i = 0; i < 900; i++) {
      steerGravityScenario(scenario); updateGame();
      clearance = Math.min(clearance, Math.hypot(player.x, player.y) - 600 - player.r);
      if (gameState !== 'playing') throw new Error('Maximum-drift escape failed');
    }`);
  assert.ok(game.run("PLAYER_MAX_DRIFT_SPEED < PLAYER_MAX_SPEED && clearance > 0 && player.x > 4400"));
});

test("food/danger rims match the strict eating threshold on every difficulty and LOD", () => {
  const game = createGame(); beginGame(game, true);
  assert.deepEqual(game.json("getThreatVisual(19.999, 20).ring"), [92, 244, 176, 235]);
  assert.deepEqual(game.json("getThreatVisual(20, 20).ring"), [255, 112, 110, 240]);
  const strokes = []; game.context.stroke = (...color) => strokes.push(color);
  game.run("selectedDifficultyIndex = 4; const food = body(100, 0, 19.999), danger = body(200, 0, 20); drawBody(food); drawBody(danger, false, false);");
  assert.ok(strokes.some(c => c[0] === 92 && c[1] === 244));
  assert.ok(strokes.some(c => c[0] === 255 && c[1] === 112));
});

test("massive-body warnings use surface extent, relative closing speed, and radius", () => {
  const game = createGame(400, 300); beginGame(game, true);
  game.run("const planet = addSource(6000, 0, 1800); player.vx = 1200; const fast = hazardMetrics(planet);");
  assert.ok(game.run("fast && fast.surfaceGap === 4180 && !isBodyVisible(planet)"));
  game.run("player.vx = 300; const slow = hazardMetrics(planet); planet.vx = 1200; player.vx = 1200; const matching = hazardMetrics(planet);");
  assert.equal(game.run("slow"), null); assert.equal(game.run("matching"), null);
  game.run("planet.vx = -1200; player.vx = 0; const movingToward = hazardMetrics(planet); setBodyMass(planet,massForRadius(600)); const small = hazardMetrics(planet);");
  assert.ok(game.run("movingToward && small === null && collectHazardWarnings().length === 0"));
  game.run("setBodyMass(planet,massForRadius(1800));");
  assert.equal(game.run("collectHazardWarnings()[0].id"), game.run("planet.id"));
});

test("warnings reject distant receding bodies, edible sources, and harmless tangential paths", () => {
  const game = createGame(); beginGame(game, true);
  game.run("const planet = addSource(3000, 0); player.vx = -1200;");
  assert.equal(game.run("hazardMetrics(planet)"), null);
  game.run("player.vx = 1200; player.vy = 1200;");
  assert.equal(game.run("hazardMetrics(planet)"), null);
  game.run("player.x = 2300; player.vx = -1200; player.vy = 0;");
  assert.ok(game.run("hazardMetrics(planet).priority === 0"));
  game.run("setBodyMass(player, massForRadius(700));");
  assert.equal(game.run("hazardMetrics(planet)"), null);
});

test("threat assistance warns earlier without hiding essential warnings on Hard", () => {
  const game = createGame(); beginGame(game, true);
  game.run("const planet = addSource(4500, 0); player.vx = 1200; selectedDifficultyIndex = 1;");
  assert.ok(game.run("hazardMetrics(planet) !== null"));
  game.run("selectedDifficultyIndex = 3;");
  assert.equal(game.run("hazardMetrics(planet)"), null);
  game.run("player.x = 1500;");
  assert.ok(game.run("hazardMetrics(planet) !== null"));
});

test("indicator layout bounds clutter, prioritizes urgency, and avoids HUD and notices", () => {
  const game = createGame(); beginGame(game, true);
  game.run(`for (const [x,y] of [[1100,0],[0,1000],[-1100,0],[0,-1200],[1150,10]]) addSource(x,y);
    evolutionNotification = { text: 'Evolved', expiresAtTick: 100 };
    const warnings = collectHazardWarnings(); const layout = layoutHazardIndicators(warnings);`);
  // At rest the near-surface sources produce warnings; far sources do not.
  game.run("player.vx = 1200; player.vy = 1200; const movingLayout = layoutHazardIndicators(collectHazardWarnings());");
  assert.ok(game.run("movingLayout.length > 0 && movingLayout.length <= HAZARD_MAX_INDICATORS"));
  for (const size of [[1600,900],[640,360],[320,180],[120,100]]) {
    [game.context.width, game.context.height] = size;
    game.run(`var synthetic = Array.from({length:12}, (_,i) => ({ id:String(i), type:'planet',
      ux:Math.cos(i*Math.PI/6), uy:Math.sin(i*Math.PI/6), closingSpeed:100, timeToSurface:i+1 }));
      var positions = layoutHazardIndicators(synthetic);
      var boxes = indicatorObstacles();
      for (const item of positions) for (const box of [item.arrow,item.label].filter(Boolean)) {
        if (![box.x,box.y,box.w,box.h].every(Number.isFinite)) throw new Error('Invalid indicator');
        if (box.x < 0 || box.y < 0 || box.x+box.w > width || box.y+box.h > height) throw new Error('Clipped indicator');
        if (boxes.some(other => rectanglesOverlap(box,other))) throw new Error('Overlapping indicators');
        boxes.push(box);
      }`);
    assert.ok(game.run("positions.length <= (width < 420 || height < 260 ? 1 : 3)"));
  }
});

test("gravity cue shows the actual net pull, cancels opposing fields, and stays in screen space", () => {
  const game = createGame(); beginGame(game, true);
  game.run("player.gravityAx = 200; player.gravityAy = -200; const cue = getPullCue(indicatorObstacles());");
  close(game.run("cue.angle"), -Math.PI / 4);
  const before = game.json("[player, [...world.regions], [...world.gravitySources], runTick]");
  game.run("camera.zoom = 0.1; drawHazardIndicators(); camera.zoom = 1; drawHazardIndicators();");
  assert.deepEqual(game.json("[player, [...world.regions], [...world.gravitySources], runTick]"), before);
  game.run("player.gravityAx = player.gravityAy = 0;");
  assert.equal(game.run("getPullCue([])"), null);
  game.run("const a = addSource(1000,0), b = addSource(-1000,0); updateGravitySources(true); accumulatePlayerForces(gravityAcceleration(player, updateGravitySources()));");
  assert.equal(game.run("getPullCue([])"), null);
});

test("hazard queries find oversized surfaces through signed seams without changing field state", () => {
  const game = createGame(400,300); beginGame(game, true);
  game.run("const planet = addSource(-1024, -1024, 1800); player.vx = 1200; player.y = -1024;");
  for (const x of [-4097,-4096,-4095,-3073,-3072,-3071]) {
    game.run(`player.x = ${x}; followPlayer(); syncWorldRegions(); updateGravitySources(true);`);
    assert.equal(game.run("collectHazardWarnings()[0]?.id"), game.run("planet.id"));
    const force = game.json("gravityAcceleration(player, [...world.gravitySources.values()])");
    game.run("camera.zoom = 0.1; drawHazardIndicators(); windowWidth = 800; windowHeight = 500; windowResized();");
    assert.deepEqual(game.json("gravityAcceleration(player, [...world.gravitySources.values()])"), force);
  }
});

test("full consumption/evolution/gravity/death route matches at 30/60/144 FPS and restarts fresh", t => {
  const snapshots = [];
  for (const fps of [30,60,144]) {
    const game = createGame(); beginGame(game);
    game.run(`const route = loadIntegrationScenario();
      const realUpdate = updateGame;
      updateGame = () => { steerIntegrationScenario(route); realUpdate(); observeIntegrationScenario(route); };`);
    // A fixed duration lets death happen at the same tick, regardless of render cadence.
    game.frames(24 * fps, fps);
    const result = game.json(`({ tick:runTick, state:gameState, player, score, phase:route.phase,
      peakPull:route.peakPull, warnings:route.warnings, evolved:route.evolved, passClearance:route.passClearance,
      consumed:[...world.consumedIds], seed:runSeed, bodies:[...world.regions].flatMap(([,b])=>[...b.values()]) })`);
    assert.equal(result.state, "gameover", JSON.stringify(result));
    assert.equal(result.score, 10); assert.ok(result.evolved && result.peakPull > 100 && result.warnings > 0);
    assert.ok(result.passClearance > 100); assert.equal(result.phase, "impact");
    assert.ok(game.run("world === route.world && runSeed === route.seed && route.planet.type === 'planet'"));
    snapshots.push(result);
    game.run("const deadWorld = world; key = ' '; keyCode = 0; keyPressed();");
    assert.ok(game.run("gameState === 'playing' && world !== deadWorld && world.consumedIds.size === 0 && score === 0 && runTick === 0 && player.mass === EVOLUTION_FORMS[0].mass && player.x === 0 && player.y === 0 && player.vx === 0 && player.vy === 0"));
    assert.equal(game.run("selectedDifficultyIndex"), 2);
  }
  assert.deepEqual(snapshots[0],snapshots[1]); assert.deepEqual(snapshots[1],snapshots[2]);
  t.diagnostic(`Route: ${snapshots[0].tick} ticks, 10 meals, Moon evolution, peak pull ${snapshots[0].peakPull.toFixed(1)}, safe pass then lethal impact.`);
});

test("extended region streaming bounds active work and preserves eaten IDs on revisit", t => {
  const game = createGame(1280,720); beginGame(game);
  const started = performance.now();
  game.run(`const eaten = star_objects.find(b => b.type === 'asteroid'); consumeWorldBody(eaten);
    let maxima = {active:0, sources:0, rendered:0, warnings:0};
    camera.zoom = CAMERA_MIN_ZOOM;
    for (let step = -80; step <= 80; step++) {
      player.x = step * REGION_SIZE; player.y = Math.sin(step / 8) * REGION_SIZE * 2;
      followPlayer(); syncWorldRegions(); const sources = updateGravitySources();
      // Exercise the real receiver/source force pass in addition to streaming/render queries.
      for (const body of star_objects) accumulateBodyForces(body, sources);
      maxima.active = Math.max(maxima.active,star_objects.length);
      maxima.sources = Math.max(maxima.sources,world.gravitySources.size);
      maxima.rendered = Math.max(maxima.rendered,getRenderableBodies().length);
      maxima.warnings = Math.max(maxima.warnings,layoutHazardIndicators(collectHazardWarnings()).length);
    }
    player.x = player.y = 0; syncWorldRegions();
    const residents = allBodies(); const residentIds = new Set(residents.map(b=>b.id));`);
  assert.ok(game.run("maxima.active <= MAX_ACTIVE_BODIES && maxima.sources <= GRAVITY_MAX_SOURCES*2 && maxima.rendered <= MAX_RENDER_BODIES && maxima.warnings <= HAZARD_MAX_INDICATORS"));
  assert.ok(game.run("residents.length === residentIds.size && !residentIds.has(eaten.id) && world.consumedIds.has(eaten.id)"));
  t.diagnostic(JSON.stringify({ elapsedMs:Math.round(performance.now()-started), ...game.json("({ maxima, generated:world.generatedRegions.size, residents:residents.length })") }));
});

test("warning lead permits a delayed outward escape at maximum combined approach speed", t => {
  const game = createGame(320,180); beginGame(game, true);
  game.run(`player.x = -10500; player.vx = PLAYER_MAX_SPEED + PLAYER_MAX_DRIFT_SPEED;
    player.gravityVx = PLAYER_MAX_DRIFT_SPEED;
    const planet = addSource(0,0,1800); updateGravitySources(true);
    let warningTick = null, warningGap = null, minimumGap = Infinity;
    for (let i=0;i<2100;i++) {
      const warning = collectHazardWarnings().find(w=>w.id===planet.id);
      if (warning && warningTick === null) { warningTick = runTick; warningGap = warning.surfaceGap; }
      const react = warningTick !== null && runTick - warningTick >= HAZARD_ASSIST_REACTION_SECONDS * SIMULATION_FPS;
      mouseX = width/2 + (react ? -STEERING_MAX_DISTANCE : STEERING_MAX_DISTANCE); mouseY = height/2;
      updateGame();
      minimumGap = Math.min(minimumGap,Math.hypot(player.x,player.y)-planet.r-player.r);
      if (gameState !== 'playing') throw new Error('Warning arrived too late for escape');
      if (react && player.x < -gravityInfluenceRadius(planet) && player.vx < 0) break;
    }`);
  assert.ok(game.run("warningGap > 7000 && minimumGap > 100 && player.x < -gravityInfluenceRadius(planet) && player.vx < 0"));
  t.diagnostic(`First warning at surface gap ${game.run("warningGap").toFixed(0)}; minimum gap ${game.run("minimumGap").toFixed(0)} after 3.2 s reaction delay.`);
});

test("hazard priorities retain the urgent bearing and deduplicate aligned warnings", () => {
  const game = createGame(); beginGame(game, true);
  game.run(`const near = addSource(750,0), aligned = addSource(800,0), behind = addSource(-850,0), below = addSource(0,850);
    const warnings = collectHazardWarnings(); const positions = layoutHazardIndicators(warnings);`);
  assert.equal(game.run("warnings[0].id"), game.run("near.id"));
  assert.equal(game.run("positions[0].id"), game.run("near.id"));
  assert.ok(game.run("!positions.some(p=>p.id === aligned.id) && positions.length === 3"));
  game.run("selectedDifficultyIndex = 4;");
  assert.equal(game.run("layoutHazardIndicators(warnings).length"), 2);
});

test("compact HUD avoids the player center and all cue drawing is zoom independent", () => {
  const game = createGame(320,180); beginGame(game, true);
  assert.ok(game.run("getHudBounds().y + getHudBounds().h < height/2"));
  const positions = [];
  game.context.text = (text,x,y) => positions.push({text,x,y});
  game.run("const source = addSource(1500,0,600); player.vx = 1200; player.gravityAx = 200; drawGame();");
  const first = [...positions]; positions.length=0;
  game.run("camera.zoom = 0.1; drawGame();");
  assert.deepEqual(positions,first);
  assert.ok(positions.some(p=>p.text.startsWith("Form: ")));
});

test("suspended recovery with zoom, warnings, and fields runs only capped fixed ticks", () => {
  const game = createGame(); beginGame(game);
  game.run("const route = loadIntegrationScenario(); setBodyMass(player,massForRadius(100)); player.x = 7000; player.y = -1000; player.vx = 900; mouseX = width/2+180; followPlayer(); syncWorldRegions(); updateGravitySources(true); const before = {x:player.x,y:player.y,mass:player.mass};");
  game.context.deltaTime = 5 * 60 * 1000;
  game.run("runGame();");
  assert.equal(game.run("runTick"),15);
  assert.ok(game.run("Math.hypot(player.x-before.x,player.y-before.y) <= (PLAYER_MAX_SPEED+PLAYER_MAX_DRIFT_SPEED)*0.25 && player.mass === before.mass && camera.zoom >= CAMERA_MIN_ZOOM && camera.zoom <= CAMERA_MAX_ZOOM && simulationAccumulator < SIMULATION_STEP_MS"));
});

test("short viewports retain a truthful pull cue in every direction without HUD overlap", () => {
  const game = createGame(320,180); beginGame(game, true);
  for (const angle of [0, Math.PI/2, Math.PI, -Math.PI/2]) {
    game.run(`player.gravityAx = Math.cos(${angle}) * 300; player.gravityAy = Math.sin(${angle}) * 300; var cue = getPullCue(indicatorObstacles());`);
    assert.ok(game.run("cue && !rectanglesOverlap(cue.box,getHudBounds())"));
    close(game.run("cue.angle"),angle);
  }
});

test("a lone hazard retains its arrow on every bearing at narrow viewport breakpoints", () => {
  const game = createGame(); beginGame(game, true);
  for (const [w,h] of [[320,180],[420,260],[480,320],[640,360],[1600,900]]) {
    game.context.width=w; game.context.height=h;
    for (let i=0;i<24;i++) {
      const angle = i * Math.PI / 12;
      const positions = game.json(`layoutHazardIndicators([{id:'hazard',type:'planet',ux:Math.cos(${angle}),uy:Math.sin(${angle})}])`);
      assert.equal(positions.length,1,`${w}x${h}, bearing ${i}`);
      close(positions[0].angle,Math.atan2(Math.sin(angle),Math.cos(angle)));
    }
  }
});
