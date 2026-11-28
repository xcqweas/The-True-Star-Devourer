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
scripts.push({ filename: "tests/fragmentation-scenarios.js", source: fs.readFileSync(path.join(root, "tests/fragmentation-scenarios.js"), "utf8") });
scripts.push({ filename: "tests/ecology-scenarios.js", source: fs.readFileSync(path.join(root, "tests/ecology-scenarios.js"), "utf8") });
scripts.push({ filename: "tests/pacing-scenario.js", source: fs.readFileSync(path.join(root, "tests/pacing-scenario.js"), "utf8") });
scripts.push({ filename: "tests/massive-stage-scenarios.js", source: fs.readFileSync(path.join(root, "tests/massive-stage-scenarios.js"), "utf8") });

function createGame(width = 1600, height = 900, seed = 123456789, constants = {}) {
  const context = {
    Math, URLSearchParams, width, height, windowWidth: width, windowHeight: height,
    mouseX: width / 2, mouseY: height / 2,
    frameCount: 0, deltaTime: 1000 / 60, key: "", keyCode: 0,
    LEFT_ARROW: 37, RIGHT_ARROW: 39, TWO_PI: Math.PI * 2, PI: Math.PI,
    LEFT: "left", TOP: "top", CENTER: "center", CORNER: "corner", CLOSE: "close", texts: [],
    drawingContext: { globalAlpha: 1 },
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
  const alphaStack = [];
  context.push = () => alphaStack.push(context.drawingContext.globalAlpha);
  context.pop = () => { context.drawingContext.globalAlpha = alphaStack.pop(); };
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
    // Existing physics fixtures represent already-armed gameplay. Entry tests use the real transition below.
    steering.armed = steering.engaged = true; steering.rampTicks = STEERING_ACTIVATION_TICKS;
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

test("massive stage choice pauses at the former ending and preserves exact run state for both branches", () => {
  for (const [key, type] of [['1','massiveSolid'], ['2','gasGiant']]) {
    const game = createGame(); beginGame(game, true);
    game.run(`setBodyMass(player, MASSIVE_PLANET_STAGE.mass - 100); updatePlayerEvolution();
      player.x = -20000; player.y = 30000; player.vx = 123; player.vy = -45;
      score = 55; runTick = 321; world.consumedIds.add('earlier');
      const originalPlayer = player, originalWorld = world, originalSeed = runSeed;
      addBody(player.x, player.y, 10); updateGame();
      const frozen = JSON.stringify({player, runTick, score, ids:[...world.consumedIds]});
      const choiceZoom = camera.zoom;`);
    assert.equal(game.run('gameState'), 'evolving');
    assert.equal(game.run('player.mass'), 4000000);
    game.frames(60); game.run('updateGame();');
    assert.ok(game.run('frozen === JSON.stringify({player, runTick, score, ids:[...world.consumedIds]})'));
    assert.equal(game.run("choosePlayerEvolution('planet')"), false);
    game.run(`const motionBefore = [player.x,player.y,player.vx,player.vy,player.ax,player.ay];
      const zoomBefore = camera.zoom; key='${key}'; keyPressed();`);
    assert.equal(game.run('gameState'), 'playing');
    assert.equal(game.run('player.type'), type);
    assert.equal(game.run('player.mass'), 4000000);
    assert.ok(game.run('player === originalPlayer && world === originalWorld && runSeed === originalSeed'));
    assert.deepEqual(game.json('[player.x,player.y,player.vx,player.vy,player.ax,player.ay]'), game.json('motionBefore'));
    assert.equal(game.run('camera.zoom'), game.run('zoomBefore'));
    close(game.run('player.r'), 2000 * game.run(`bodyRadiusScale('${type}')`));
    assert.equal(game.run("choosePlayerEvolution('gasGiant')"), false);
    game.run('setBodyMass(player, 1000000); updatePlayerEvolution();');
    assert.equal(game.run('player.type'), type);
    game.run('setBodyMass(player, 5000000); updatePlayerEvolution();');
    assert.equal(game.run('gameState'), 'playing');
    assert.equal(game.run('pendingEvolutionIndex'), null);
    game.run('windowWidth=320;windowHeight=180;windowResized();drawGame();');
    assert.ok(game.context.texts.includes('Form: '+(type==='massiveSolid'?'Solid planet':'Gas giant')));
    game.run("gameState='gameover';key=' ';keyPressed();");
    assert.ok(game.run('currentFormIndex===0 && pendingEvolutionIndex===null && player.type==="asteroid" && player.mass===400'));
  }
});

test("massive choice supports mouse, excess mass, a configured ending and compact layouts", () => {
  for (const [width, height] of [[1600,900],[320,560],[320,180]]) {
    const game = createGame(width,height); beginGame(game,true);
    game.run(`setBodyMass(player, FINAL_MASS_MILESTONE + 123.5); updatePlayerEvolution(); draw();
      const boxes = evolutionChoiceBounds();`);
    assert.equal(game.run('gameState'), 'evolving');
    assert.ok(game.run('boxes.every(b=>b.x>=0 && b.y>=0 && b.x+b.w<=width && b.y+b.h<=height)'));
    game.run(`mouseX=boxes[1].x+boxes[1].w/2;mouseY=boxes[1].y+boxes[1].h/2;mousePressed();`);
    assert.equal(game.run('player.type'), 'gasGiant');
    assert.equal(game.run('gameState'), 'ending');
    assert.equal(game.run('player.mass'), game.run('FINAL_MASS_MILESTONE + 123.5'));
    assert.equal(game.run('getEvolutionProgress().fraction'),1);
  }
});

test("massive branches have different physical sweep and retention while feeding and rims retain their rules", t => {
  const game=createGame();beginGame(game,true);
  game.run(`const solid=body(0,0,1700,0,0,'massiveSolid'),gas=body(0,0,2800,0,0,'gasGiant');
    const peer=body(0,0,2000,0,0,'planet');peer.gravitySource=true;
    const solidLoss=impactMassLoss(solid,peer,900), gasLoss=impactMassLoss(gas,peer,900);`);
  close(game.run('solid.mass'),4000000);close(game.run('gas.mass'),4000000);
  close(game.run('solidLoss.a/gasLoss.a'),0.6/1.35);
  close(game.run('solidLoss.b'),game.run('gasLoss.b'));
  assert.equal(game.run('collisionDisposition(solid,peer)'),game.run('collisionDisposition(gas,peer)'));
  assert.deepEqual(game.json('getThreatVisual(peer.r,solid.r).ring'),[255,215,95,240]);
  assert.deepEqual(game.json('getThreatVisual(peer.r,gas.r).ring'),[92,244,176,235]);
  // Exact same scattered shard is outside the solid and inside the atmosphere.
  game.run(`const shard=body(2300,0,50,0,0,'debris');shard.publicAfterTick=0;`);
  assert.equal(game.run('sweptBodyContact(solid,solid,shard,shard)'),null);
  assert.ok(game.run('sweptBodyContact(gas,gas,shard,shard)!==null'));
  for(const type of ['massiveSolid','gasGiant']) {
    game.run(`const actor${type}=body(0,0,bodyRadiusScale('${type}')*2000,0,0,'${type}');
      const moon${type}=body(0,0,240,0,0,'moon');
      const before${type}=actor${type}.mass;const result${type}=resolveBodyImpact(actor${type},moon${type});`);
    assert.equal(game.run(`result${type}.kind`),'absorbed');
    close(game.run(`actor${type}.mass-before${type}`),57600);
    game.run(`setBodyMass(actor${type},peer.mass*64);`);
    assert.equal(game.run(`collisionDisposition(actor${type},peer)`),'eat');
    game.run(`setBodyMass(actor${type},peer.mass*63.9);`);
    assert.equal(game.run(`collisionDisposition(actor${type},peer)`),'fragment');
  }
  t.diagnostic(`Equal-mass reference impact: solid loses ${game.run('solidLoss.a*100').toFixed(2)}%, gas ${game.run('gasLoss.a*100').toFixed(2)}%; radii 1700 / 2800 at 4M mass.`);
});

test("massive targets are sparse deterministic planet-cell residents with safe footprints and persistent IDs", t => {
  const game=createGame();beginGame(game,true);
  game.run(`const planets=[];
    for(const seed of [1,42,1948])for(let y=-8;y<=8;y++)for(let x=-8;x<=8;x++) {
      const p=planetForCell(seed,x,y);if(p)planets.push({...p,seed});
    }
    const late=planets.filter(p=>MASSIVE_PLANET_BRANCHES[p.type]);
    const generated=late.map(p=>createGeneratedBody(p.seed,0,coordinateRegion(p.x),coordinateRegion(p.y),p));`);
  assert.ok(game.run('late.length>30 && late.length<planets.length*0.35 && late.length>planets.length*0.14'));
  assert.ok(game.run(`generated.every(p=>p.mass>=MASSIVE_PLANET_STAGE.targetMinMass &&
    p.mass<=MASSIVE_PLANET_STAGE.targetMaxMass && p.gravitySource && p.r<=MAX_LARGE_BODY_RADIUS)`));
  assert.deepEqual(game.json('[...new Set(late.map(p=>p.type))].sort()'),['gasGiant','massiveSolid']);
  game.run(`for(const p of late) {
    const moons=systemMoonsForPlanet(p.seed,p);
    if(moons.length<2 || !moons.every(m=>hasClearance(m,[p],SYSTEM_MOON_MIN_GAP-1e-7))) throw Error('Moon clearance');
    const neighbors=nearbyPlanets(p.seed,coordinateRegion(p.x),coordinateRegion(p.y)).filter(q=>q.systemId!==p.systemId);
    if(!hasClearance(p,neighbors,PLANET_ROUTE_GAP))throw Error('Planet clearance');
  }
  const description=late.find(p=>p.seed===42);
  const target=createGeneratedBody(42,0,coordinateRegion(description.x),coordinateRegion(description.y),description);
  world=createWorld(42,0,1);player.x=target.x+target.r+600;player.y=target.y;followPlayer();syncWorldRegions();
  const resident=[...world.regions.values()].flatMap(b=>[...b.values()]).find(b=>b.id===target.id);`);
  assert.ok(game.run('resident && star_objects.includes(resident) && getRenderableBodies().includes(resident)'));
  game.run(`consumeWorldBody(resident);player.x+=100000;syncWorldRegions();player.x=target.x;syncWorldRegions();`);
  assert.ok(game.run('![...world.regions.values()].some(b=>b.has(target.id)) && !world.backgroundPlanets.has(target.id)'));
  t.diagnostic(game.run('`${late.length} late targets among ${planets.length} occupied cells; target mass ${MASSIVE_PLANET_STAGE.targetMinMass}-${MASSIVE_PLANET_STAGE.targetMaxMass}, required gain ${FINAL_MASS_MILESTONE-MASSIVE_PLANET_STAGE.mass}.`'));
});

test("massive camera and movement stay centered, responsive and zoom independent through the revised ending", t => {
  const rows=[];
  for(const branch of ['massiveSolid','gasGiant'])for(const mass of [4000000,10000000,16000000]) {
    const game=createGame();beginGame(game,true);
    game.run(`setBodyMass(player,MASSIVE_PLANET_STAGE.mass);updatePlayerEvolution();choosePlayerEvolution('${branch}');
      setBodyMass(player,${mass});resetCamera();
      mouseX=width/2+STEERING_MAX_DISTANCE;
      for(let i=0;i<60;i++)movePlayer();
      const fullSpeed=player.vx, zoom=camera.zoom, scale=playerMovementLimits().scale;
      mouseX=width/2;for(let i=0;i<30;i++)movePlayer();followPlayer();`);
    close(game.run('fullSpeed*zoom'),300,0.01);
    assert.ok(game.run('zoom>CAMERA_MIN_ZOOM && player.r*zoom>23 && player.r*zoom<26 && scale<PLAYER_MAX_MOVEMENT_SCALE'));
    assert.ok(game.run('player.vx/fullSpeed<0.0022'));
    assert.deepEqual(game.json('worldToScreen(player.x,player.y)'),{x:800,y:450});
    assert.equal(game.run('getEvolutionProgress().label'),'True Star Devourer');
    close(game.run('getEvolutionProgress().fraction'),(mass-4000000)/12000000);
    rows.push(game.json(`({branch:'${branch}',mass:player.mass,radius:player.r,zoom,scale})`));
  }
  t.diagnostic(JSON.stringify(rows));
});

test("massive stage actual steering raids recover material and reach the revised ending on both paths", t => {
  for(const branch of ['massiveSolid','gasGiant']) {
    const game=createGame();
    game.run(`const route=loadMassiveStageScenario('${branch}');
      for(let i=0;i<18000 && gameState==='playing';i++) {
        steerMassiveStageScenario(route);updateGame();observeMassiveStageScenario(route);
        if(route.phase==='recovered')addMassiveStageEncounter(route);
      }`);
    const stats=game.json(`({branch:'${branch}',state:gameState,phase:route.phase,mass:player.mass,
      seconds:runTick/SIMULATION_FPS,encounters:route.encounters,impacts:route.impactCount,
      massError:route.massError,peakPairs:route.peakPairs,peakBodies:route.peakBodies,peakDebris:route.peakDebris,
      recoveries:route.recoveries})`);
    t.diagnostic(JSON.stringify(stats));
    assert.equal(stats.state,'ending');
    assert.ok(stats.seconds>10 && stats.encounters>=3 && stats.recoveries.length>=2);
    assert.ok(stats.mass>=game.run('FINAL_MASS_MILESTONE'));
    assert.ok(stats.massError<1e-6 && stats.peakPairs<=game.run('ECOLOGY_MAX_PAIR_CHECKS') && stats.peakDebris<=game.run('MAX_WORLD_DEBRIS'));
    assert.ok(game.run('player===route.originalPlayer && world===route.originalWorld && currentFormIndex===3'));
  }
});

test("massive collision aftermath keeps the owned core largest, releases surfaces and retains branch density at capacity", () => {
  for(const branch of ['massiveSolid','gasGiant']) {
    const game=createGame();beginGame(game,true);
    game.run(`setBodyMass(player,4000000);updatePlayerEvolution();choosePlayerEvolution('${branch}');
      const target=body(player.r+3500,0,3500,0,0,'gasGiant');target.gravitySource=true;
      for(let i=0;i<MAX_WORLD_DEBRIS-2;i++){
        const shard=body(100000+i*100,100000,1,0,0,'debris');storeWorldBody(world,shard);
      }
      player.impactSpeedScale=playerMovementLimits().scale;
      const total=player.mass+target.mass;
      const contact={time:0,ax:player.x,ay:player.y,bx:target.x,by:target.y,nx:-1,ny:0,speed:playerMovementLimits().speed};
      const event=resolveBodyImpact(player,target,contact);`);
    assert.equal(game.run('event.kind'),'fragmented');
    assert.equal(game.run('event.debris.length'),2);
    assert.ok(game.run(`event.debris.every(d=>(d.parentId===player.id?player:target).mass>d.mass &&
      d.kind==='debris' && d.type==='debris' && !d.gravitySource && bodyRadiusScale(d.type)===1)`));
    close(game.run('player.mass+target.mass+event.debris.reduce((n,b)=>n+b.mass,0)'),game.run('total'),1e-7);
    close(game.run('player.r/radiusForMass(player.mass)'),game.run(`bodyRadiusScale('${branch}')`));
    assert.ok(game.run(`player.ownerId==='player' && player.type==='${branch}' &&
      hasImpactGrace(player) && Math.hypot(player.x-target.x,player.y-target.y)>=player.r+target.r`));
    game.run(`const massAfter=player.mass,px=player.x;mouseX=width/2-STEERING_MAX_DISTANCE;
      for(let i=0;i<30;i++)movePlayer();`);
    assert.ok(game.run('player.x<px && player.mass===massAfter'));
  }
});

test("massive paths retain physical-size rims at both LODs and emit bounded gravity and warnings", () => {
  const game=createGame(400,300);beginGame(game,true);
  const strokes=[];game.context.stroke=(...channels)=>strokes.push(channels);
  for(const branch of ['massiveSolid','gasGiant']) {
    game.run(`startGame({seed:42,fixture:true});world.regions.clear();gameState='playing';
      setBodyMass(player,4000000);updatePlayerEvolution();choosePlayerEvolution('${branch}');
      player.vx=playerMovementLimits().speed;camera.zoom=1;
      var target=createBody('warning:${branch}','${branch}',50000,0,
        radiusForMass(6400000)*bodyRadiusScale('${branch}'),seededRandom(65));
      storeWorldBody(world,target);world.backgroundPlanets.set(target.id,target);
      world.generatedPlanetCells.set(regionKey(2,0),target.id);
      var expected=getThreatVisual(target.r,player.r).ring;`);
    assert.equal(game.run('collectHazardWarnings()[0]?.id'),game.run('target.id'));
    game.run(`target.x=player.r+target.r+50;storeWorldBody(world,target);
      var receiver=body(target.x-target.r-100,0,20);
      var force=gravityFromSource(receiver,target);
      var playerForce=gravityFromSource(player,target);`);
    assert.ok(game.run('Math.hypot(force.ax,force.ay)>0 && Math.hypot(force.ax,force.ay)<=GRAVITY_MAX_SOURCE_ACCELERATION'));
    assert.ok(game.run('Number.isFinite(playerForce.ax) && Number.isFinite(playerForce.ay)'));
    for(const detail of [true,false]) {
      strokes.length=0;game.run(`drawBody(target,false,${detail});drawBody(player,true);`);
      assert.ok(strokes.some(c=>JSON.stringify(c)===JSON.stringify(game.json('expected'))));
    }
    game.run('var drawnPalette=getBodyPalette(target);');
    assert.ok(game.run('drawnPalette.base.length===3 && player.gravitySource===false'));
  }
});

test("massive raid ending and collection are identical at 30, 60 and 144 rendering FPS", () => {
  for(const branch of ['massiveSolid','gasGiant']) {
    const snapshots=[];
    for(const fps of [30,60,144]) {
      const game=createGame();
      game.run(`const route=loadMassiveStageScenario('${branch}');const actualUpdate=updateGame;
        updateGame=()=>{steerMassiveStageScenario(route);actualUpdate();observeMassiveStageScenario(route);
          if(route.phase==='recovered')addMassiveStageEncounter(route);};`);
      game.frames(22*fps,fps);
      assert.equal(game.run('gameState'),'ending');
      snapshots.push(game.json(`({player,runTick,score,form:currentFormIndex,encounters:route.encounters,
        ids:[...world.consumedIds],impacts:world.nextImpactId})`));
    }
    assert.deepEqual(snapshots[0],snapshots[1]);assert.deepEqual(snapshots[1],snapshots[2]);
  }
});

function startNeutralFixture(game) {
  game.run(`setup(); mouseX = width + 1000; mouseY = -1000; key = ' '; keyPressed();
    world = createWorld(42, 0, 1, true); world.regions.clear(); syncWorldRegions();`);
}

test("far-cursor start stays neutral, requires a deliberate center hold and resets on restart", () => {
  const game = createGame(); startNeutralFixture(game);
  game.frames(120);
  assert.deepEqual(game.json("[player.x,player.y,player.vx,player.vy,steering.armed,mouseX,mouseY]"),
    [0,0,0,0,false,2600,-1000]);
  assert.ok(game.context.texts.includes('Center cursor to steer'));
  game.run(`mouseX=width/2;mouseY=height/2;`);
  game.frames(game.run('STEERING_ARM_HOLD_TICKS') - 1);
  assert.equal(game.run('steering.armed'),false);
  game.run('mouseX=0;'); game.frames(1);
  assert.equal(game.run('steering.centerTicks'),0);
  game.run('mouseX=width/2;'); game.frames(game.run('STEERING_ARM_HOLD_TICKS'));
  assert.ok(game.run('steering.armed && !steering.engaged && player.vx===0 && player.vy===0'));
  game.run("gameState='gameover';mouseX=10000;keyPressed();");
  assert.ok(game.run('!steering.armed && !steering.engaged && steering.rampTicks===0 && player.vx===0'));
});

test("first steering ramps smoothly even after waiting centered, then normal braking remains responsive", t => {
  const game = createGame(); startNeutralFixture(game);
  game.run('mouseX=width/2;mouseY=height/2;'); game.frames(120);
  assert.equal(game.run('steering.rampTicks'),0);
  game.run('mouseX=width/2+STEERING_MAX_DISTANCE;const speeds=[];');
  for (let i=0;i<60;i++) {game.frames(1);game.run('speeds.push(player.vx);');}
  const speeds=game.json('speeds');
  assert.ok(speeds[0]>0 && speeds[0]<5 && speeds[5]<100);
  assert.ok(speeds.every((v,i)=>!i || v>=speeds[i-1]));
  assert.ok(speeds[23]>800 && speeds[41]>1050);
  game.run('mouseX=width/2;');game.frames(30);
  assert.ok(game.run('player.vx<2.3 && steering.rampTicks===STEERING_ACTIVATION_TICKS'));
  t.diagnostic(`First drive: ${speeds[0].toFixed(2)}, at 0.4 s ${speeds[23].toFixed(1)}, at 0.7 s ${speeds[41].toFixed(1)} world units/s.`);
});

test("entry hold and steering activation match at 30, 60 and 144 render FPS", () => {
  const snapshots=[];
  for (const fps of [30,60,144]) {
    const game=createGame();startNeutralFixture(game);
    game.frames(fps,fps);
    game.run('mouseX=width/2;mouseY=height/2;');game.frames(fps/2,fps);
    game.run('mouseX=width/2+STEERING_MAX_DISTANCE;');game.frames(fps,fps);
    snapshots.push(game.json('({player,steering,runTick})'));
  }
  assert.deepEqual(snapshots[0],snapshots[1]);assert.deepEqual(snapshots[1],snapshots[2]);
});

test("grown movement maintains apparent travel and matching acceleration/braking across Moon sizes", t => {
  const game=createGame();beginGame(game,true);
  game.run('let accelerated,startX,travel;');
  const rows=[];
  for (const radius of [20,60,120,240,600,1000,1200,2000]) {
    game.run(`setBodyMass(player,massForRadius(${radius}));player.x=player.y=0;
      player.vx=player.vy=player.gravityVx=player.gravityVy=0;
      mouseX=width/2+STEERING_MAX_DISTANCE;mouseY=height/2;
      for(let i=0;i<30;i++)movePlayer();accelerated=player.vx/playerMovementLimits().speed;
      for(let i=0;i<90;i++)movePlayer();startX=player.x;
      for(let i=0;i<60;i++)movePlayer();
      travel=(player.x-startX)*targetZoomForRadius(player.r);
      mouseX=width/2;for(let i=0;i<30;i++)movePlayer();`);
    const row=game.json(`({radius:player.r,travel,speed:playerMovementLimits().speed,
      accelerated,braked:player.vx/playerMovementLimits().speed,scale:playerMovementLimits().scale})`);
    assert.ok(row.accelerated>0.995 && row.braked<0.0022);
    if(radius>=120 && radius<=1200)close(row.travel,300,1e-7);
    assert.ok(row.travel>=259 && row.scale<=game.run('PLAYER_MAX_MOVEMENT_SCALE'));
    rows.push(row);
  }
  t.diagnostic(JSON.stringify(rows));
});

test("grown movement responds continuously to growth and ignores rendered zoom", () => {
  const snapshots=[];
  for(const zoom of [0.01,0.4,1]) {
    const game=createGame();beginGame(game,true);
    game.run(`camera.zoom=${zoom};setBodyMass(player,massForRadius(600));
      mouseX=width/2+STEERING_MAX_DISTANCE;mouseY=height/2;
      const before=player.vx;movePlayer();const first=player.vx;
      for(let i=0;i<59;i++)movePlayer();`);
    assert.ok(game.run('first>0 && first<=playerMovementLimits().acceleration*SIMULATION_STEP_SECONDS && first<playerMovementLimits().speed*0.1'));
    snapshots.push(game.json('[player.x,player.y,player.vx,player.vy]'));
    assert.ok(game.run(`Math.abs(playerMovementLimits(119.999).speed-playerMovementLimits(120.001).speed)<0.1`));
  }
  assert.deepEqual(snapshots[0],snapshots[1]);assert.deepEqual(snapshots[1],snapshots[2]);
});

test("scaled movement preserves proportional impact severity and keeps slow/glancing hits gentler", t => {
  const game=createGame();beginGame(game,true);
  game.run('const results=[];');
  for(const radius of [120,240,600,1000]) {
    game.run(`setBodyMass(player,massForRadius(${radius}));
      player.impactSpeedScale=playerMovementLimits().scale;
      const peer${radius}=body(0,0,player.r,0,0,'moon');
      results.push({radius:player.r,full:impactMassLoss(player,peer${radius},playerMovementLimits().speed),
        gentle:impactMassLoss(player,peer${radius},playerMovementLimits().speed*0.25)});`);
  }
  const rows=game.json('results');
  for(const row of rows) {
    close(row.full.a,rows[0].full.a);close(row.gentle.a,rows[0].gentle.a);
    assert.ok(row.gentle.a<row.full.a && row.full.a<0.55);
  }
  game.run(`const npcA=body(0,0,240),npcB=body(0,0,240);`);
  close(game.run('impactMassLoss(npcA,npcB,900).a'),rows[0].full.a);
  t.diagnostic(`Comparable head-on loss ${(rows[0].full.a*100).toFixed(2)}%; quarter-drive loss ${(rows[0].gentle.a*100).toFixed(2)}% at every sampled Moon size.`);
});

test("procedural food tuning extends asteroid meals independently of movement or Moon thresholds", t => {
  const rows=[];
  for(const spread of [48,18]) {
    const game=createGame(1600,900,1,{ASTEROID_RADIUS_SPREAD:spread,ASTEROID_OUTER_RADIUS_SPREAD:spread});beginGame(game,true);
    game.run(`difficultyFactor=1;
      const sample=[];
      for(let y=-8;y<=8;y++)for(let x=-8;x<=8;x++)
        sample.push(...generateRegion(42,x,y,0,1).filter(b=>b.type==='asteroid'));
      const mean=sample.reduce((n,b)=>n+b.mass,0)/sample.length;
      let meals=0,skipped=0;
      for(const food of sample) {
        if(food.r>=player.r){skipped++;continue;}
        food.x=player.x;food.y=player.y;food.gravitySource=false;
        storeWorldBody(world,food);handlePlayerContact(food,resolveBodyImpact(player,food,null));meals++;
        if(player.mass>=EVOLUTION_FORMS[1].mass)break;
      }`);
    rows.push(game.json(`({spread:${spread},mean,meals,skipped,mass:player.mass,type:player.type,
      count:sample.length,threshold:EVOLUTION_FORMS[1].mass,speed:PLAYER_MAX_SPEED})`));
    assert.equal(rows.at(-1).type,'moon');assert.equal(rows.at(-1).threshold,14400);
  }
  t.diagnostic(JSON.stringify(rows));
  assert.ok(rows[1].mean/rows[0].mean>0.22 && rows[1].mean/rows[0].mean<0.29);
  assert.ok(rows[1].meals>=60 && rows[1].meals>rows[0].meals);
  assert.ok(rows[1].count>=rows[0].count && rows[1].speed===rows[0].speed);
});

test("normal procedural asteroid foraging progresses comfortably with real steering and food masses", t => {
  const results=[];
  for(const spread of [48,18]) {
    const game=createGame(1600,900,1,{ASTEROID_RADIUS_SPREAD:spread,ASTEROID_OUTER_RADIUS_SPREAD:spread});beginGame(game);
    game.run(`const route=loadPacingScenario(42);
      for(let i=0;i<10800 && route.phase!=='moon' && gameState==='playing';i++) {
        steerPacingScenario(route);updateGame();
      }`);
    const result=game.json(`({spread:${spread},state:gameState,phase:route.phase,meals:score,
      seconds:runTick/SIMULATION_FPS,mass:player.mass,impacts:world.nextImpactId})`);
    results.push(result);t.diagnostic(JSON.stringify(result));
    assert.equal(result.state,'playing');assert.equal(result.phase,'moon');
    assert.ok(result.seconds<180);
  }
  assert.ok(results[1].meals>=60 && results[1].meals>results[0].meals && results[1].seconds>results[0].seconds*1.3);
});

test("grown approach warnings retain reaction time and cover distant planets on compact viewports", t => {
  for(const radius of [120,600,1000,1900]) {
    const game=createGame(320,180);beginGame(game,true);
    game.run(`setBodyMass(player,massForRadius(${radius}));
      const limits=playerMovementLimits();player.vx=limits.speed;
      const planet=addSource(limits.speed*HAZARD_ASSIST_REACTION_SECONDS+player.r+1800+2500,0,1800);
      // Register in the same distant-cell index used by procedural worlds.
      const cellSize=PLANET_CELL_REGIONS*REGION_SIZE;
      world.backgroundPlanets.set(planet.id,planet);
      world.generatedPlanetCells.set(regionKey(Math.floor(planet.x/cellSize),Math.floor(planet.y/cellSize)),planet.id);
      let warning=null,warningTick=null,minimumGap=Infinity;
      for(let tick=0;tick<600;tick++) {
        if(!warning) {warning=collectHazardWarnings().find(w=>w.id===planet.id);
          if(warning)warningTick=runTick;}
        const react=warningTick!==null && runTick-warningTick>=HAZARD_ASSIST_REACTION_SECONDS*SIMULATION_FPS;
        mouseX=width/2+(react?-1:1)*STEERING_MAX_DISTANCE;
        mouseY=height/2;updateGame();
        minimumGap=Math.min(minimumGap,Math.hypot(player.x-planet.x,player.y-planet.y)-player.r-planet.r);
      }`);
    assert.ok(game.run('warning && minimumGap>100 && world.nextImpactId===0 && player.vx<0'));
    t.diagnostic(JSON.stringify(game.json('({radius:player.r,warningGap:warning.surfaceGap,minimumGap,scan:hazardScanRadius()})')));
  }
  const procedural=createGame(320,180);beginGame(procedural);
  procedural.run('setBodyMass(player,massForRadius(1900));syncWorldRegions();const bounds=backgroundCellBounds(hazardScanRadius(),hazardScanRadius());');
  assert.ok(procedural.run(`world.generatedPlanetCells.has(regionKey(bounds.minX,bounds.minY)) &&
    world.generatedPlanetCells.has(regionKey(bounds.maxX,bounds.maxY))`));
});

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

test("eating transfers exact mass and equal contacts separate using world radii", () => {
  const game = createGame();
  beginGame(game, true);
  game.run("difficultyFactor = 1.2; const eaten = addBody(0, 0, 10);");
  game.frames(1);
  assert.equal(game.run("score"), 1);
  close(game.run("player.mass"), 500);
  close(game.run("player.r"), Math.sqrt(500));
  assert.ok(game.run("world.consumedIds.has(eaten.id)"));
  assert.equal(game.run("star_objects.length"), 0);
  game.run("addBody(player.x, player.y, player.r, 0, 0, 'moon');");
  game.frames(1);
  assert.equal(game.run("gameState"), "playing");
  close(game.run('player.mass+allBodies().reduce((n,b)=>n+b.mass,0)'),1000);
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
  close(speedAt(96), game.run("PLAYER_MAX_SPEED / 2"));
  close(speedAt(180), game.run("PLAYER_MAX_SPEED"));
  close(speedAt(10000), game.run("PLAYER_MAX_SPEED"));
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
    // This route tests already-active flight; neutral entry is covered separately.
    steering.armed = steering.engaged = true; steering.rampTicks = STEERING_ACTIVATION_TICKS;
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
  game.run("const moving = addBody(1023, 300, 10, 120, 0); for(let i=0;i<40;i++)updateGame();");
  const afterMove = game.json("moving");
  game.run("player.x = -30000; followPlayer();");
  game.frames(60);
  const retired = game.json("moving");
  assert.ok(retired.x > afterMove.x && retired.ecologyOpacity === 0);
  game.frames(60);
  assert.deepEqual(game.json("moving"), retired);
  assert.ok(game.run("!star_objects.includes(moving)"));
  game.run("player.x = 700; followPlayer(); syncWorldRegions();");
  assert.ok(game.run("star_objects.includes(moving)"));
  assert.deepEqual(game.json("moving"), retired);
  game.frames(1);
  close(game.run("moving.x"), retired.x + 2);
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
  assert.ok(game.run("world.ecologyStats.simulated <= 1+MAX_ACTIVE_BODIES+ECOLOGY_BACKGROUND_BODIES+ECOLOGY_FADING_BODIES+2*GRAVITY_MAX_SOURCES && world.ecologyStats.pairChecks<=ECOLOGY_MAX_PAIR_CHECKS"));
});

test("bounded placement attempts terminate even when clearance rejects every position", () => {
  const game = createGame();
  beginGame(game);
  game.run("let placementChecks = 0; hasClearance = () => { placementChecks++; return false; }; const rejected = generateRegion(42, 20, -20);");
  assert.equal(game.run("rejected.filter(b => b.type === 'asteroid').length"), 0);
  assert.ok(game.run("placementChecks <= (Math.max(ASTEROIDS_PER_REGION,ASTEROIDS_IN_FIELD_REGION,ASTEROIDS_IN_TRAVEL_REGION) + 9) * PLACEMENT_ATTEMPTS + 9 * SYSTEM_MOON_MAX_COUNT"));
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
  const zooms = [];
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
      regions: [...world.generatedRegions], score, gameState,
      camera: { x: camera.x, y: camera.y, targetZoom: camera.targetZoom } })`));
    // Meals can land between different render observations. Hold the identical
    // final physical state for one second to compare settled camera/density,
    // rather than demanding identical intermediate filters for different inputs.
    game.run(`for(let frame=0;frame<${fps};frame++)updateCamera(1/${fps});`);
    zooms.push(game.json("({ zoom:camera.zoom, background:camera.backgroundZoom })"));
  }
  assert.deepEqual(snapshots[0], snapshots[1]);
  assert.deepEqual(snapshots[1], snapshots[2]);
  // Physical history is exact; both visual filters converge after growth stops.
  for (const zoom of zooms) {
    close(zoom.zoom, zooms[0].zoom, 0.00002);
    close(zoom.background, zooms[0].background, 0.001);
  }
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

test("every generated, fixture, and player body follows the base mass law with its configured density", () => {
  const game = createGame();
  beginGame(game);
  assert.ok(game.run(`[player, ...allBodies()].every(b =>
    Math.abs(b.mass - massForRadius(b.r / bodyRadiusScale(b.type))) <= Math.max(1,b.mass)*1e-12)`));
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
    close(game.run("player.mass"), 500);
    close(game.run("player.r ** 2"), 500);
    game.run("addBody(player.x, player.y, 15, 0, 0, 'planet');");
    game.frames(1);
    close(game.run("player.mass"), 725);
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

test("equal small bodies separate and larger bodies absorb the player without duplicating mass", () => {
  for (const [type, radius] of [["asteroid", 20], ["moon", 21], ["planet", 100]]) {
    const game = createGame();
    beginGame(game, true);
    game.run(`const target=addBody(0, 0, ${radius}, 0, 0, '${type}');`);
    game.frames(1);
    assert.equal(game.run("gameState"), radius===20?'playing':'gameover');
    assert.equal(game.run("player.mass"), radius===20?400:0);
    assert.equal(game.run("score"), 0);
    assert.equal(game.run("world.consumedIds.size"), radius===20?0:1);
    close(game.run('player.mass+target.mass'),400+radius*radius);
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
      const neighbor = addBody(player.x - player.r - 500, player.y, 30);
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
    assert.equal(game.run("getEvolutionProgress().label"), ["Moon", "Planet", "Massive planet"][index]);
    assert.ok(game.context.texts.includes(`Form: ${["Asteroid", "Moon", "Planet"][index]}`));
    assert.ok(game.context.texts.some(text => text.startsWith(`Next: ${["Moon", "Planet", "Massive planet"][index]} 50.0%`)));
  }
});

test("a grown player eats offscreen prey within its physical collision footprint", () => {
  const game = createGame(400, 300);
  beginGame(game, true);
  game.run("difficultyFactor = 1; setBodyMass(player, EVOLUTION_FORMS[2].mass); updatePlayerEvolution(); const prey = addBody(player.r-100, 0, 30);");
  assert.ok(game.run("!isBodyVisible(prey) && star_objects.includes(prey)"));
  game.frames(1);
  assert.equal(game.run("score"), 1);
  assert.equal(game.run("player.mass"), game.run('EVOLUTION_FORMS[2].mass+900'));
  assert.ok(game.run("world.consumedIds.has(prey.id)"));
});

test("only the explicit final mass milestone ends the run, preserving its world", () => {
  const game = createGame();
  beginGame(game, true);
  game.run(`difficultyFactor = 1; score = 9999;
    setBodyMass(player, FINAL_MASS_MILESTONE - 100); updatePlayerEvolution();
    choosePlayerEvolution('massiveSolid');
    const originalWorld = world; const originalSeed = runSeed; addBody(0, 0, 10);`);
  assert.equal(game.run("gameState"), "playing");
  game.frames(1);
  assert.equal(game.run("gameState"), "ending");
  assert.equal(game.run("player.mass"), game.run('FINAL_MASS_MILESTONE'));
  assert.equal(game.run("player.type"), "massiveSolid");
  assert.equal(game.run("getEvolutionProgress().fraction"), 1);
  assert.ok(game.run("world === originalWorld && runSeed === originalSeed && world.consumedIds.size === 1"));
  assert.equal(game.run("score"), 10000);
  game.frames(30);
  assert.equal(game.run("runTick"), 1);
  assert.ok(game.context.texts.includes("Final Mass: 16.00M | Score: 10000"));
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
    setBodyMass(player, FRAGMENTATION_MIN_MASS / 2); // injured below the shedding threshold
    score = 75; runTick = 900; player.x = -1000; player.y = 2000;
    world.consumedIds.add('old-meal'); const oldWorld = world; const oldSeed = runSeed;
    addBody(player.x, player.y, player.r*1.1, 0, 0, 'planet');`);
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

test("zoom eases over a short interval after immediate growth at every frame rate", () => {
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

test("opening drive is ten percent slower and still accelerates and brakes promptly", t => {
  const measurements = [];
  for (const speed of [1200, 1080]) {
    const game = createGame(1600, 900, 1, { PLAYER_MAX_SPEED: speed });
    beginGame(game, true);
    game.run(`mouseX = width / 2 + STEERING_MAX_DISTANCE;
      movePlayer(); const firstTick = player.vx;
      for (let i = 1; i < 15; i++) movePlayer();
      const quarterSecond = player.vx;
      for (let i = 15; i < 120; i++) movePlayer();
      const cruising = player.vx, brakeStart = player.x;
      mouseX = width / 2;
      for (let i = 0; i < 30; i++) movePlayer();`);
    measurements.push(game.json("({ firstTick, quarterSecond, cruising, brakingSpeed:player.vx, brakingDistance:player.x-brakeStart })"));
  }
  close(measurements[1].cruising / measurements[0].cruising, 0.9);
  close(measurements[1].firstTick, measurements[0].firstTick);
  assert.ok(measurements[1].quarterSecond > 1080 * 0.9);
  assert.ok(measurements[1].brakingSpeed < 5 && measurements[1].brakingDistance < 110);
  t.diagnostic(JSON.stringify(measurements[1]));
});

test("a meal commits mass immediately while camera zoom follows over a short interval", () => {
  for (const fps of [30, 60, 144]) {
    const game = createGame(); beginGame(game, true);
    game.run("difficultyFactor = 1; addBody(0, 0, 15); const zoomBeforeMeal = camera.zoom; updateGame();");
    assert.equal(game.run("player.mass"), 625);
    assert.equal(game.run("player.r"), 25);
    assert.equal(game.run("score"), 1);
    assert.equal(game.run("camera.zoom"), game.run("zoomBeforeMeal"));
    game.run(`updateCamera(1/${fps});`);
    assert.ok(game.run("camera.zoom > camera.targetZoom && camera.zoom < zoomBeforeMeal"));
    game.run(`for (let i=1; i<${fps/2}; i++) updateCamera(1/${fps});`);
    close(game.run("(Math.log(camera.zoom)-Math.log(camera.targetZoom)) / (Math.log(zoomBeforeMeal)-Math.log(camera.targetZoom))"), Math.exp(-5), 1e-12);
  }
});

test("gradual growth and late milestones keep screen occupancy within a slight increase", t => {
  const game = createGame(); beginGame(game, true);
  const targets = [20, 64, 120, 300, 1200, 2000].map(radius => game.run(`${radius} * targetZoomForRadius(${radius})`));
  assert.ok(targets.every((size, i) => size >= 20 && size <= 24.1 && (i === 0 || size > targets[i - 1])));
  for (const fps of [30, 60, 144]) {
    game.run(`setBodyMass(player, massForRadius(20)); resetCamera();
      for (let i = 1; i <= ${fps * 12}; i++) {
        setBodyMass(player, massForRadius(20 * 100 ** (i / ${fps * 12})));
        updateCamera(1 / ${fps});
        if (player.r * camera.zoom < 19.99 || player.r * camera.zoom > 25.2) throw new Error('Occupancy out of bounds');
      }`);
    assert.ok(game.run("camera.zoom > CAMERA_MIN_ZOOM && player.r * camera.zoom > 23.8"));
  }
  t.diagnostic(`Settled screen radii at r20/64/120/300/1200/2000: ${targets.map(x => x.toFixed(2)).join(', ')} px.`);
});

test("relative camera response matches at small and large scales including instant growth", () => {
  const relative = [];
  for (const radius of [20, 400]) {
    const game = createGame(); beginGame(game, true);
    game.run(`setBodyMass(player, massForRadius(${radius})); resetCamera();
      const originalSize = player.r * camera.zoom;
      setBodyMass(player, massForRadius(${radius * 2}));
      for (let i = 0; i < 30; i++) updateCamera(1 / 60);`);
    relative.push(game.run("player.r * camera.zoom / originalSize"));
  }
  close(relative[0], relative[1], 1e-12);
  const game = createGame(); beginGame(game, true);
  game.run("setBodyMass(player, massForRadius(2000)); const before = camera.zoom; updateCamera(0);");
  assert.equal(game.run("camera.zoom"), game.run("before"));
  assert.equal(game.run("player.mass"), 4000000);
  game.run("updateCamera(1/144);");
  assert.ok(game.run("camera.zoom < before && camera.zoom > camera.targetZoom"));
  game.run("for (let i = 1; i < 48; i++) updateCamera(1/144);");
  assert.ok(game.run("player.r * camera.zoom > 24 && player.r * camera.zoom < 29"));
  game.run("for (let i = 48; i < 144; i++) updateCamera(1/144);");
  assert.ok(game.run("player.r * camera.zoom > 24 && player.r * camera.zoom < 24.1"));
});

test("distant specks fade continuously with scale while nearby food stays fully visible", t => {
  const game = createGame(); beginGame(game, true);
  game.run(`const sample = [6, 15, 40, 80, 180].map(r => body(6000, 2000, r));
    const physicalBefore = JSON.stringify(sample);`);
  const densities = [];
  for (const radius of [20, 120, 300, 1200, 2000]) {
    game.run(`setBodyMass(player, massForRadius(${radius})); resetCamera();`);
    densities.push(game.run("sample.reduce((sum,b) => sum + backgroundBodyOpacity(b), 0)"));
    close(game.run("backgroundBodyOpacity(body(player.r + 6 + BACKGROUND_FOOD_CLEARANCE, 0, 6))"), 1);
  }
  assert.ok(densities[0] > 4.9 && densities.at(-1) < 1);
  assert.ok(densities.every((value, i) => i === 0 || value <= densities[i - 1]));
  assert.ok(game.run("JSON.stringify(sample) === physicalBefore"));
  game.run("setBodyMass(player, massForRadius(20)); resetCamera();");
  const opacity = zoom => game.run(`camera.backgroundZoom = ${zoom}; backgroundBodyOpacity(sample[0])`);
  close(opacity(0.1), 0);
  assert.ok(opacity(0.10001) > 0 && opacity(0.10001) < 0.000001);
  assert.ok(opacity(0.3) > 0.49 && opacity(0.3) < 0.51);
  close(opacity(0.5), 1);
  t.diagnostic(`Sum of five distant sample opacities at r20/120/300/1200/2000: ${densities.map(x=>x.toFixed(2)).join(', ')}.`);
});

test("rapid growth eases density and local coverage edges fade without deleting bodies", () => {
  const game = createGame(); beginGame(game, true);
  game.run(`const small = addBody(6000, 0, 6);
    setBodyMass(player, massForRadius(1999)); updateCamera(1/144);`);
  assert.ok(game.run("camera.backgroundZoom > camera.zoom && backgroundBodyOpacity(small) > 0.99"));
  game.run("for (let i = 0; i < 144; i++) updateCamera(1/144);");
  assert.equal(game.run("backgroundBodyOpacity(small)"), 0);
  assert.ok(game.run("allBodies().includes(small) && !world.consumedIds.has(small.id)"));
  game.run(`setBodyMass(player, massForRadius(20)); resetCamera();
    const edge = worldDetailHalfExtents().x;
    const distant = body(edge, 0, 80);`);
  assert.equal(game.run("backgroundBodyOpacity(distant)"), 0);
  game.run("distant.x -= 0.01;");
  assert.ok(game.run("backgroundBodyOpacity(distant) > 0 && backgroundBodyOpacity(distant) < 0.000001"));
  game.run("distant.x = edge - BACKGROUND_DETAIL_FADE_DISTANCE / 2;");
  close(game.run("backgroundBodyOpacity(distant)"), 0.5);
  game.run("distant.x = edge - BACKGROUND_DETAIL_FADE_DISTANCE;");
  close(game.run("backgroundBodyOpacity(distant)"), 1);
});

test("wide late views retain deterministic distant planets and reuse them for local physics", () => {
  const game = createGame(); beginGame(game);
  game.run(`setBodyMass(player, massForRadius(1999)); resetCamera(); syncWorldRegions();
    const distant = getRenderableBodies().find(b => b.type === 'planet' && Math.abs(b.x-player.x) > 30000);
    const initialId = distant.id, initialMass = distant.mass;
    const initialRegions = world.generatedRegions.size;
    player.x = distant.x - distant.r - player.r - 100;
    player.y = distant.y; followPlayer(); syncWorldRegions();`);
  assert.ok(game.run("star_objects.includes(distant) && allBodies().filter(b=>b.id===initialId).length === 1"));
  assert.ok(game.run("world.backgroundPlanets.get(initialId) === distant && distant.mass === initialMass"));
  game.run("consumeWorldBody(distant); player.x = player.y = 0; followPlayer(); syncWorldRegions();");
  assert.ok(game.run("!getRenderableBodies().some(b=>b.id===initialId) && !allBodies().some(b=>b.id===initialId) && world.consumedIds.has(initialId)"));
  assert.ok(game.run("initialRegions <= (2*MAX_REGION_REACH+1)**2 && world.generatedPlanetCells.size <= 2*(2*MAX_BACKGROUND_CELL_REACH+1)**2"));
});

test("procedural opening retains accessible fully visible food across seeds and difficulties", t => {
  const game = createGame(); beginGame(game);
  game.run("let accessibleFood;");
  let minimum = Infinity;
  for (const seed of [1, 7, 42, 71, 1948, 123456]) {
    for (const difficulty of [0.8, 1, 1.2]) {
      game.run(`difficultyFactor = ${difficulty}; startGame({seed:${seed}});
        accessibleFood = [...world.regions.values()].flatMap(b=>[...b.values()]).filter(b =>
          b.type === 'asteroid' && b.r < player.r && Math.hypot(b.x,b.y)-b.r < 1600);`);
      const count = game.run("accessibleFood.length");
      minimum = Math.min(minimum, count);
      assert.ok(count >= 5, `seed ${seed}, difficulty ${difficulty}: ${count} meals`);
      assert.ok(game.run("accessibleFood.every(b=>backgroundBodyOpacity(b) === 1)"));
    }
  }
  t.diagnostic(`At least ${minimum} edible, fully visible bodies within 1600 world units across 18 starts.`);
});

test("density fades the body and its threat cues together without leaking into player or HUD", () => {
  const game = createGame(); beginGame(game, true);
  game.run(`const faded = addBody(2500, 0, 6);
    camera.zoom = camera.backgroundZoom = 0.3;
    const alphas = [], realDrawBody = drawBody, realThreatRing = drawThreatRing;
    drawBody = (b, isPlayer, detailed) => {
      alphas.push({id:b.id, alpha:drawingContext.globalAlpha});
      realDrawBody(b, isPlayer, detailed);
    };
    drawThreatRing = b => {
      alphas.push({id:b.id+':ring', alpha:drawingContext.globalAlpha});
      realThreatRing(b);
    };
    drawGame();`);
  close(game.run("alphas.find(a=>a.id===faded.id).alpha"), 0.5);
  close(game.run("alphas.find(a=>a.id==='player').alpha"), 1);
  close(game.run("drawingContext.globalAlpha"), 1);
  // Force detailed rendering so the assistance ring also receives the fade.
  game.run("faded.r = 60; camera.zoom = 0.1; camera.backgroundZoom = 0.03; drawGame();");
  close(game.run("alphas.findLast(a=>a.id===faded.id+':ring').alpha"), 0.5);
  close(game.run("drawingContext.globalAlpha"), 1);
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

test("zoomed views retain oversized surfaces while distant movers participate in ecology", () => {
  const game = createGame(400, 300);
  beginGame(game, true);
  game.run(`const small = addBody(1800, 0, 10, 120);
    const planet = addBody(3500, 0, 1800, 0, 0, 'planet');
    const before = JSON.stringify(small); camera.zoom = 0.1;`);
  assert.ok(game.run("!star_objects.includes(small) && getRenderableBodies().includes(small)"));
  assert.ok(game.run("getRenderableBodies().includes(planet) && isBodyVisible(planet) && planet.x > width / (2 * camera.zoom)"));
  game.run("updateGame(); getRenderableBodies();");
  assert.ok(game.run("world.consumedIds.has(small.id) && !residentBody(small) && planet.mass===3240100"));
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
  game.run(`camera.zoom = 0.1;
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
    const source = addSource(750, 0, 100, 'moon'); updateGravitySources(true); updateGame();`);
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
  assert.ok(game.run("integrations <= 1+MAX_ACTIVE_BODIES+ECOLOGY_BACKGROUND_BODIES+ECOLOGY_FADING_BODIES+2*GRAVITY_MAX_SOURCES"));
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

test("size rims distinguish smaller, similar and larger physical radii at both LODs", () => {
  const game = createGame(); beginGame(game, true);
  assert.deepEqual(game.json("getThreatVisual(10, 20).ring"), [92, 244, 176, 235]);
  assert.deepEqual(game.json("getThreatVisual(20, 20).ring"), [255, 215, 95, 240]);
  const strokes = []; game.context.stroke = (...color) => strokes.push(color);
  game.run("selectedDifficultyIndex = 4; const food = body(100, 0, 10), danger = body(200, 0, 40); drawBody(food); drawBody(danger, false, false);");
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
  assert.ok(game.run("hazardMetrics(planet) !== null && canFragmentTogether(player,planet)"));
  game.run("setBodyMass(planet,massForRadius(100));");
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
    game.run(`camera.zoom=1;windowWidth=400;windowHeight=300;windowResized();
      player.x = ${x}; followPlayer(); syncWorldRegions(); updateGravitySources(true);`);
    assert.equal(game.run("collectHazardWarnings()[0]?.id"), game.run("planet.id"));
    const force = game.json("gravityAcceleration(player, [...world.gravitySources.values()])");
    game.run("camera.zoom = 0.1; drawHazardIndicators(); windowWidth = 800; windowHeight = 500; windowResized();");
    assert.deepEqual(game.json("gravityAcceleration(player, [...world.gravitySources.values()])"), force);
  }
});

test("full consumption/evolution/gravity/fragmentation route matches at 30/60/144 FPS", t => {
  const snapshots = [];
  for (const fps of [30,60,144]) {
    const game = createGame(); beginGame(game);
    game.run(`const route = loadIntegrationScenario();
      const realUpdate = updateGame;
      updateGame = () => { steerIntegrationScenario(route); realUpdate(); observeIntegrationScenario(route); };`);
    // The route exercises the same fixed ticks regardless of render cadence.
    game.frames(24 * fps, fps);
    const result = game.json(`({ tick:runTick, state:gameState, player, score, phase:route.phase,
      peakPull:route.peakPull, warnings:route.warnings, visibleThreats:route.visibleThreats, evolved:route.evolved, passClearance:route.passClearance,
      consumed:[...world.consumedIds], seed:runSeed, bodies:[...world.regions].flatMap(([,b])=>[...b.values()]) })`);
    assert.equal(result.state, "playing", JSON.stringify(result));
    assert.ok(result.score >= 10); assert.ok(result.evolved && result.peakPull > 100 && result.visibleThreats > 0);
    assert.ok(result.passClearance > 100 && ['escape','escaped'].includes(result.phase));
    assert.equal(game.run("world.nextImpactId"),1);
    assert.ok(game.run("world === route.world && runSeed === route.seed && route.planet.type === 'planet'"));
    snapshots.push(result);
    assert.equal(game.run("selectedDifficultyIndex"), 2);
  }
  assert.deepEqual(snapshots[0],snapshots[1]); assert.deepEqual(snapshots[1],snapshots[2]);
  t.diagnostic(`Route: ${snapshots[0].tick} ticks, Moon evolution, peak pull ${snapshots[0].peakPull.toFixed(1)}, safe pass then fragmentation and escape.`);
});

test("extended region streaming bounds active work and preserves eaten IDs on revisit", t => {
  const game = createGame(1280,720); beginGame(game);
  const started = performance.now();
  game.run(`const eaten = star_objects.find(b => b.type === 'asteroid'); consumeWorldBody(eaten);
    let maxima = {active:0, sources:0, rendered:0, warnings:0};
    camera.zoom = camera.backgroundZoom = CAMERA_MIN_ZOOM;
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
  const game = createGame(800,600); beginGame(game, true);
  // All physical surfaces are outside the viewport; visible threats have their own test.
  game.run(`const near = addSource(1100,0), aligned = addSource(1150,0), behind = addSource(-1200,0), below = addSource(0,1300);
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

test("smaller, comparable and larger encounters conserve mass through impact, escape and collection", t => {
  for (const name of ['smaller','comparable','larger']) {
    const game = createGame(); beginGame(game, true);
    game.run(`const encounter = loadFragmentationScenario('${name}');
      let peakPieces = 0;
      for (let i=0;i<1200 && encounter.phase !== 'done';i++) {
        steerFragmentationScenario(encounter); updateGame(); observeFragmentationScenario(encounter);
        if (gameState !== 'playing') throw new Error('Encounter death at tick '+runTick);
        const mass = player.mass + allBodies().reduce((sum,b)=>sum+b.mass,0);
        if (Math.abs(mass-encounter.totalMass)>encounter.totalMass*1e-12) throw new Error('Mass accounting: '+mass);
        peakPieces = Math.max(peakPieces,allBodies().filter(isLooseDebris).length);
      }`);
    const result = game.json(`({name:encounter.name,phase:encounter.phase,ticks:runTick,impacts:world.nextImpactId,
      initial:encounter.initialMass,after:encounter.afterImpactMass,final:player.mass,
      collected:encounter.collectedMass,targetLoot:encounter.collectedTargetMass,
      escapeGap:encounter.escapeGap,minGap:encounter.minimumGap,peakPieces})`);
    t.diagnostic(JSON.stringify(result));
    assert.equal(result.impacts,1);
    assert.equal(result.phase,'done');
    assert.ok(result.escapeGap > 100 && result.targetLoot > 0 && result.final > result.initial);
    assert.ok(game.run("player === encounter.originalPlayer && player.id === 'player' && player.ownerId === 'player' && player.originId === 'player'"));
    assert.ok(game.run("encounter.fragments.filter(b=>b.originId==='player').every(b=>b.ownerId==='player' && b.id!=='player' && b.mass<encounter.afterImpactMass)"));
  }
});

test("fragmentation threshold, mass ratio and normal speed determine losses without changing camera", () => {
  const game = createGame(); beginGame(game, true);
  game.run(`const a=body(-200,0,240), b=body(200,0,240);
    const slow=impactMassLoss(a,b,50), fast=impactMassLoss(a,b,900);
    setBodyMass(b,a.mass*25); b.type='planet';b.gravitySource=true;
    const raid=impactMassLoss(a,b,900);`);
  assert.ok(game.run("fast.a > slow.a && fast.a === fast.b && raid.a > raid.b && fast.a > raid.b"));
  assert.ok(game.run("canFragmentTogether(a,b) && !canFragmentTogether(player,b)"));
  game.run("b.kind='debris';");
  assert.ok(game.run("!canFragmentTogether(a,b) && collisionDisposition(player,b)==='collect'"));
  const configured = createGame(1600,900,1,{FRAGMENTATION_MIN_MASS:100}); beginGame(configured,true);
  assert.ok(configured.run("canFragmentTogether(player,body(0,0,15))"));
});

test("shared resolver preserves both owners, the largest own core and exact partition at every difficulty", () => {
  for (const difficulty of [0.8,1,1.2]) {
    const game=createGame(); beginGame(game,true);
    game.run(`const route=loadFragmentationScenario('larger'); difficultyFactor=${difficulty};
      const original=player, targetMass=route.target.mass, beforeZoom=camera.zoom;
      player.x=-route.target.r-player.r+1; player.vx=900;
      const contact=sweptBodyContact(player,player,route.target,route.target);
      const event=resolveBodyImpact(player,route.target,contact);
      const playerPieces=event.debris.filter(p=>p.originId===player.originId);
      const targetPieces=event.debris.filter(p=>p.originId===route.target.originId);`);
    close(game.run("player.mass+playerPieces.reduce((sum,p)=>sum+p.mass,0)"),57600,1e-8);
    close(game.run("route.target.mass+targetPieces.reduce((sum,p)=>sum+p.mass,0)"),1440000,1e-7);
    assert.ok(game.run("player===original && playerPieces.every(p=>p.ownerId==='player' && p.mass<player.mass) && targetPieces.every(p=>p.ownerId===null && p.mass<route.target.mass)"));
    close(game.run("camera.zoom"),game.run("beforeZoom"));
    game.run("runTick += DEBRIS_PUBLIC_COLLECTION_TICKS; const loot=targetPieces[0], before=player.mass; resolveBodyImpact(player,loot,null);");
    close(game.run("player.mass-before"),game.run("loot.mass"),1e-8);
    const after=game.run("player.mass");
    game.run("resolveBodyImpact(player,loot,null);");
    close(game.run("player.mass"),after);
  }
});

test("sustained contact cannot repeat fragmentation and separate later contacts rearm", () => {
  const game=createGame(); beginGame(game,true);
  game.run(`const route=loadFragmentationScenario('comparable'); player.x=-player.r-route.target.r+1;
    const first=resolveBodyImpact(player,route.target,sweptBodyContact(player,player,route.target,route.target));
    const massAfter=player.mass+route.target.mass;
    for(let i=0;i<180;i++) {
      runTick++; player.x=route.target.x-player.r-route.target.r+1; player.y=route.target.y;
      updateCollisionContacts();
      resolveBodyImpact(player,route.target,sweptBodyContact(player,player,route.target,route.target));
    }`);
  assert.equal(game.run("world.nextImpactId"),1);
  close(game.run("player.mass+route.target.mass"),game.run("massAfter"));
  assert.equal(game.run("allBodies().filter(isLooseDebris).length"),10);
  game.run(`player.x=route.target.x-player.r-route.target.r-FRAGMENTATION_RELEASE_GAP-1;
    updateCollisionContacts(); player.x=route.target.x-player.r-route.target.r+1;
    resolveBodyImpact(player,route.target,sweptBodyContact(player,player,route.target,route.target));`);
  assert.equal(game.run("world.nextImpactId"),2);
});

test("fragments spawn outside both cores and each other and remain accessible beyond recovery", () => {
  const game=createGame(); beginGame(game,true);
  game.run(`const route=loadFragmentationScenario('larger');
    for(let i=0;i<60 && !world.nextImpactId;i++) {steerFragmentationScenario(route);updateGame();observeFragmentationScenario(route);}
    const pieces=allBodies().filter(isLooseDebris), originals=pieces.map(p=>({p,x:p.x,y:p.y}));
    for(const p of pieces) for(const other of [player,route.target,...pieces]) {
      if(p!==other && Math.hypot(p.x-other.x,p.y-other.y)<p.r+other.r-1e-8) throw new Error('Overlapping ejecta');
    }
    for(let i=0;i<600;i++) {for(const p of pieces){accumulateBodyForces(p,[]);integrateBody(p);} runTick++;}`);
  assert.ok(game.run("originals.every(({p,x,y})=>Math.hypot(p.x-x,p.y-y)<125 && allBodies().includes(p))"));
  assert.ok(game.run("pieces.every(p=>!isGravitySource(p) && !isGravityResponder(p) && backgroundBodyOpacity(p)===1)"));
});

test("large loose fragments use gold shard geometry at both LODs and cannot kill a small collector", () => {
  const game=createGame(); beginGame(game,true);
  game.run(`const shard=addBody(0,0,500,0,0,'debris'); shard.kind='debris'; shard.originId='other';
    shard.collectAfterTick=0; shard.gravityAfterTick=10000; shard.highlightUntilTick=10000;
    const calls=[]; drawPlanetBody=()=>calls.push('planet'); drawRockyMoonBody=()=>calls.push('moon');
    beginShape=()=>calls.push('polygon'); circle=()=>calls.push('circle');
    drawBody(shard,false,true); drawBody(shard,false,false);
    const threat=getThreatVisual(shard.r,player.r,shard); updateGame();`);
  assert.deepEqual(game.json("calls"),['polygon','polygon']);
  assert.deepEqual(game.json("threat.ring"),[255,112,110,240]);
  assert.equal(game.run("gameState"),'playing');
  close(game.run("player.mass"),250400);
  assert.ok(game.run("world.consumedIds.has(shard.id)"));
});

test("shared body-pair fragmentation works without a player participant", () => {
  const game=createGame(); beginGame(game,true);
  game.run(`const a=addBody(-200,0,240,800,0,'moon'), b=addBody(200,0,240,0,0,'moon');
    a.ownerId='pilot-a'; b.ownerId='pilot-b';
    const before=JSON.stringify(player), event=resolveBodyImpact(a,b,sweptBodyContact(a,a,b,b));`);
  assert.equal(game.run("event.kind"),'fragmented');
  assert.ok(game.run("JSON.stringify(player)===before && event.debris.every(p=>p.ownerId===(p.originId===a.originId?'pilot-a':'pilot-b'))"));
  close(game.run("allBodies().reduce((sum,b)=>sum+b.mass,0)"),115200,1e-8);
});

test("all three raid loops have identical physics and mass accounting at 30, 60 and 144 render FPS", () => {
  for (const name of ['smaller','comparable','larger']) {
    const states=[];
    for (const fps of [30,60,144]) {
      const game=createGame(); beginGame(game,true);
      game.run(`const route=loadFragmentationScenario('${name}'), realUpdate=updateGame;
        updateGame=()=>{
          if(route.phase==='done') {mouseX=width/2-STEERING_MAX_DISTANCE;mouseY=height/2;}
          else steerFragmentationScenario(route);
          realUpdate(); observeFragmentationScenario(route);
        };`);
      game.frames(fps*15,fps); // includes collection and continued travel away from the encounter
      assert.ok(game.run("gameState==='playing' && world.nextImpactId===1 && route.phase==='done' && player.mass>route.initialMass"));
      const state=game.json("({player,runTick,score,gameState,impacts:world.nextImpactId,consumed:[...world.consumedIds],bodies:allBodies().sort((a,b)=>a.id.localeCompare(b.id))})");
      states.push(state);
      close(game.run("player.mass+allBodies().reduce((sum,b)=>sum+b.mass,0)"),game.run("route.totalMass"),1e-6);
    }
    assert.deepEqual(states[0],states[1]); assert.deepEqual(states[1],states[2]);
  }
});

test("swept impacts resolve at entry and keep a core largest under extreme configured losses", () => {
  const game=createGame(1600,900,1,{FRAGMENTATION_BASE_LOSS:1,FRAGMENTATION_IMPACT_LOSS:1,FRAGMENTATION_MAX_LOSS:0.95,FRAGMENTATION_PIECES:2});
  beginGame(game,true);
  game.run(`setBodyMass(player,massForRadius(240)); const target=addBody(0,0,240,0,0,'moon');
    const start={x:-3000,y:0}; player.x=3000;player.vx=360000;
    const contact=sweptBodyContact(player,start,target,target);
    const event=resolveBodyImpact(player,target,contact);`);
  close(game.run("contact.ax"),-480);
  assert.ok(game.run("contact.nx===-1 && player.x<target.x && event.debris.filter(p=>p.originId==='player').every(p=>p.mass<player.mass)"));
  assert.ok(game.run("Math.hypot(player.x-target.x,player.y-target.y)>=player.r+target.r+FRAGMENTATION_SEPARATION-1e-8"));
  close(game.run("player.mass+allBodies().reduce((sum,b)=>sum+b.mass,0)"),115200,1e-7);
});

test("recovery survives a second overlapping intact body and fragments cannot instantly reabsorb", () => {
  const game=createGame(); beginGame(game,true);
  game.run(`const route=loadFragmentationScenario('larger');
    for(let i=0;i<60 && !world.nextImpactId;i++){steerFragmentationScenario(route);updateGame();observeFragmentationScenario(route);}
    const before=player.mass, shard=allBodies().find(isLooseDebris);
    const attempt=resolveBodyImpact(player,shard,null);
    const neighbor=addBody(player.x,player.y,1300,0,0,'planet');
    const protection=resolveBodyImpact(player,neighbor,sweptBodyContact(player,player,neighbor,neighbor));`);
  assert.equal(game.run("attempt.kind"),'ignored');
  assert.equal(game.run("protection.kind"),'protected');
  assert.equal(game.run("world.nextImpactId"),1);
  close(game.run("player.mass"),game.run("before"));
  assert.ok(game.run("Math.hypot(player.x-neighbor.x,player.y-neighbor.y)>=player.r+neighbor.r+ECOLOGY_SURFACE_CLEARANCE-1e-8"));
});

test("a badly damaged Moon risks death on another unprotected strike and restart clears debris and contacts", () => {
  const game=createGame(); beginGame(game,true);
  game.run(`const route=loadFragmentationScenario('larger'); setBodyMass(player,FRAGMENTATION_MIN_MASS);
    setBodyMass(route.target,massForRadius(600)); // below the direct-absorption ratio
    player.x=-route.target.r-player.r+1;
    resolveBodyImpact(player,route.target,sweptBodyContact(player,player,route.target,route.target));
    const damagedMass=player.mass, oldWorld=world;
    player.x=-9000; player.vx=player.vy=player.gravityVx=player.gravityVy=0;
    mouseX=width/2;mouseY=height/2;
    for(let i=0;i<=Math.max(FRAGMENTATION_REARM_TICKS,FRAGMENTATION_GRACE_TICKS);i++) updateGame();
    player.x=route.target.x;player.y=route.target.y;updateGame();`);
  assert.ok(game.run("damagedMass<FRAGMENTATION_MIN_MASS && gameState==='gameover'"));
  game.run("key=' ';keyCode=0;keyPressed();");
  assert.ok(game.run("gameState==='playing' && world!==oldWorld && !world.contacts.size && world.nextImpactId===0 && !allBodies().some(isLooseDebris) && impactNotification===null && player.originId==='player' && player.ownerId==='player'"));
});

test("eating a shed core below the Moon threshold also preserves collision mass on Easy and Hard", () => {
  for (const difficulty of [0.8,1.2]) {
    const game=createGame();beginGame(game,true);
    game.run(`const route=loadFragmentationScenario('smaller'); difficultyFactor=${difficulty};
      player.x=-route.target.r-player.r+1;
      const hit=resolveBodyImpact(player,route.target,sweptBodyContact(player,player,route.target,route.target));
      runTick+=Math.max(FRAGMENTATION_REARM_TICKS,FRAGMENTATION_GRACE_TICKS)+1;
      player.x=route.target.x-player.r-route.target.r-FRAGMENTATION_RELEASE_GAP-1;updateCollisionContacts();
      player.x=route.target.x;player.y=route.target.y;
      player.vx=player.vy=player.gravityVx=player.gravityVy=0;
      mouseX=width/2;mouseY=height/2;updateGame();`);
    assert.ok(game.run("route.target.hasFragmented && route.target.mass<FRAGMENTATION_MIN_MASS && world.consumedIds.has(route.target.id)"));
    close(game.run("player.mass+allBodies().reduce((sum,b)=>sum+b.mass,0)"),77200,1e-7);
  }
});

test("alternate mass laws and zero configured shedding keep fragmentation finite and mass conserving", () => {
  for(const loss of [0,0.36]) {
    const game=createGame(1600,900,1,{MASS_SCALE:2.5,MASS_RADIUS_EXPONENT:3,
      FRAGMENTATION_MIN_MASS:200,FRAGMENTATION_BASE_LOSS:0,FRAGMENTATION_IMPACT_LOSS:loss,FRAGMENTATION_PIECES:3});
    beginGame(game,true);
    game.run(`const target=addBody(0,0,radiusForMass(1000),0,0,'moon');
      player.x=-player.r-target.r+0.1;player.vx=900;
      const hit=resolveBodyImpact(player,target,sweptBodyContact(player,player,target,target));`);
    close(game.run("player.mass+allBodies().reduce((sum,b)=>sum+b.mass,0)"),1400,1e-9);
    assert.ok(game.run("allBodies().every(b=>[b.r,b.mass,b.vx,b.vy,b.rotationSpeed].every(Number.isFinite))"));
    assert.equal(game.run("hit.debris.length"),loss===0?0:6);
  }
});

test("impact feedback is separate from physical-size rims and preserves compact HUD rendering", () => {
  const game=createGame(480,320);beginGame(game,true);
  game.run(`const route=loadFragmentationScenario('smaller');
    const visual=getThreatVisual(route.target.r,player.r,route.target);
    for(let i=0;i<60 && !world.nextImpactId;i++){steerFragmentationScenario(route);updateGame();observeFragmentationScenario(route);}
    drawGame();`);
  assert.deepEqual(game.json("visual.ring"),[92,244,176,235]);
  assert.ok(game.context.texts.some(text=>text.includes('hit: you -') && text.includes('target -')));
  assert.ok(game.run("gameplayNotification()===impactNotification && indicatorObstacles().length===2 && hasImpactGrace(player)"));
  game.run("windowWidth=320;windowHeight=180;windowResized();drawGame();");
  assert.ok(game.run("getHudBounds().short && player.ownerId==='player'"));
});

test("debris highlighting fades into background density without despawning or losing mass", () => {
  const game=createGame();beginGame(game,true);
  game.run(`const shard=addBody(6000,0,6,0,0,'debris');shard.kind='debris';
    shard.highlightUntilTick=DEBRIS_HIGHLIGHT_TICKS;
    camera.zoom=camera.backgroundZoom=CAMERA_MIN_ZOOM;runTick=DEBRIS_HIGHLIGHT_TICKS;`);
  close(game.run("backgroundBodyOpacity(shard)"),1);
  game.run("runTick+=DEBRIS_HIGHLIGHT_FADE_TICKS/2;");
  close(game.run("backgroundBodyOpacity(shard)"),0.5);
  game.run("runTick+=DEBRIS_HIGHLIGHT_FADE_TICKS/2;");
  close(game.run("backgroundBodyOpacity(shard)"),0);
  assert.ok(game.run("allBodies().includes(shard) && shard.mass===36 && !world.consumedIds.has(shard.id)"));
});

test("unattended ecology absorbs contacted food, conserves mass and clears surfaces over two minutes", t=>{
  const game=createGame();beginGame(game,true);
  game.context.now=()=>performance.now();
  game.run(`const scene=loadEcologyScenario('unattended');
    let peakDebris=world.debris.size,peakPairs=0,peakActors=0,merges=0,maxRestTicks=0;
    const resting=new Map();
    const timings=[];
    for(let i=0;i<7200;i++) {
      const time=now();updateGame();timings.push(now()-time);
      const mass=player.mass+allBodies().reduce((sum,b)=>sum+b.mass,0);
      if(Math.abs(mass-scene.totalMass)>scene.totalMass*1e-11)throw Error('Mass drift '+mass);
      if(gameState!=='playing')throw Error('Unattended player died');
      peakDebris=Math.max(peakDebris,world.debris.size);
      peakPairs=Math.max(peakPairs,world.ecologyStats.pairChecks);peakActors=Math.max(peakActors,world.ecologyStats.simulated);
      merges+=world.ecologyStats.merges;
      for(const body of allBodies()) {
        if(body===scene.source)continue;
        const dx=body.x-scene.source.x,dy=body.y-scene.source.y,distance=Math.hypot(dx,dy);
        const gap=distance-body.r-scene.source.r;
        const speed=Math.abs(((body.vx-scene.source.vx)*dx+(body.vy-scene.source.vy)*dy)/distance);
        const ticks=gap<4&&speed<1?(resting.get(body.id)??0)+1:0;
        resting.set(body.id,ticks);maxRestTicks=Math.max(maxRestTicks,ticks);
      }
    }
    const survivors=allBodies(),intact=survivors.filter(b=>!isLooseDebris(b));
    let penetration=0,worst=null;
    for(let i=0;i<intact.length;i++)for(let j=i+1;j<intact.length;j++) {
      const p=intact[i].r+intact[j].r-Math.hypot(intact[i].x-intact[j].x,intact[i].y-intact[j].y);
      if(p>penetration){penetration=p;worst=[intact[i],intact[j]].map(b=>({id:b.id,x:b.x,y:b.y,r:b.r,active:world.ecology.has(b.id),opacity:b.ecologyOpacity}));}
    }
    const earlyMean=timings.slice(60,660).reduce((sum,t)=>sum+t,0)/600;
    const lateMean=timings.slice(-600).reduce((sum,t)=>sum+t,0)/600;
    timings.sort((a,b)=>a-b);`);
  const result=game.json("({impacts:world.nextImpactId,peakDebris,remaining:world.debris.size,peakPairs,peakActors,merges,penetration,maxRestTicks,worst,foods:scene.foods.filter(residentBody).length,p95:timings[Math.floor(timings.length*.95)],max:timings.at(-1),earlyMean,lateMean})");
  t.diagnostic(JSON.stringify(result));
  assert.equal(result.foods,0);assert.ok(result.penetration<0.01 && result.maxRestTicks<60);
  assert.ok(result.peakDebris<=game.run('MAX_WORLD_DEBRIS')&&result.peakPairs<=game.run('ECOLOGY_MAX_PAIR_CHECKS'));
  assert.ok(result.remaining<result.peakDebris&&result.impacts>0&&result.merges>0);
});

test("distant visible fields already attract bodies before player entry without a second activation",()=>{
  const game=createGame();beginGame(game,true);
  game.run(`const scene=loadEcologyScenario('entry'), watched=scene.foods[0], startX=watched.x;
    for(let i=0;i<30;i++)updateGame(); // inspect attraction before surface absorption
    const before=watched.gravityAx, beforeWeight=world.ecology.get(watched.id).sources.get(scene.source.id).activation;
    player.x=2800;followPlayer();syncWorldRegions();updateGame();`);
  assert.ok(game.run("watched.x!==startX && before<0 && beforeWeight===1 && world.ecology.get(watched.id).sources.get(scene.source.id).activation===1"));
  assert.ok(game.run("watched.ecologyOpacity>0 && player.mass===400 && gameState==='playing'"));
});

test("competing neutral collectors award a contacted fragment exactly once and preserve mass",t=>{
  const game=createGame();beginGame(game,true);
  game.run(`const scene=loadEcologyScenario('competition');
    for(let i=0;i<90;i++)updateGame();`);
  const masses=game.json('[scene.first,scene.second].filter(residentBody).map(b=>b.mass)');t.diagnostic(JSON.stringify(masses));
  assert.ok(game.run("world.consumedIds.has(scene.debris[0].id) && world.debris.size===0"));
  close(masses.reduce((n,m)=>n+m,0),3396,1e-8);
  assert.equal(masses.filter(m=>m>1600).length,1);
});

test("tiny fragment merging preserves mass, ownership and shard visuals with a bounded fade",()=>{
  const game=createGame();beginGame(game,true);
  game.run(`runTick=DEBRIS_MERGE_AGE_TICKS;
    function crumb(id,x){const b=createBody(id,'debris',x,0,6,seededRandom(1));b.kind='debris';b.ownerId='pilot';b.originId='cloud';b.bornAtTick=0;b.collectAfterTick=0;b.highlightUntilTick=1e9;storeWorldBody(world,b);return b;}
    const a=crumb('a',300),b=crumb('b',305),before=a.mass+b.mass;
    const merged=tryMergeDebris(a,b);`);
  assert.ok(game.run("merged && world.debris.size===1 && a.kind==='debris' && a.ownerId==='pilot' && a.originId==='cloud' && world.mergeGhosts.length===1"));
  close(game.run('a.mass'),72);close(game.run('debrisRenderRadius(a)'),6);
  game.run('runTick+=DEBRIS_MERGE_FADE_TICKS;');close(game.run('debrisRenderRadius(a)'),Math.sqrt(72));
});

test("a full debris budget defers shedding without deleting mass or overlapping intact cores",()=>{
  const game=createGame(1600,900,1,{MAX_WORLD_DEBRIS:2});beginGame(game,true);
  game.run(`const route=loadFragmentationScenario('comparable');player.x=-player.r-route.target.r+1;
    const hit=resolveBodyImpact(player,route.target,sweptBodyContact(player,player,route.target,route.target));
    runTick+=FRAGMENTATION_REARM_TICKS+1;world.contacts.clear();player.impactGraceUntilTick=route.target.impactGraceUntilTick=0;
    player.x=route.target.x-player.r-route.target.r+1;
    const before=player.mass+route.target.mass;
    const limited=resolveBodyImpact(player,route.target,sweptBodyContact(player,player,route.target,route.target));`);
  assert.ok(game.run("world.debris.size===2 && limited.budgetLimited && player.mass+route.target.mass===before"));
  assert.ok(game.run("Math.hypot(player.x-route.target.x,player.y-route.target.y)>=player.r+route.target.r"));
});

test("earlier ambient contact wins against a later player contact instead of resolving player first",()=>{
  const game=createGame();beginGame(game,true);
  game.run(`const npc=addBody(72,0,30,-120),shard=addBody(35,0,7,0,0,'debris');
    shard.collectAfterTick=shard.publicAfterTick=shard.reclaimAfterTick=0;shard.gravityAfterTick=1e9;
    player.vx=PLAYER_MAX_SPEED;mouseX=width/2+STEERING_MAX_DISTANCE;updateGame();`);
  close(game.run('npc.mass'),949);close(game.run('player.mass'),400);
  assert.ok(game.run("world.consumedIds.has(shard.id) && score===0 && gameState==='playing'"));
});

test("collector recovery windows use provenance and ownership consistently for every actor",()=>{
  const game=createGame();beginGame(game,true);
  game.run(`const parent=body(0,0,80),rival=body(0,0,60),shard=body(0,0,10);
    shard.kind='debris';shard.originId=parent.originId;shard.ownerId=null;
    shard.collectAfterTick=12;shard.publicAfterTick=120;shard.reclaimAfterTick=720;`);
  assert.equal(game.run('canCollectDebris(parent,shard,120)'),false);
  assert.equal(game.run('canCollectDebris(rival,shard,119)'),false);
  assert.equal(game.run('canCollectDebris(rival,shard,120)'),true);
  assert.equal(game.run('canCollectDebris(parent,shard,720)'),true);
  game.run("parent.ownerId=shard.ownerId='pilot-a';");
  assert.equal(game.run('canCollectDebris(parent,shard,12)'),true);
});

test("protected debris rests outside an ambient surface and cannot be swallowed before opening",()=>{
  const game=createGame();beginGame(game,true);
  game.run(`const npc=addBody(4000,0,40),shard=addBody(4030,0,14,0,0,'debris');
    shard.collectAfterTick=12;shard.publicAfterTick=120;shard.gravityAfterTick=720;
    updateGame();`);
  assert.equal(game.run('npc.mass'),1600);
  assert.ok(game.run('residentBody(shard) && Math.hypot(npc.x-shard.x,npc.y-shard.y)>=npc.r+shard.r'));
});

test("merging rejects young, distant, fast, oversized or differently owned shards",()=>{
  const game=createGame();beginGame(game,true);
  game.run(`runTick=DEBRIS_MERGE_AGE_TICKS;
    const a=body(0,0,6),b=body(5,0,6);a.kind=b.kind='debris';a.ownerId=b.ownerId='same';
    a.originId=b.originId='same';a.bornAtTick=b.bornAtTick=0;
    b.x=1000;const distant=tryMergeDebris(a,b);b.x=5;
    b.bornAtTick=runTick;const young=tryMergeDebris(a,b);b.bornAtTick=0;
    b.ownerId='other';const ownership=tryMergeDebris(a,b);b.ownerId='same';
    b.vx=DEBRIS_MERGE_MAX_SPEED+1;const fast=tryMergeDebris(a,b);b.vx=0;
    setBodyMass(b,massForRadius(DEBRIS_MERGE_MAX_RADIUS+1));const oversized=tryMergeDebris(a,b);`);
  assert.deepEqual(game.json('[distant,young,ownership,fast,oversized]'),[false,false,false,false,false]);
});

test("dense region handoffs keep simulation, collision work, retirement and fragment counts bounded",()=>{
  const game=createGame(1600,900,1,{GRAVITY_ENABLED:false});beginGame(game,true);
  game.run(`for(const base of [0,20000])for(let i=0;i<MAX_ACTIVE_BODIES+20;i++)
      storeWorldBody(world,body(base+300+(i%50)*20,-220+Math.floor(i/50)*20,5));
    syncWorldRegions();syncEcology(true);updateGame();
    player.x=20000;followPlayer();updateGame();
    const bound=1+2*MAX_ACTIVE_BODIES+ECOLOGY_BACKGROUND_BODIES+ECOLOGY_FADING_BODIES+ECOLOGY_CONTINUITY_BODIES+2*GRAVITY_MAX_SOURCES;
    if(world.ecologyStats.simulated>bound)throw Error('Handoff integration overflow');
    for(let i=0;i<90;i++) {
      updateGame();
      if(world.ecologyStats.simulated>bound || world.ecologyStats.pairChecks>ECOLOGY_MAX_PAIR_CHECKS ||
         world.ecologyStats.retirements>ECOLOGY_MAX_RETIREMENTS || world.debris.size>MAX_WORLD_DEBRIS)throw Error('Work overflow');
    }`);
  assert.ok(game.run('gameState===\'playing\' && world.ecology.size<=MAX_ACTIVE_BODIES+ECOLOGY_BACKGROUND_BODIES+ECOLOGY_FADING_BODIES+ECOLOGY_CONTINUITY_BODIES'));
});

test("competing collectors can contest fresh material from an unattended large-body impact",t=>{
  const game=createGame(1600,900,1,{GRAVITY_ENABLED:false});beginGame(game,true);
  game.run(`const a=addBody(900,0,240,900,0,'moon'),b=addBody(1379,0,240,0,0,'moon');
    const hit=resolveBodyImpact(a,b,sweptBodyContact(a,a,b,b)),prize=hit.debris[5];
    hit.debris.forEach((shard,i)=>{if(shard!==prize){shard.x=3000+i*300;shard.y=3500;storeWorldBody(world,shard);}});
    for(let i=0;i<DEBRIS_PUBLIC_COLLECTION_TICKS;i++)updateGame();
    const c=addBody(prize.x,prize.y-prize.r-50,30,0,300),d=addBody(prize.x,prize.y+prize.r+70,30,0,-300);
    const before=player.mass+allBodies().reduce((sum,body)=>sum+body.mass,0);
    for(let i=0;i<60;i++)updateGame();`);
  t.diagnostic(JSON.stringify(game.json('({impacts:world.nextImpactId,consumed:world.consumedIds.has(prize.id),masses:[c.mass,d.mass],prize:{x:prize.x,y:prize.y,r:prize.r},c:{x:c.x,y:c.y},d:{x:d.x,y:d.y},cache:[world.ecology.has(c.id),world.ecology.has(d.id)]})')));
  assert.ok(game.run('world.nextImpactId===1 && world.consumedIds.has(prize.id) && [c,d].filter(body=>body.mass>900).length===1'));
  close(game.run('[c,d].filter(residentBody).reduce((n,b)=>n+b.mass,0)'),game.run('1800+prize.mass'),1e-8);
  close(game.run('player.mass+allBodies().reduce((sum,body)=>sum+body.mass,0)'),game.run('before'),1e-7);
});

test("debris is anchored to swept impact surfaces and does not follow the faster body's absolute velocity",()=>{
  const clouds=[];
  for(const boost of [0,-10000]) {
    const game=createGame();beginGame(game,true);
    game.run(`const a=addBody(-470,0,240,900+${boost},0,'moon'),b=addBody(0,0,240,${boost},0,'moon');
      const contact=sweptBodyContact(a,{x:-600,y:0},b,{x:0,y:0});
      const hit=resolveBodyImpact(a,b,contact);
      const occupied=[a,b];
      for(const piece of hit.debris) {
        if(!occupied.every(body=>Math.hypot(piece.x-body.x,piece.y-body.y)>=piece.r+body.r+DEBRIS_SPACING-1e-8))throw Error('Overlapping ejecta');
        occupied.push(piece);
      }`);
    close(game.run('hit.position.x'),-240);close(game.run('hit.position.y'),0);
    assert.ok(game.run('hit.debris.some(p=>p.y>0)&&hit.debris.some(p=>p.y<0)&&hit.debris.some(p=>p.x>a.x)'));
    close(game.run('a.mass+b.mass+hit.debris.reduce((m,p)=>m+p.mass,0)'),115200,1e-8);
    clouds.push(game.json('hit.debris.map(p=>[p.x,p.y,p.mass])'));
  }
  assert.deepEqual(clouds[0],clouds[1]);
});

test("smaller, comparable and larger raids retain motion through escape, collection, departure and return",t=>{
  for(const name of ['smaller','comparable','larger']) {
    const game=createGame();beginGame(game,true);
    game.run(`const route=loadFragmentationScenario('${name}');
      for(let i=0;i<1500&&route.phase!=='done';i++) {
        steerFragmentationScenario(route);updateGame();observeFragmentationScenario(route);
        const mass=player.mass+allBodies().reduce((m,b)=>m+b.mass,0);
        if(Math.abs(mass-route.totalMass)>route.totalMass*1e-12)throw Error('Impact/collection mass drift');
        if(gameState!=='playing')throw Error('Raid failed');
      }
      if(route.phase!=='done')throw Error('Collection incomplete');
      const collectedMass=player.mass,core=route.target;
      for(let i=0;i<600;i++) {
        steerFragmentationDeparture(route);updateGame();
        if(!world.ecology.has(core.id)||!residentBody(core))throw Error('Recoil retired during departure');
      }
      steerFragmentationDeparture(route);
      const elapsed=(runTick-route.departure.tick)*SIMULATION_STEP_SECONDS;
      const driftError=Math.hypot(core.x-route.departure.x-core.vx*elapsed,core.y-route.departure.y-core.vy*elapsed);
      const offLocal=!star_objects.includes(core)&&!world.gravitySources.has(core.id);
      const before={x:core.x,y:core.y,vx:core.vx,vy:core.vy};
      player.x=core.x-core.r-player.r-1000;player.y=core.y;
      player.vx=player.vy=player.gravityVx=player.gravityVy=0;mouseX=width/2;mouseY=height/2;
      followPlayer();updateGame();`);
    assert.ok(game.run("route.phase==='departed'&&offLocal&&player.ownerId==='player'&&player===route.originalPlayer&&world.nextImpactId===1"));
    close(game.run('driftError'),0,1e-6);
    close(game.run('core.x-before.x'),game.run('before.vx*SIMULATION_STEP_SECONDS'),1e-7);
    close(game.run('core.y-before.y'),game.run('before.vy*SIMULATION_STEP_SECONDS'),1e-7);
    close(game.run('player.mass'),game.run('collectedMass'),1e-7);
    close(game.run('player.mass+allBodies().reduce((m,b)=>m+b.mass,0)'),game.run('route.totalMass'),1e-6);
    t.diagnostic(JSON.stringify(game.json(`({name:'${name}',tick:runTick,driftError,targetSpeed:Math.hypot(core.vx,core.vy),mass:player.mass})`)));
  }
});

test("moving large bodies hit resident targets beyond player activation before approach",()=>{
  const game=createGame();beginGame(game,true);
  game.run(`const a=addBody(30000,0,240,900,0,'moon'),b=addBody(31000,0,240,0,0,'moon');
    const total=player.mass+a.mass+b.mass;
    for(let i=0;i<180;i++)updateGame();`);
  assert.ok(game.run("world.nextImpactId===1&&a.hasFragmented&&b.hasFragmented&&world.ecology.has(a.id)&&world.ecology.has(b.id)&&!star_objects.includes(a)"));
  close(game.run('player.mass+allBodies().reduce((m,b)=>m+b.mass,0)'),game.run('total'),1e-7);
  game.run('const before={x:a.x,vx:a.vx};player.x=27000;followPlayer();updateGame();');
  close(game.run('a.x-before.x'),game.run('before.vx*SIMULATION_STEP_SECONDS'),1e-7);
});

test("planet surfaces absorb small bodies and release only source-protected shards without losing mass",t=>{
  for(const type of ['asteroid','debris','broken']) {
    const game=createGame();beginGame(game,true);
    game.run(`const planet=addSource(5000,0,600);
      const object=addBody(planet.x-planet.r-${type==='broken'?90:10}+1,0,${type==='broken'?90:10},100,0,'${type==='broken'?'moon':type}');
      ${type==='broken'?'object.hasFragmented=true;':''}
      ${type==='debris'?`object.originId=planet.originId;object.collectAfterTick=12;object.publicAfterTick=120;
        object.reclaimAfterTick=720;object.gravityAfterTick=0;object.highlightUntilTick=1e9;`:''}
      const total=player.mass+planet.mass+object.mass;
      let minGap=Infinity,maxGap=0,maxOutward=0;
      for(let i=0;i<360;i++) {
        updateGame();
        const gap=Math.hypot(planet.x-object.x,planet.y-object.y)-planet.r-object.r;
        minGap=Math.min(minGap,gap);maxGap=Math.max(maxGap,gap);
        maxOutward=Math.max(maxOutward,planet.vx-object.vx);
      }`);
    if(type==='debris')assert.ok(game.run('residentBody(object)&&minGap>=-1e-7&&maxGap>80&&maxOutward>=ECOLOGY_SURFACE_RELEASE_SPEED-1e-7'));
    else assert.ok(game.run('!residentBody(object)&&world.consumedIds.has(object.id)'));
    assert.equal(game.run('world.nextImpactId'),0);
    close(game.run('player.mass+allBodies().reduce((m,b)=>m+b.mass,0)'),game.run('total'),1e-6);
    t.diagnostic(JSON.stringify(game.json(`({type:'${type}',minGap,maxGap,maxOutward})`)));
  }
});

test("surface release suppresses only the contacted source and restores its force smoothly",()=>{
  const game=createGame();beginGame(game,true);
  game.run(`const planet=addSource(5000,0,600),other=addSource(4000,1200,600);
    const food=addBody(4395,0,10,100,0,'debris');
    food.originId=planet.originId;food.reclaimAfterTick=1e9;food.gravityAfterTick=0;updateGame();
    const release=food.surfaceRelease;
    const held=gravityFromSource(food,planet),otherPull=gravityFromSource(food,other);
    runTick=release.untilTick;const edge=gravityFromSource(food,planet);
    runTick+=ECOLOGY_SURFACE_GRAVITY_FADE_TICKS/2;const halfway=gravityFromSource(food,planet);
    runTick+=ECOLOGY_SURFACE_GRAVITY_FADE_TICKS/2;const full=gravityFromSource(food,planet);`);
  close(game.run('Math.hypot(held.ax,held.ay)'),0);close(game.run('Math.hypot(edge.ax,edge.ay)'),0);
  assert.ok(game.run('Math.hypot(otherPull.ax,otherPull.ay)>0'));
  close(game.run('halfway.ax/full.ax'),0.5,1e-10);
});

test("border warnings omit visible surfaces, track zoom and resume only off screen",()=>{
  const game=createGame();beginGame(game,true);
  game.run('const planet=addSource(1100,0,600);player.vx=1200;');
  assert.ok(game.run('hazardMetrics(planet)!==null&&collectHazardWarnings().length===0'));
  game.run('planet.x=3000;storeWorldBody(world,planet);');
  assert.equal(game.run('collectHazardWarnings()[0]?.id'),game.run('planet.id'));
  game.run('camera.zoom=0.1;');assert.equal(game.run('collectHazardWarnings().length'),0);
  game.run('camera.zoom=1;planet.x=750;storeWorldBody(world,planet);windowWidth=400;windowHeight=300;windowResized();');
  assert.ok(game.run('planet.x>width/2&&collectHazardWarnings().length===0'));
  game.run('planet.x=801;storeWorldBody(world,planet);');
  assert.equal(game.run('collectHazardWarnings()[0]?.id'),game.run('planet.id'));
});

test("moving planet rendering and warning IDs follow current positions beyond the seed-cell window",()=>{
  const game=createGame(400,300);beginGame(game,true);
  game.run(`setBodyMass(player,massForRadius(1900));player.vx=playerMovementLimits().speed;
    const planet=addSource(50000,0,1800);planet.vx=-200;storeWorldBody(world,planet);
    world.backgroundPlanets.set(planet.id,planet);world.generatedPlanetCells.set(regionKey(-30,0),planet.id);`);
  assert.equal(game.run('collectHazardWarnings()[0]?.id'),game.run('planet.id'));
  assert.equal(game.run('collectHazardWarnings().filter(w=>w.id===planet.id).length'),1);
  game.run('width=1600;height=900;camera.zoom=camera.backgroundZoom=0.01;');
  assert.ok(game.run('getRenderableBodies().includes(planet)&&collectHazardWarnings().length===0'));
  game.run('consumeWorldBody(planet);');
  assert.ok(game.run('!world.movingBodies.has(planet.id)&&!getRenderableBodies().includes(planet)&&collectHazardWarnings().length===0'));
});

test("continuity pools retain bounded work when many distant movers compete for slots",()=>{
  const game=createGame(1600,900,1,{GRAVITY_ENABLED:false});beginGame(game,true);
  game.run(`for(let i=0;i<ECOLOGY_CONTINUITY_BODIES+40;i++)
      addBody(30000+(i%13)*1200,Math.floor(i/13)*1200,120,20,0,'moon');
    const starts=new Map([...world.movingBodies.values()].map(b=>[b.id,b.x]));
    for(let i=0;i<90;i++) {
      updateGame();
      const capacity=MAX_ACTIVE_BODIES+ECOLOGY_BACKGROUND_BODIES+ECOLOGY_FADING_BODIES+ECOLOGY_CONTINUITY_BODIES;
      if(world.ecologyMoving.length>ECOLOGY_CONTINUITY_BODIES||world.ecology.size>capacity||
        world.ecologyStats.pairChecks>ECOLOGY_MAX_PAIR_CHECKS||world.debris.size>MAX_WORLD_DEBRIS)throw Error('Continuity budget overflow');
    }`);
  assert.equal(game.run('world.ecologyMoving.length'),game.run('ECOLOGY_CONTINUITY_BODIES'));
  assert.ok(game.run('[...world.movingBodies.values()].every(b=>b.x-starts.get(b.id)>29)'));
});

test("relative-size rims use physical radii across forms, eligibility, difficulty and every LOD", () => {
  const game=createGame();beginGame(game,true);
  const green=[92,244,176,235],yellow=[255,215,95,240],red=[255,112,110,240];
  const strokes=[];game.context.stroke=(...channels)=>strokes.push(channels);
  for (const radius of [20,119,120,240,1199,1200,1999]) {
    game.run(`setBodyMass(player,massForRadius(${radius}));updatePlayerEvolution();`);
    for (const [ratio,expected] of [[0.5,green],[0.8,yellow],[1,yellow],[1.25,yellow],[2,red],[10,red]]) {
      for (const type of ['asteroid','moon','planet','debris']) {
        game.run(`var sample=body(0,0,${radius*ratio},0,0,'${type}');sample.hasFragmented=true;
          sample.impactGraceUntilTick=1e9;sample.collectAfterTick=1e9;
          var visual=getThreatVisual(sample.r,player.r,sample);`);
        assert.deepEqual(game.json('visual.ring'),expected,`${radius}, ${ratio}, ${type}`);
        for (const detail of [true,false]) {
          strokes.length=0;
          game.run(`selectedDifficultyIndex=4;camera.zoom=0.01;drawBody(sample,false,${detail});`);
          assert.ok(strokes.some(c=>JSON.stringify(c)===JSON.stringify(expected)));
        }
      }
    }
  }
  // Form appearance can stay at Planet after a loss; colors still use actual radius.
  game.run('setBodyMass(player,massForRadius(20));');
  assert.equal(game.run('player.type'),'planet');
  assert.deepEqual(game.json('getThreatVisual(1200,player.r).ring'),red);
  const configured=createGame(1600,900,1,{OUTLINE_SIMILAR_RADIUS_RATIO:2});beginGame(configured,true);
  assert.deepEqual(configured.json('getThreatVisual(40,20).ring'),yellow);
});

test("disparity independently lowers smaller retained fractions and raises larger retained fractions", t => {
  const game=createGame();beginGame(game,true);
  game.run(`const small=body(0,0,240),big=body(0,0,240);`);
  const rows=[];
  for (const speed of [0,50,225,900]) {
    let previous=null;
    for (const ratio of [1,1.25,1.5,2,3,4,9,25,63.9]) {
      game.run(`setBodyMass(big,small.mass*${ratio});var loss=impactMassLoss(small,big,${speed});
        var swapped=impactMassLoss(big,small,${speed});`);
      const loss=game.json('loss');
      close(loss.a,game.run('swapped.b'));close(loss.b,game.run('swapped.a'));
      if(previous) {
        assert.ok(loss.a>=previous.a && loss.b<previous.b);
        if(previous.a<game.run('FRAGMENTATION_MAX_LOSS'))assert.ok(loss.a>previous.a);
      }
      previous=loss;
      if(speed===900)rows.push({ratio,smallRetained:1-loss.a,largeRetained:1-loss.b});
    }
  }
  // Verify actual core + own debris partitions, including piece-capacity limits.
  game.run(`var partitions=[];
    for(const ratio of [1,2,4,25,63.9]) {
      runTick++;world.ecologyStats.impacts=0;
      const a=addBody(5000,0,240,900,0,'moon'),b=addBody(5000+a.r+240*Math.sqrt(ratio)-1,0,240*Math.sqrt(ratio),0,0,'planet');
      b.gravitySource=true; // retain the planetary raid profile at high disparity
      const original=[a.mass,b.mass],event=resolveBodyImpact(a,b,sweptBodyContact(a,a,b,b));
      if(event.kind!=='fragmented')throw Error('Expected fragmentation at ratio '+ratio);
      const partition=[a,b].map((parent,i)=>({before:original[i],retained:parent.mass,
        ejecta:event.debris.filter(p=>p.parentId===parent.id).reduce((n,p)=>n+p.mass,0)}));
      partitions.push(partition);
      for(const parent of [a,b])if(!event.debris.filter(p=>p.parentId===parent.id).every(p=>p.mass<parent.mass))throw Error('Core ownership lost');
    }`);
  for(const pair of game.json('partitions'))for(const parent of pair)close(parent.retained+parent.ejecta,parent.before,1e-6);
  t.diagnostic(JSON.stringify(rows));
});

test("extreme intact absorption has a configurable inclusive boundary and conserves mass for either actor", () => {
  for(const playerIsLarge of [false,true])for(const reverse of [false,true])for(const ratio of [63.99,64,64.01]) {
    const game=createGame();beginGame(game,true);
    game.run(`setBodyMass(player,FRAGMENTATION_MIN_MASS*${playerIsLarge?ratio:1});
      const other=addBody(player.r+radiusForMass(FRAGMENTATION_MIN_MASS*${playerIsLarge?1:ratio})-1,0,
        radiusForMass(FRAGMENTATION_MIN_MASS*${playerIsLarge?1:ratio}),0,0,'planet');
      other.gravitySource=true; // this fixture measures the planetary 64:1 threshold
      const total=player.mass+other.mass,contact=sweptBodyContact(player,player,other,other);
      const event=${reverse?'resolveBodyImpact(other,player,{...contact,ax:contact.bx,ay:contact.by,bx:contact.ax,by:contact.ay,nx:-contact.nx,ny:-contact.ny})':'resolveBodyImpact(player,other,contact)'};
      if(event.kind==='absorbed')handlePlayerContact(other,event);`);
    assert.equal(game.run('event.kind'),ratio<64?'fragmented':'absorbed');
    close(game.run('player.mass+allBodies().reduce((n,b)=>n+b.mass,0)'),game.run('total'),1e-6);
    if(ratio>=64) {
      assert.equal(game.run('world.nextImpactId'),0);assert.equal(game.run('world.debris.size'),0);
      assert.equal(game.run('gameState'),playerIsLarge?'playing':'gameover');
      assert.equal(game.run('score'),playerIsLarge?1:0);
      assert.equal(game.run('residentBody(event.consumed)'),false);
    }
  }
  const game=createGame(1600,900,1,{ABSORPTION_LARGE_MASS_RATIO:4,MAX_WORLD_DEBRIS:0});beginGame(game,true);
  game.run(`const a=addBody(4000,0,120,0,0,'moon'),b=addBody(4359,0,240,0,0,'planet');b.gravitySource=true;
    const event=resolveBodyImpact(a,b,sweptBodyContact(a,a,b,b));`);
  assert.equal(game.run('event.kind'),'absorbed');close(game.run('b.mass'),72000);
});

test("fresh impact debris is collectible on contact without bumping and source recovery is separate", () => {
  const game=createGame();beginGame(game,true);
  game.run(`const a=addBody(5000,0,240,900,0,'moon'),b=addBody(5479,0,240,0,0,'moon');
    a.ownerId='pilot-a';const event=resolveBodyImpact(a,b,sweptBodyContact(a,a,b,b));
    const fromA=event.debris.find(p=>p.parentId===a.id),fromB=event.debris.find(p=>p.parentId===b.id);
    const ally=addBody(8000,0,10);ally.ownerId=a.ownerId;
    const sourceOwned=canCollectDebris(a,fromA),sourceNeutral=canCollectDebris(b,fromB);
    const allyAllowed=canCollectDebris(ally,fromA),opponentAllowed=canCollectDebris(b,fromA);
    let bumpCount=0;const realSurface=resolveSurfaceContact;
    resolveSurfaceContact=(...args)=>{bumpCount++;return realSurface(...args);};
    const before=player.mass+allBodies().reduce((n,b)=>n+b.mass,0);
    player.x=fromA.x;player.y=fromA.y;player.vx=100;player.vy=25;
    const motion=JSON.stringify([player.x,player.y,player.vx,player.vy]);
    const collected=resolveBodyImpact(player,fromA,sweptBodyContact(player,player,fromA,fromA));
    handlePlayerContact(fromA,collected);
    const ambient=resolveBodyImpact(ally,fromB,sweptBodyContact(ally,ally,fromB,fromB));
    resolveBodyImpact(player,fromA,null);`);
  assert.deepEqual(game.json('[sourceOwned,sourceNeutral,allyAllowed,opponentAllowed]'),[false,false,true,true]);
  assert.equal(game.run('collected.kind'),'collected');assert.equal(game.run('ambient.kind'),'collected');
  assert.equal(game.run('bumpCount'),0);assert.equal(game.run('score'),1);
  assert.ok(game.run('motion===JSON.stringify([player.x,player.y,player.vx,player.vy])'));
  close(game.run('player.mass+allBodies().reduce((n,b)=>n+b.mass,0)'),game.run('before'),1e-6);
  game.run(`const own=event.debris.find(p=>p.parentId===a.id&&!world.consumedIds.has(p.id));
    const neutral=event.debris.find(p=>p.parentId===b.id&&!world.consumedIds.has(p.id));`);
  assert.equal(game.run('canCollectDebris(a,own,DEBRIS_COLLECTION_DELAY_TICKS)'),true);
  assert.equal(game.run('canCollectDebris(b,neutral,DEBRIS_RECLAIM_TICKS-1)'),false);
  assert.equal(game.run('canCollectDebris(b,neutral,DEBRIS_RECLAIM_TICKS)'),true);
});

test("fresh ejecta participates in later contact passes during its birth tick", () => {
  const game=createGame();beginGame(game,true);
  game.run(`const a=addBody(5000,0,240,900,0,'moon'),b=addBody(5479,0,240,0,0,'moon');
    const realImpact=resolveBodyImpact;let shard=null;
    resolveBodyImpact=(...args)=>{
      const event=realImpact(...args);
      if(event.kind==='fragmented') {
        shard=event.debris[0];shard.x=player.x;shard.y=player.y;storeWorldBody(world,shard);
      }
      return event;
    };
    updateGame();`);
  assert.ok(game.run('shard && shard.bornAtTick===runTick && world.consumedIds.has(shard.id) && score===1'));
});

test("player and ambient bodies share separation and source-field release rules", () => {
  for(const actorIsPlayer of [false,true]) {
    const game=createGame(1600,900,1,{ABSORPTION_MIN_MASS_RATIO:10000});beginGame(game,true);
    game.run(`const planet=addSource(5000,0,600);
      const actor=${actorIsPlayer?'player':'addBody(0,0,20)'};
      actor.x=planet.x-planet.r-actor.r+1;actor.vx=100;
      const before=actor.mass+planet.mass;
      const event=resolveBodyImpact(actor,planet,sweptBodyContact(actor,actor,planet,planet));`);
    assert.equal(game.run('event.kind'),'separated');
    assert.ok(game.run('Math.hypot(actor.x-planet.x,actor.y-planet.y)>=actor.r+planet.r'));
    close(game.run('planet.vx-actor.vx'),game.run('ECOLOGY_SURFACE_RELEASE_SPEED'),1e-7);
    assert.ok(game.run('actor.surfaceRelease.sourceId===planet.id'));
    close(game.run('actor.mass+planet.mass'),game.run('before'));
  }
});

test("dormant retirement uses the shared absorption rule and ignores clearance-only gaps", () => {
  const game=createGame();beginGame(game,true);
  game.run(`const planet=addSource(5000,0,600),food=addBody(4391,0,10);
    const before=planet.mass+food.mass;
    settleDormantBody(food);
    const peer=addBody(planet.x+planet.r+120+1,0,120,0,0,'moon');
    const peerMass=peer.mass;settleDormantBody(peer);`);
  assert.ok(game.run('world.consumedIds.has(food.id) && !residentBody(food)'));
  close(game.run('planet.mass'),game.run('before'));
  close(game.run('peer.mass'),game.run('peerMass'));
});
