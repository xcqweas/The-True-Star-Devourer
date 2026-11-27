// Random streams belong to coordinates/identities, independent of exploration
// order and p5's menu randomness. Signed coordinates are hashed without abs().
function hashSeed(seed, ...parts) {
  let hash = (seed ^ 2166136261) >>> 0;
  for (const part of parts) {
    for (const character of String(part) + ":") {
      hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
    }
  }
  return hash;
}

function seededRandom(seed) {
  let state = seed >>> 0;
  return function () {
    state = (state + 0x6D2B79F5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), state | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function regionKey(rx, ry) { return `${rx},${ry}`; }
function coordinateRegion(value) { return Math.floor(value / REGION_SIZE); }

function isOutsideStartingArea(body) {
  const extent = isGravitySource(body) ? gravityInfluenceRadius(body) : body.r;
  return Math.hypot(body.x, body.y) >= extent + START_SAFE_RADIUS;
}

function planetForCell(seed, cx, cy) {
  const rng = seededRandom(hashSeed(seed, "planet", cx, cy));
  if (rng() > PLANET_CELL_CHANCE) return null;
  const size = PLANET_CELL_REGIONS * REGION_SIZE;
  const inset = MAX_PLANET_RADIUS + SYSTEM_MOON_MAX_GAP + 2 * MAX_MOON_RADIUS + PLANET_ROUTE_GAP / 2;
  const body = {
    type: "planet", systemId: regionKey(cx,cy),
    x: cx * size + inset + rng() * (size - 2 * inset),
    y: cy * size + inset + rng() * (size - 2 * inset),
    r: 1200 + rng() * (MAX_PLANET_RADIUS - 1200)
  };
  return isOutsideStartingArea(body) ? body : null;
}

function systemMoonsForPlanet(seed, planet) {
  const rng = seededRandom(hashSeed(seed, 'system-moons', planet.systemId));
  const count = SYSTEM_MOON_MIN_COUNT + Math.floor(rng() * (SYSTEM_MOON_MAX_COUNT - SYSTEM_MOON_MIN_COUNT + 1));
  const phase = rng() * Math.PI * 2, moons = [];
  for (let i=0;i<count;i++) {
    const r = 120 + rng() * (MAX_MOON_RADIUS - 120);
    const distance = planet.r + r + SYSTEM_MOON_MIN_GAP + rng() * (SYSTEM_MOON_MAX_GAP - SYSTEM_MOON_MIN_GAP);
    // One unused angular slot leaves a broad approach sector through the system.
    const angle = phase + i * Math.PI * 2 / (count + 1);
    const moon = {type:'moon',r,x:planet.x+Math.cos(angle)*distance,y:planet.y+Math.sin(angle)*distance,
      slot:`system:${planet.systemId}:${i}`,systemId:planet.systemId};
    if (isOutsideStartingArea(moon) && hasClearance(moon,moons,LARGE_BODY_CLEARANCE)) moons.push(moon);
  }
  return moons;
}

function asteroidFieldDensity(seed, x, y) {
  const smooth = value => smoothGravityWeight(value);
  const size = ASTEROID_FIELD_CELL_REGIONS * REGION_SIZE;
  const cx = Math.floor(x/size), cy = Math.floor(y/size);
  let density = 1 - smooth((Math.hypot(x,y)-SPATIAL_OPENING_RADIUS)/SPATIAL_OPENING_FADE);
  for(let sy=cy-1;sy<=cy+1;sy++) for(let sx=cx-1;sx<=cx+1;sx++) {
    const rng = seededRandom(hashSeed(seed,'asteroid-field',sx,sy));
    if(rng()>ASTEROID_FIELD_CHANCE) continue;
    const px = (sx+0.5)*size+(rng()*2-1)*ASTEROID_FIELD_JITTER;
    const py = (sy+0.5)*size+(rng()*2-1)*ASTEROID_FIELD_JITTER;
    const distance = Math.hypot(x-px,y-py);
    density = Math.max(density,1-smooth((distance-ASTEROID_FIELD_RADIUS)/ASTEROID_FIELD_FEATHER));
  }
  return density;
}

function asteroidCountForRegion(seed, rx, ry, planets) {
  const x=(rx+0.5)*REGION_SIZE,y=(ry+0.5)*REGION_SIZE;
  let density=asteroidFieldDensity(seed,x,y);
  for(const planet of planets) {
    const distance=Math.hypot(x-planet.x,y-planet.y)-planet.r;
    const outside=smoothGravityWeight((distance-SYSTEM_MOON_MAX_GAP-2*MAX_MOON_RADIUS)/SPATIAL_OPENING_FADE);
    density*=SYSTEM_ASTEROID_DENSITY+(1-SYSTEM_ASTEROID_DENSITY)*outside;
  }
  const count=ASTEROIDS_IN_TRAVEL_REGION+(ASTEROIDS_IN_FIELD_REGION-ASTEROIDS_IN_TRAVEL_REGION)*density;
  const opening=1-smoothGravityWeight((Math.hypot(x,y)-SPATIAL_OPENING_RADIUS)/SPATIAL_OPENING_FADE);
  return Math.max(0,Math.round(count+(ASTEROIDS_PER_REGION-count)*opening));
}

function nearbyPlanets(seed, rx, ry) {
  const cx = Math.floor(rx / PLANET_CELL_REGIONS);
  const cy = Math.floor(ry / PLANET_CELL_REGIONS);
  const bodies = [];
  for (let y = cy - 1; y <= cy + 1; y++) {
    for (let x = cx - 1; x <= cx + 1; x++) {
      const body = planetForCell(seed, x, y);
      if (body) bodies.push(body);
    }
  }
  return bodies;
}

function hasClearance(body, others, gap) {
  return others.every(other => Math.hypot(body.x - other.x, body.y - other.y) >= body.r + other.r + gap);
}

function moonForRegion(seed, rx, ry, planets, systemMoons = []) {
  const rng = seededRandom(hashSeed(seed, "moon", rx, ry));
  const density = asteroidFieldDensity(seed,(rx+0.5)*REGION_SIZE,(ry+0.5)*REGION_SIZE);
  if (rng() > MOON_REGION_CHANCE * (MOON_TRAVEL_DENSITY + (1-MOON_TRAVEL_DENSITY)*density)) return null;
  const r = 120 + rng() * (MAX_MOON_RADIUS - 120);
  // Neighboring moons stay inset, leaving a route across region seams.
  const inset = r + LARGE_BODY_CLEARANCE / 2;
  for (let attempt = 0; attempt < PLACEMENT_ATTEMPTS; attempt++) {
    const body = { type: "moon", r,
      x: rx * REGION_SIZE + inset + rng() * (REGION_SIZE - 2 * inset),
      y: ry * REGION_SIZE + inset + rng() * (REGION_SIZE - 2 * inset) };
    if (isOutsideStartingArea(body) && hasClearance(body, planets, SYSTEM_MOON_MAX_GAP+2*MAX_MOON_RADIUS) &&
        hasClearance(body,systemMoons,LARGE_BODY_CLEARANCE)) return body;
  }
  return null;
}

function generateRegion(seed, rx, ry, stageIndex = 0, difficulty = 1) {
  const bodies = [];
  const planets = nearbyPlanets(seed, rx, ry);
  // Only the region containing a planet's center owns it. Neighbor queries
  // reserve its footprint but never create additional copies.
  for (const planet of planets) {
    if (coordinateRegion(planet.x) === rx && coordinateRegion(planet.y) === ry) bodies.push(planet);
  }
  const systemMoons = planets.flatMap(planet=>systemMoonsForPlanet(seed,planet));
  const moons = [...systemMoons];
  for(const moon of moons) {
    if(coordinateRegion(moon.x)===rx && coordinateRegion(moon.y)===ry) bodies.push(moon);
  }
  for (let y = ry - 1; y <= ry + 1; y++) {
    for (let x = rx - 1; x <= rx + 1; x++) {
      const moon = moonForRegion(seed, x, y, planets, systemMoons);
      if (moon) {
        moons.push(moon);
        if (x === rx && y === ry) bodies.push(moon);
      }
    }
  }
  const rng = seededRandom(hashSeed(seed, "asteroids", rx, ry));
  const factor = difficulty + Math.min(stageIndex * 0.05, 0.25);
  const asteroidCount = asteroidCountForRegion(seed,rx,ry,planets);
  for (let slot = 0; slot < asteroidCount; slot++) {
    // Small objects remain present in every stage and throughout the run.
    const r = Math.min(MAX_ASTEROID_RADIUS, (ASTEROID_MIN_RADIUS + ASTEROID_RADIUS_SPREAD * rng() ** 2) * factor);
    for (let attempt = 0; attempt < PLACEMENT_ATTEMPTS; attempt++) {
      const inset = MAX_ASTEROID_RADIUS + 24;
      const body = { type: "asteroid", r, slot,
        x: rx * REGION_SIZE + inset + rng() * (REGION_SIZE - 2 * inset),
        y: ry * REGION_SIZE + inset + rng() * (REGION_SIZE - 2 * inset) };
      if (isOutsideStartingArea(body) && hasClearance(body, planets.concat(moons), 64) && hasClearance(body, bodies, 24)) {
        bodies.push(body);
        break;
      }
    }
  }
  return bodies.map(body => createGeneratedBody(seed, stageIndex, rx, ry, body));
}

function createGeneratedBody(seed, stageIndex, rx, ry, body) {
  const id = `${seed}:${stageIndex}:${rx},${ry}:${body.type}:${body.slot ?? 0}`;
  const appearanceRng = seededRandom(hashSeed(seed, id));
  const motionRng = seededRandom(hashSeed(seed, id, "motion"));
  const direction = motionRng() * Math.PI * 2;
  // Convert the old asteroid drift speeds to world units/second.
  const speed = body.type === "asteroid" ? (1 + motionRng()) * (25 / body.r) * SIMULATION_FPS : 0;
  const object = createBody(id, body.type, body.x, body.y, body.r, appearanceRng,
    Math.cos(direction) * speed, Math.sin(direction) * speed);
  if(body.systemId !== undefined) object.systemId = `${seed}:system:${body.systemId}`;
  return object;
}

function createWorld(seed, stageIndex, difficulty, fixture = false) {
  const state = {
    seed, stageIndex, difficulty, fixture,
    generatedRegions: new Set(),
    generatedPlanetCells: new Map(), // cell -> planet ID, or null for an empty cell
    backgroundPlanets: new Map(),
    regions: new Map(), // resident position buckets, including dormant objects
    consumedIds: new Set(),
    gravitySources: new Map()
  };
  state.contacts = new Map();
  state.nextImpactId = 0;
  state.debris = new Map();
  state.sourceRegions = new Map();
  state.movingBodies = new Map(); // recoiling cores/prescribed large movers; current positions, not seed cells
  state.ecology = new Map();
  state.mergeGhosts = [];
  state.ecologyStats = {};
  if (fixture) {
    const descriptions = [
      ["asteroid", 180, 0, 10, 0, 0],
      ["asteroid", -170, 150, 14, 8, -4],
      ["asteroid", 450, 180, 32, -5, 0],
      ["moon", -500, -260, 180, 0, 0],
      ["planet", 2500, 0, 1800, 0, 0]
    ];
    descriptions.forEach(([type, x, y, r, vx, vy], index) => {
      const id = `fixture:${index}`;
      storeWorldBody(state, createBody(id, type, x, y, r, seededRandom(hashSeed(42, id)), vx, vy));
    });
  }
  return state;
}

function storeWorldBody(state, body) {
  if (!isLooseDebris(body) && (body.mass >= FRAGMENTATION_MIN_MASS || body.hasFragmented) &&
      Math.hypot(body.vx, body.vy) >= ECOLOGY_MOVING_MIN_SPEED) state.movingBodies.set(body.id, body);
  else state.movingBodies.delete(body.id);
  const key = regionKey(coordinateRegion(body.x), coordinateRegion(body.y));
  // Index potential emitters even when a fixture temporarily disables its field.
  const sourceKey = !isLooseDebris(body) && GRAVITY_SOURCE_PROFILES[body.type]?.enabled ? key : null;
  if (body.sourceRegionKey !== sourceKey) {
    const previous = state.sourceRegions.get(body.sourceRegionKey);
    previous?.delete(body.id);
    if (previous?.size === 0) state.sourceRegions.delete(body.sourceRegionKey);
    if (sourceKey) {
      if (!state.sourceRegions.has(sourceKey)) state.sourceRegions.set(sourceKey, new Map());
      state.sourceRegions.get(sourceKey).set(body.id, body);
    }
    body.sourceRegionKey = sourceKey;
  }
  if (isLooseDebris(body)) state.debris.set(body.id, body);
  if (body.regionKey === key && state.regions.get(key)?.get(body.id) === body) return;
  if (body.regionKey) {
    const previous = state.regions.get(body.regionKey);
    previous?.delete(body.id);
    if (previous?.size === 0) state.regions.delete(body.regionKey);
  }
  if (!state.regions.has(key)) state.regions.set(key, new Map());
  state.regions.get(key).set(body.id, body);
  body.regionKey = key;
}

function consumeWorldBody(body, state = world) {
  state.consumedIds.add(body.id);
  state.gravitySources.delete(body.id);
  state.backgroundPlanets.delete(body.id);
  state.debris.delete(body.id);
  state.movingBodies.delete(body.id);
  const sourceBucket = state.sourceRegions.get(body.sourceRegionKey);
  sourceBucket?.delete(body.id);
  if (sourceBucket?.size === 0) state.sourceRegions.delete(body.sourceRegionKey);
  const bucket = state.regions.get(body.regionKey);
  bucket?.delete(body.id);
  if (bucket?.size === 0) state.regions.delete(body.regionKey);
}

function worldRegionBounds(centerX, centerY, halfWidth, halfHeight, halo = MAX_PLANET_RADIUS * 1.3 + 8) {
  const rx = coordinateRegion(centerX);
  const ry = coordinateRegion(centerY);
  return {
    minX: Math.max(rx - MAX_REGION_REACH, coordinateRegion(centerX - halfWidth - halo)),
    maxX: Math.min(rx + MAX_REGION_REACH, coordinateRegion(centerX + halfWidth + halo)),
    minY: Math.max(ry - MAX_REGION_REACH, coordinateRegion(centerY - halfHeight - halo)),
    maxY: Math.min(ry + MAX_REGION_REACH, coordinateRegion(centerY + halfHeight + halo))
  };
}

function visitRegionBodies(bounds, visit) {
  for (let y = bounds.minY; y <= bounds.maxY; y++) {
    for (let x = bounds.minX; x <= bounds.maxX; x++) {
      for (const body of world.regions.get(regionKey(x, y))?.values() ?? []) visit(body);
    }
  }
}

function worldDetailHalfExtents() {
  const halfWidth = Math.max(SIMULATION_HALF_WIDTH, player.r * SIMULATION_PLAYER_REACH);
  const halfHeight = Math.max(SIMULATION_HALF_HEIGHT, player.r * SIMULATION_PLAYER_REACH);
  const padding = ACTIVE_MARGIN + (GRAVITY_ENABLED ? GRAVITY_MAX_INFLUENCE + GRAVITY_SOURCE_WARMUP_MARGIN : 0);
  return { x: halfWidth + padding, y: halfHeight + padding };
}

function backgroundCellBounds(halfWidth, halfHeight) {
  const size = PLANET_CELL_REGIONS * REGION_SIZE;
  const cx = Math.floor(player.x / size), cy = Math.floor(player.y / size);
  const reachX = Math.min(MAX_BACKGROUND_CELL_REACH,
    Math.ceil((halfWidth + MAX_PLANET_RADIUS + ACTIVE_MARGIN) / size));
  const reachY = Math.min(MAX_BACKGROUND_CELL_REACH,
    Math.ceil((halfHeight + MAX_PLANET_RADIUS + ACTIVE_MARGIN) / size));
  return { minX: cx - reachX, maxX: cx + reachX, minY: cy - reachY, maxY: cy + reachY };
}

function syncBackgroundPlanets() {
  // Planet cells cover the widest view cheaply. Full local generation later
  // reuses these same objects/IDs; zoom never controls physical activation.
  const lead = hazardScanRadius();
  const bounds = backgroundCellBounds(Math.max(width / (2 * CAMERA_MIN_ZOOM), lead),
    Math.max(height / (2 * CAMERA_MIN_ZOOM), lead));
  const coverageKey = [bounds.minX, bounds.maxX, bounds.minY, bounds.maxY].join(":");
  if (world.backgroundCoverageKey === coverageKey) return;
  for (let y = bounds.minY; y <= bounds.maxY; y++) {
    for (let x = bounds.minX; x <= bounds.maxX; x++) {
      const key = regionKey(x, y);
      if (world.generatedPlanetCells.has(key)) continue;
      world.generatedPlanetCells.set(key, null);
      const description = planetForCell(world.seed, x, y);
      if (!description) continue;
      const rx = coordinateRegion(description.x), ry = coordinateRegion(description.y);
      let body = createGeneratedBody(world.seed, world.stageIndex, rx, ry, description);
      if (!world.consumedIds.has(body.id)) {
        body = world.regions.get(regionKey(rx, ry))?.get(body.id) ?? body;
        world.backgroundPlanets.set(body.id, body);
        world.generatedPlanetCells.set(key, body.id);
        storeWorldBody(world, body);
      }
    }
  }
  world.backgroundCoverageKey = coverageKey;
}

function syncWorldRegions() {
  const halfWidth = Math.max(SIMULATION_HALF_WIDTH, player.r * SIMULATION_PLAYER_REACH);
  const halfHeight = Math.max(SIMULATION_HALF_HEIGHT, player.r * SIMULATION_PLAYER_REACH);
  const detail = worldDetailHalfExtents();
  // Detailed food/fields are prepared in physical space. Distant small bodies
  // fade before this window ends, while large silhouettes use planet cells.
  const coverage = worldRegionBounds(player.x, player.y,
    detail.x, detail.y);
  if (!world.fixture) syncBackgroundPlanets();
  const coverageKey = [coverage.minX, coverage.maxX, coverage.minY, coverage.maxY].join(":");
  if (!world.fixture && coverageKey !== world.coverageKey) {
    for (let y = coverage.minY; y <= coverage.maxY; y++) {
      for (let x = coverage.minX; x <= coverage.maxX; x++) {
        const key = regionKey(x, y);
        if (!world.generatedRegions.has(key)) {
          world.generatedRegions.add(key);
          for (const body of generateRegion(world.seed, x, y, world.stageIndex, world.difficulty)) {
            if (!world.consumedIds.has(body.id) && !world.backgroundPlanets.has(body.id)) storeWorldBody(world, body);
          }
        }
      }
    }
    world.coverageKey = coverageKey;
  }

  const active = [];
  visitRegionBodies(worldRegionBounds(player.x, player.y, halfWidth + ACTIVE_MARGIN, halfHeight + ACTIVE_MARGIN), body => {
    if (bodyIntersectsView(body, player.x, player.y, halfWidth + ACTIVE_MARGIN,
      halfHeight + ACTIVE_MARGIN, body.r * 1.3 + 8)) active.push(body);
  });
  // Keep the immediate interaction pool; ecology supplies a bounded background pool.
  active.sort((a, b) => (Math.hypot(a.x - player.x, a.y - player.y) - a.r) -
    (Math.hypot(b.x - player.x, b.y - player.y) - b.r) || a.id.localeCompare(b.id));
  star_objects = active.slice(0, MAX_ACTIVE_BODIES);
}

function getRenderableBodies() {
  const visible = [];
  const seen = new Set();
  const visit = body => {
    if (!seen.has(body.id) && isBodyVisible(body) && backgroundBodyOpacity(body) > 0) {
      seen.add(body.id);
      const distance = Math.hypot(body.x - player.x, body.y - player.y) - body.r;
      visible.push({ body, distance, near: distance <= player.r + ACTIVE_MARGIN ? 1 : 0 });
    }
  };
  visitRegionBodies(worldRegionBounds(camera.x, camera.y, width / (2 * camera.zoom), height / (2 * camera.zoom)), visit);
  // A recoiling planet can leave its generated cell and the detailed player window.
  for (const body of world.movingBodies.values()) visit(body);
  const cells = backgroundCellBounds(width / (2 * camera.zoom), height / (2 * camera.zoom));
  for (let y = cells.minY; y <= cells.maxY; y++) {
    for (let x = cells.minX; x <= cells.maxX; x++) {
      const body = world.backgroundPlanets.get(world.generatedPlanetCells.get(regionKey(x, y)));
      if (body) visit(body);
    }
  }
  // Prioritize nearby interaction and large silhouettes before distant specks.
  visible.sort((a, b) => b.near - a.near || b.body.r - a.body.r ||
    a.distance - b.distance || a.body.id.localeCompare(b.body.id));
  return visible.slice(0, MAX_RENDER_BODIES).map(entry => entry.body);
}

function backgroundBodyOpacity(body) {
  // Presentation only: keep nearby food and every substantial silhouette.
  const smooth = value => {
    const t = constrain(value, 0, 1);
    return t * t * (3 - 2 * t);
  };
  const highlight = isLooseDebris(body) ? 1 - smooth((runTick -
    (body.highlightUntilTick ?? -DEBRIS_HIGHLIGHT_FADE_TICKS)) / Math.max(1, DEBRIS_HIGHLIGHT_FADE_TICKS)) : 0;
  // Keep intact large silhouettes readable even outside the moving-body pool.
  const activity = !isLooseDebris(body) && body.mass >= FRAGMENTATION_MIN_MASS ? 1 : body.ecologyOpacity ?? 1;
  if (highlight === 1) return activity;
  const size = smooth((body.r * camera.backgroundZoom - BACKGROUND_MIN_SCREEN_RADIUS) /
    (BACKGROUND_FULL_SCREEN_RADIUS - BACKGROUND_MIN_SCREEN_RADIUS));
  const gap = Math.hypot(body.x - player.x, body.y - player.y) - body.r - player.r;
  const proximity = 1 - smooth((gap - BACKGROUND_FOOD_CLEARANCE) / BACKGROUND_FOOD_FADE_DISTANCE);
  if (body.type === "planet") return size + (1 - size) * proximity;
  const detail = worldDetailHalfExtents();
  const edge = Math.max(Math.abs(body.x - player.x) - detail.x, Math.abs(body.y - player.y) - detail.y);
  const coverage = 1 - smooth(1 + edge / BACKGROUND_DETAIL_FADE_DISTANCE);
  const opacity = proximity + (1 - proximity) * size * coverage;
  return (opacity + (1 - opacity) * highlight) * activity;
}
