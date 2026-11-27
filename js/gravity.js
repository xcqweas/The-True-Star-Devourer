function isGravitySource(body) {
  return GRAVITY_ENABLED && body !== player && body.id !== "player" &&
    body.gravitySource !== false && !!GRAVITY_SOURCE_PROFILES[body.type]?.enabled;
}

function gravityInfluenceRadius(source) {
  const profile = GRAVITY_SOURCE_PROFILES[source.type];
  return profile?.enabled ? Math.min(GRAVITY_MAX_INFLUENCE, source.r + profile.reach) : 0;
}

function isGravityResponder(body) {
  return body === player || (!isGravitySource(body) && body.type === "asteroid" && body.r <= GRAVITY_MAX_RESPONDER_RADIUS);
}

function smoothGravityWeight(value) {
  const t = constrain(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function gravityFromSource(body, source) {
  if (!isGravitySource(source) || body === source) return { ax: 0, ay: 0 };
  const dx = source.x - body.x;
  const dy = source.y - body.y;
  const squared = dx * dx + dy * dy;
  const radius = gravityInfluenceRadius(source);
  if (squared >= radius * radius || squared === 0) return { ax: 0, ay: 0 };
  const distance = Math.sqrt(squared);
  const softening = Math.max(GRAVITY_MIN_SOFTENING, source.r * GRAVITY_SOFTENING_RATIO);
  const fade = 1 - smoothGravityWeight((distance / radius - GRAVITY_FADE_START) / (1 - GRAVITY_FADE_START));
  const profile = GRAVITY_SOURCE_PROFILES[source.type];
  let scale = GRAVITY_G * source.mass * profile.strength * fade / (squared + softening * softening) ** 1.5;
  const acceleration = scale * distance;
  if (acceleration > GRAVITY_MAX_SOURCE_ACCELERATION) scale *= GRAVITY_MAX_SOURCE_ACCELERATION / acceleration;
  return { ax: dx * scale, ay: dy * scale };
}

function gravityAcceleration(body, sources) {
  if (!GRAVITY_ENABLED || !isGravityResponder(body)) return { ax: 0, ay: 0 };
  let ax = 0;
  let ay = 0;
  for (const entry of sources) {
    const source = entry.body ?? entry;
    const force = gravityFromSource(body, source);
    const weight = entry.weight ?? 1;
    ax += force.ax * weight;
    ay += force.ay * weight;
  }
  const acceleration = Math.hypot(ax, ay);
  if (acceleration > GRAVITY_MAX_ACCELERATION) {
    ax *= GRAVITY_MAX_ACCELERATION / acceleration;
    ay *= GRAVITY_MAX_ACCELERATION / acceleration;
  }
  return { ax, ay };
}

function updateGravitySources(initialize = false) {
  if (!GRAVITY_ENABLED) { world.gravitySources.clear(); return []; }
  // Bound the receiver rectangle in physical space, including small active bodies.
  let minX = player.x, maxX = player.x, minY = player.y, maxY = player.y;
  for (const body of star_objects) {
    if (!isGravityResponder(body)) continue;
    minX = Math.min(minX, body.x); maxX = Math.max(maxX, body.x);
    minY = Math.min(minY, body.y); maxY = Math.max(maxY, body.y);
  }
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const hw = (maxX - minX) / 2, hh = (maxY - minY) / 2;
  const padding = GRAVITY_MAX_INFLUENCE + GRAVITY_SOURCE_WARMUP_MARGIN;
  const candidates = [];
  visitRegionBodies(worldRegionBounds(cx, cy, hw + padding, hh + padding, 0), body => {
    if (!isGravitySource(body)) return;
    const influence = gravityInfluenceRadius(body);
    if (!bodyIntersectsView(body, cx, cy, hw, hh, influence + GRAVITY_SOURCE_WARMUP_MARGIN)) return;
    const dx = Math.max(0, Math.abs(body.x - cx) - hw);
    const dy = Math.max(0, Math.abs(body.y - cy) - hh);
    candidates.push({ body, distance: Math.hypot(dx, dy) - influence });
  });
  candidates.sort((a, b) => a.distance - b.distance || a.body.id.localeCompare(b.body.id));
  const selected = candidates.slice(0, GRAVITY_MAX_SOURCES);
  const selectedIds = new Set(selected.map(entry => entry.body.id));
  const cache = world.gravitySources;
  const step = SIMULATION_STEP_SECONDS / GRAVITY_SOURCE_FADE_SECONDS;
  for (const [id, entry] of cache) {
    if (world.consumedIds.has(id)) { cache.delete(id); continue; }
    entry.activation = constrain(entry.activation + (selectedIds.has(id) ? step : -step), 0, 1);
    if (entry.activation === 0 && !selectedIds.has(id)) cache.delete(id);
  }
  for (const { body } of selected) {
    if (!cache.has(body.id) && cache.size < GRAVITY_MAX_SOURCES * 2) {
      cache.set(body.id, { body, activation: initialize ? 1 : Math.min(1, step) });
    }
  }
  // Budget changes also fade, rather than abruptly dropping an overlapping field.
  return [...cache.values()].map(entry => ({ body: entry.body, weight: smoothGravityWeight(entry.activation) }));
}

function accumulateBodyForces(body, sources) {
  const gravity = gravityAcceleration(body, sources);
  body.gravityAx = gravity.ax;
  body.gravityAy = gravity.ay;
  body.ax = gravity.ax;
  body.ay = gravity.ay;
  if (!isGravityResponder(body) || body === player) return;
  const nextVx = body.vx + body.ax * SIMULATION_STEP_SECONDS;
  const nextVy = body.vy + body.ay * SIMULATION_STEP_SECONDS;
  const nextSpeed = Math.hypot(nextVx, nextVy);
  // Do not snap an existing prescribed/test velocity down to the gravity limit.
  const limit = Math.max(GRAVITY_SMALL_BODY_MAX_SPEED, Math.hypot(body.vx, body.vy));
  if (nextSpeed > limit) {
    body.ax = (nextVx * limit / nextSpeed - body.vx) / SIMULATION_STEP_SECONDS;
    body.ay = (nextVy * limit / nextSpeed - body.vy) / SIMULATION_STEP_SECONDS;
  }
}

function integrateBody(body) {
  body.vx += body.ax * SIMULATION_STEP_SECONDS;
  body.vy += body.ay * SIMULATION_STEP_SECONDS;
  if (body === player) {
    body.gravityVx += body.driftAx * SIMULATION_STEP_SECONDS;
    body.gravityVy += body.driftAy * SIMULATION_STEP_SECONDS;
  }
  body.x += body.vx * SIMULATION_STEP_SECONDS;
  body.y += body.vy * SIMULATION_STEP_SECONDS;
  body.angle += body.rotationSpeed * SIMULATION_STEP_SECONDS;
  if (body !== player) storeWorldBody(world, body);
}
