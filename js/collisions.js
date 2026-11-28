function isLooseDebris(body) { return body.kind === "debris"; }

function fragmentationPieceCount() { return Math.max(2, Math.floor(FRAGMENTATION_PIECES)); }

function absorptionPair(a, b) {
  const collector = a.mass > b.mass ? a : b, consumed = collector === a ? b : a;
  const ratio = collector.mass / consumed.mass;
  // Radius -> mass round trips must not turn nominally equal bodies into meals.
  const tolerance = Number.EPSILON * 8 * ratio;
  if (ratio - Math.max(1, ABSORPTION_MIN_MASS_RATIO) <= tolerance) return null;
  // Planet emitters keep their raid resistance. Use the stored source profile,
  // not the gravity enable switch or the player's cosmetic evolution milestone.
  // The same body-property policy applies to every pair, including ambient pairs.
  const planetary = [a, b].some(body => isPlanetaryBody(body) && body.gravitySource !== false);
  const requiredRatio = planetary ? ABSORPTION_LARGE_MASS_RATIO : ABSORPTION_MOON_MASS_RATIO;
  if (a.mass >= FRAGMENTATION_MIN_MASS && b.mass >= FRAGMENTATION_MIN_MASS &&
      ratio + tolerance < requiredRatio) return null;
  return { collector, consumed };
}

function canFragmentTogether(a, b) {
  return !isLooseDebris(a) && !isLooseDebris(b) &&
    a.mass >= FRAGMENTATION_MIN_MASS && b.mass >= FRAGMENTATION_MIN_MASS && !absorptionPair(a, b);
}

function collisionDisposition(actor, other) {
  if (isLooseDebris(other)) return "collect";
  const absorption = absorptionPair(actor, other);
  if (absorption) return absorption.collector === actor ? "eat" : "fatal";
  if (canFragmentTogether(actor, other)) return "fragment";
  return "separate";
}

// The geometry and resolution accept any player or ambient body pair.
function sweptBodyContact(a, startA, b, startB) {
  const sx = startA.x - startB.x, sy = startA.y - startB.y;
  const dx = (a.x - startA.x) - (b.x - startB.x);
  const dy = (a.y - startA.y) - (b.y - startB.y);
  const radius = a.r + b.r;
  const c = sx * sx + sy * sy - radius * radius;
  let time = 0;
  if (c >= 0) {
    const length = dx * dx + dy * dy;
    const approach = sx * dx + sy * dy;
    const discriminant = approach * approach - length * c;
    if (length === 0 || approach >= 0 || discriminant <= 0) return null;
    time = (-approach - Math.sqrt(discriminant)) / length;
    if (time < 0 || time >= 1) return null;
  }
  const ax = startA.x + (a.x - startA.x) * time;
  const ay = startA.y + (a.y - startA.y) * time;
  const bx = startB.x + (b.x - startB.x) * time;
  const by = startB.y + (b.y - startB.y) * time;
  let nx = ax - bx, ny = ay - by;
  let length = Math.hypot(nx, ny);
  if (length < 1e-9) {
    nx = b.vx - a.vx; ny = b.vy - a.vy;
    length = Math.hypot(nx, ny);
    if (length < 1e-9) { nx = 1; ny = 0; length = 1; }
  }
  nx /= length; ny /= length;
  return { time, ax, ay, bx, by, nx, ny,
    speed: Math.max(0, -(a.vx - b.vx) * nx - (a.vy - b.vy) * ny) };
}

function impactMassLoss(a, b, normalSpeed) {
  const speedScale = Math.max(1, a.impactSpeedScale ?? 1, b.impactSpeedScale ?? 1);
  const strength = constrain(normalSpeed / (FRAGMENTATION_REFERENCE_SPEED * speedScale), 0, 1);
  const comparableLoss = (FRAGMENTATION_BASE_LOSS + FRAGMENTATION_IMPACT_LOSS * strength) *
    (1 + FRAGMENTATION_COMPARABLE_BONUS) * 0.5 ** FRAGMENTATION_MASS_BIAS;
  const count = fragmentationPieceCount();
  const maximum = Math.min(FRAGMENTATION_MAX_LOSS, count / (count + 1) * (1 - 1e-9));
  // Each participant retains its own mass independently. The other/self ratio
  // raises the smaller body's loss as disparity grows, rather than reducing a
  // shared comparable-pair severity. Available-piece caps still preserve cores.
  const fraction = (self, other) => comparableLoss * (other.mass / self.mass) ** FRAGMENTATION_MASS_BIAS *
    (MASSIVE_PLANET_BRANCHES[self.type]?.impactLossScale ?? 1);
  return { a: constrain(fraction(a, b), 0, maximum), b: constrain(fraction(b, a), 0, maximum), strength };
}

function contactPairKey(a, b) { return JSON.stringify([a.id, b.id].sort()); }

function updateCollisionContacts(state = world, tick = runTick) {
  for (const [key, contact] of state.contacts) {
    if (state.consumedIds.has(contact.a.id) || state.consumedIds.has(contact.b.id) ||
        (tick >= contact.rearmTick && Math.hypot(contact.a.x - contact.b.x, contact.a.y - contact.b.y) >
          contact.a.r + contact.b.r + FRAGMENTATION_RELEASE_GAP)) state.contacts.delete(key);
  }
}

function hasImpactGrace(body, tick = runTick) { return tick < (body.impactGraceUntilTick ?? 0); }

function separateImpactBodies(a, b, nx, ny) {
  const distance = Math.hypot(a.x - b.x, a.y - b.y);
  const correction = Math.max(0, a.r + b.r + FRAGMENTATION_SEPARATION - distance);
  const shareA = b.mass / (a.mass + b.mass), shareB = 1 - shareA;
  a.x += nx * correction * shareA; a.y += ny * correction * shareA;
  b.x -= nx * correction * shareB; b.y -= ny * correction * shareB;
}

function impactVelocity(body, vx, vy) {
  if (Number.isFinite(body.gravityVx)) {
    // Start recovery with drift and a neutral drive component, then let normal
    // steering respond immediately. Ownership/control never switches to ejecta.
    const speed = Math.hypot(vx, vy);
    const scale = speed > PLAYER_MAX_DRIFT_SPEED ? PLAYER_MAX_DRIFT_SPEED / speed : 1;
    body.gravityVx = vx *= scale; body.gravityVy = vy *= scale;
    body.driftAx = body.driftAy = 0;
  }
  body.vx = vx; body.vy = vy; body.ax = body.ay = 0;
}

function ejectImpactBodies(a, b, nx, ny) {
  const closing = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
  const impulse = Math.max(0, Math.max(FRAGMENTATION_ESCAPE_SPEED,
    -closing * FRAGMENTATION_RESTITUTION) - closing);
  const shareA = b.mass / (a.mass + b.mass), shareB = 1 - shareA;
  impactVelocity(a, a.vx + nx * impulse * shareA, a.vy + ny * impulse * shareA);
  impactVelocity(b, b.vx - nx * impulse * shareB, b.vy - ny * impulse * shareB);
}

function placeImpactDebris(piece, point, nx, ny, angle, occupied) {
  const ux = nx * Math.cos(angle) - ny * Math.sin(angle);
  const uy = ny * Math.cos(angle) + nx * Math.sin(angle);
  let distance = piece.r + DEBRIS_SPACING;
  for (let attempt = 0; attempt < PLACEMENT_ATTEMPTS; attempt++) {
    piece.x = point.x + ux * distance; piece.y = point.y + uy * distance;
    if (occupied.every(body => Math.hypot(piece.x - body.x, piece.y - body.y) >= piece.r + body.r + DEBRIS_SPACING)) return;
    distance += piece.r * 2 + DEBRIS_SPACING;
  }
  // Guaranteed finite fallback outside every occupied circle along the surface normal.
  distance = Math.max(...occupied.map(body => (body.x - point.x) * nx +
    (body.y - point.y) * ny + body.r + piece.r + DEBRIS_SPACING));
  piece.x = point.x + nx * distance; piece.y = point.y + ny * distance;
}

function resolveBodyImpact(a, b, contact, state = world, tick = runTick) {
  if(state.ecologyStats.tick!==tick){state.ecologyStats.impacts=0;state.ecologyStats.tick=tick;}
  if (a === b || state.consumedIds.has(a.id) || state.consumedIds.has(b.id)) return { kind: "ignored" };
  if (isLooseDebris(a) || isLooseDebris(b)) {
    if (isLooseDebris(a) && isLooseDebris(b)) return { kind: "ignored" };
    const debris = isLooseDebris(a) ? a : b, collector = debris === a ? b : a;
    if (!canCollectDebris(collector, debris, tick)) {
      if (contact) resolveSurfaceContact(a, b, contact, state);
      return { kind: "ignored" };
    }
    const mass = debris.mass;
    setBodyMass(collector, collector.mass + mass); // full transfer at every difficulty
    consumeWorldBody(debris, state);
    if (collector.id !== "player") storeWorldBody(state, collector);
    return { kind: "collected", collector, debris, mass };
  }
  contact ??= sweptBodyContact(a, a, b, b);
  if (!contact) return { kind: "ignored" };
  const key = contactPairKey(a, b);
  if (state.contacts.has(key) || hasImpactGrace(a, tick) || hasImpactGrace(b, tick)) {
    resolveSurfaceContact(a, b, contact, state);
    for (const body of [a, b]) if (body.id !== "player") storeWorldBody(state, body);
    return { kind: "protected" };
  }
  const absorption = absorptionPair(a, b);
  if (absorption) {
    const { collector, consumed } = absorption, mass = consumed.mass;
    absorbBodyMass(consumed, collector);
    consumeWorldBody(consumed, state);
    // Unlike ambient bodies, the player is held outside the region store.
    if (consumed.id === "player") setBodyMass(consumed, 0);
    if (collector.id !== "player") storeWorldBody(state, collector);
    return { kind: "absorbed", collector, consumed, mass };
  }
  if (!canFragmentTogether(a, b)) {
    if (contact) resolveSurfaceContact(a, b, contact, state);
    return { kind: "separated" };
  }

  const capacity = Math.min(fragmentationPieceCount(), Math.floor((MAX_WORLD_DEBRIS - state.debris.size) / 2));
  if (capacity < 1 || (state.ecologyStats.impacts ?? 0) >= ECOLOGY_MAX_IMPACTS_PER_TICK) {
    resolveSurfaceContact(a, b, contact, state);
    return { kind: "protected", budgetLimited: true };
  }

  const losses = impactMassLoss(a, b, contact.speed);
  const fractionCap = capacity / (capacity + 1) * (1 - 1e-9);
  losses.a = Math.min(losses.a, fractionCap); losses.b = Math.min(losses.b, fractionCap);
  const before = [a.mass, b.mass];
  // Capture the touching surfaces before shrinking/separating the surviving cores.
  const point = { x: (contact.ax - contact.nx * a.r + contact.bx + contact.nx * b.r) / 2,
    y: (contact.ay - contact.ny * a.r + contact.by + contact.ny * b.r) / 2 };
  a.x = contact.ax; a.y = contact.ay; b.x = contact.bx; b.y = contact.by;
  setBodyMass(a, before[0] * (1 - losses.a));
  setBodyMass(b, before[1] * (1 - losses.b));
  a.hasFragmented = b.hasFragmented = true;
  separateImpactBodies(a, b, contact.nx, contact.ny);
  ejectImpactBodies(a, b, contact.nx, contact.ny);
  state.contacts.set(key, { a, b, rearmTick: tick + FRAGMENTATION_REARM_TICKS });
  a.impactGraceUntilTick = b.impactGraceUntilTick = tick + FRAGMENTATION_GRACE_TICKS;
  const event = { kind: "fragmented", id: state.nextImpactId++, tick,
    a, b, lossA: before[0] - a.mass, lossB: before[1] - b.mass,
    strength: losses.strength, position: point, debris: [] };
  state.ecologyStats.impacts = (state.ecologyStats.impacts ?? 0) + 1;
  // Lateral ejecta around the actual impact site, on the larger core's near face.
  // Absolute velocity and player identity do not choose which side gets material.
  const side = before[0] <= before[1] ? 1 : -1;
  const nx = contact.nx * side, ny = contact.ny * side;
  const occupied = [a, b, ...(state.contactBodies ?? []).filter(body => body !== a && body !== b && !isLooseDebris(body) &&
    bodyIntersectsView(body,point.x,point.y,REGION_SIZE*2,REGION_SIZE*2))];
  const count = capacity;
  for (const [parent, lostMass] of [[a, event.lossA], [b, event.lossB]]) {
    if (lostMass <= 0) continue;
    let remaining = lostMass;
    for (let i = 0; i < count; i++) {
      const mass = i === count - 1 ? remaining : lostMass / count;
      remaining -= mass;
      const id = `${state.seed}:impact:${event.id}:${parent.id}:${i}`;
      const piece = createBody(id, "debris", 0, 0, radiusForMass(mass), seededRandom(hashSeed(state.seed, id)));
      piece.kind = "debris"; piece.originId = parent.originId; piece.ownerId = parent.ownerId;
      piece.parentId = parent.id; piece.gravitySource = false;
      piece.collectAfterTick = tick + DEBRIS_COLLECTION_DELAY_TICKS;
      piece.bornAtTick = tick;
      piece.publicAfterTick = tick + DEBRIS_PUBLIC_COLLECTION_TICKS;
      piece.reclaimAfterTick = tick + DEBRIS_RECLAIM_TICKS;
      piece.gravityAfterTick = tick + DEBRIS_GRAVITY_DELAY_TICKS;
      piece.highlightUntilTick = tick + DEBRIS_HIGHLIGHT_TICKS;
      setBodyMass(piece, mass);
      const index = event.debris.length;
      const lobe = index % 2 ? -1 : 1;
      const spread = Math.floor(index / 2) / Math.max(1, count - 1);
      const angle = lobe * (Math.PI / 2 - DEBRIS_FAN_ANGLE / 4 + spread * DEBRIS_FAN_ANGLE / 8);
      placeImpactDebris(piece, point, nx, ny, angle, occupied);
      const direction = Math.atan2(piece.y - point.y, piece.x - point.x);
      piece.vx = Math.cos(direction) * DEBRIS_EJECTION_SPEED;
      piece.vy = Math.sin(direction) * DEBRIS_EJECTION_SPEED;
      occupied.push(piece); event.debris.push(piece); storeWorldBody(state, piece);
    }
  }
  for (const body of [a, b]) if (body.id !== "player") storeWorldBody(state, body);
  return event;
}
