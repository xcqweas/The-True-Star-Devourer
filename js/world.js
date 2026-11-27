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
  if (rng() > 0.7) return null;
  const size = PLANET_CELL_REGIONS * REGION_SIZE;
  const inset = MAX_PLANET_RADIUS + PLANET_ROUTE_GAP / 2;
  const body = {
    type: "planet",
    x: cx * size + inset + rng() * (size - 2 * inset),
    y: cy * size + inset + rng() * (size - 2 * inset),
    r: 1200 + rng() * (MAX_PLANET_RADIUS - 1200)
  };
  return isOutsideStartingArea(body) ? body : null;
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

function moonForRegion(seed, rx, ry, planets) {
  const rng = seededRandom(hashSeed(seed, "moon", rx, ry));
  if (rng() > 0.24) return null;
  const r = 120 + rng() * (MAX_MOON_RADIUS - 120);
  // Neighboring moons stay inset, leaving a route across region seams.
  const inset = r + LARGE_BODY_CLEARANCE / 2;
  for (let attempt = 0; attempt < PLACEMENT_ATTEMPTS; attempt++) {
    const body = { type: "moon", r,
      x: rx * REGION_SIZE + inset + rng() * (REGION_SIZE - 2 * inset),
      y: ry * REGION_SIZE + inset + rng() * (REGION_SIZE - 2 * inset) };
    if (isOutsideStartingArea(body) && hasClearance(body, planets, LARGE_BODY_CLEARANCE)) return body;
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
  const moons = [];
  for (let y = ry - 1; y <= ry + 1; y++) {
    for (let x = rx - 1; x <= rx + 1; x++) {
      const moon = moonForRegion(seed, x, y, planets);
      if (moon) {
        moons.push(moon);
        if (x === rx && y === ry) bodies.push(moon);
      }
    }
  }
  const rng = seededRandom(hashSeed(seed, "asteroids", rx, ry));
  const factor = difficulty + Math.min(stageIndex * 0.05, 0.25);
  for (let slot = 0; slot < ASTEROIDS_PER_REGION; slot++) {
    // Small objects remain present in every stage and throughout the run.
    const r = Math.min(MAX_ASTEROID_RADIUS, (6 + 48 * rng() ** 2) * factor);
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
  return bodies.map(body => {
    const id = `${seed}:${stageIndex}:${rx},${ry}:${body.type}:${body.slot ?? 0}`;
    const appearanceRng = seededRandom(hashSeed(seed, id));
    const motionRng = seededRandom(hashSeed(seed, id, "motion"));
    const direction = motionRng() * Math.PI * 2;
    // Convert the old asteroid drift speeds to world units/second.
    const speed = body.type === "asteroid" ? (1 + motionRng()) * (25 / body.r) * SIMULATION_FPS : 0;
    return createBody(id, body.type, body.x, body.y, body.r, appearanceRng,
      Math.cos(direction) * speed, Math.sin(direction) * speed);
  });
}

function createWorld(seed, stageIndex, difficulty, fixture = false) {
  const state = {
    seed, stageIndex, difficulty, fixture,
    generatedRegions: new Set(),
    regions: new Map(), // resident position buckets, including dormant objects
    consumedIds: new Set(),
    gravitySources: new Map()
  };
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
  const key = regionKey(coordinateRegion(body.x), coordinateRegion(body.y));
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

function consumeWorldBody(body) {
  world.consumedIds.add(body.id);
  world.gravitySources.delete(body.id);
  const bucket = world.regions.get(body.regionKey);
  bucket?.delete(body.id);
  if (bucket?.size === 0) world.regions.delete(body.regionKey);
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

function syncWorldRegions() {
  const halfWidth = Math.max(SIMULATION_HALF_WIDTH, player.r * SIMULATION_PLAYER_REACH);
  const halfHeight = Math.max(SIMULATION_HALF_HEIGHT, player.r * SIMULATION_PLAYER_REACH);
  // Prewarm the widest supported view, independently of actual zoom or easing.
  // Camera changes therefore cannot change generated layouts or physical updates.
  const coverage = worldRegionBounds(player.x, player.y,
    Math.max(width / (2 * CAMERA_MIN_ZOOM), halfWidth + (GRAVITY_ENABLED ? GRAVITY_MAX_INFLUENCE + GRAVITY_SOURCE_WARMUP_MARGIN : 0)) + ACTIVE_MARGIN,
    Math.max(height / (2 * CAMERA_MIN_ZOOM), halfHeight + (GRAVITY_ENABLED ? GRAVITY_MAX_INFLUENCE + GRAVITY_SOURCE_WARMUP_MARGIN : 0)) + ACTIVE_MARGIN);
  const coverageKey = [coverage.minX, coverage.maxX, coverage.minY, coverage.maxY].join(":");
  if (!world.fixture && coverageKey !== world.coverageKey) {
    for (let y = coverage.minY; y <= coverage.maxY; y++) {
      for (let x = coverage.minX; x <= coverage.maxX; x++) {
        const key = regionKey(x, y);
        if (!world.generatedRegions.has(key)) {
          world.generatedRegions.add(key);
          for (const body of generateRegion(world.seed, x, y, world.stageIndex, world.difficulty)) {
            if (!world.consumedIds.has(body.id)) storeWorldBody(world, body);
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
  // Distant and overflow bodies freeze with full state. Their static appearance
  // can still be drawn at low zoom; rendering never decides what gets simulated.
  active.sort((a, b) => (Math.hypot(a.x - player.x, a.y - player.y) - a.r) -
    (Math.hypot(b.x - player.x, b.y - player.y) - b.r) || a.id.localeCompare(b.id));
  star_objects = active.slice(0, MAX_ACTIVE_BODIES);
}

function getRenderableBodies() {
  const visible = [];
  visitRegionBodies(worldRegionBounds(camera.x, camera.y, width / (2 * camera.zoom), height / (2 * camera.zoom)), body => {
    if (isBodyVisible(body)) {
      const distance = Math.hypot(body.x - player.x, body.y - player.y) - body.r;
      visible.push({ body, distance, near: distance <= player.r + ACTIVE_MARGIN ? 1 : 0 });
    }
  });
  // Prioritize nearby interaction and large silhouettes before distant specks.
  visible.sort((a, b) => b.near - a.near || b.body.r - a.body.r ||
    a.distance - b.distance || a.body.id.localeCompare(b.body.id));
  return visible.slice(0, MAX_RENDER_BODIES).map(entry => entry.body);
}
