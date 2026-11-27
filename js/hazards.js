function getHudBounds() {
  const compact = width < 460 || height < 300;
  const short = height < 260;
  return { x: 8, y: 8, w: Math.max(0, Math.min(compact ? 240 : 320, width - 16)),
    h: short ? 66 : compact ? 104 : 136, compact, short };
}

function hazardScanRadius() {
  const limits = playerMovementLimits();
  const speed = limits.speed + PLAYER_MAX_DRIFT_SPEED;
  // Preserve the reaction allowance when grown drive covers more world space.
  return Math.max(HAZARD_SCAN_RADIUS, speed * HAZARD_ASSIST_REACTION_SECONDS +
    speed * speed / (2 * HAZARD_WARNING_DECELERATION * limits.scale) +
    MAX_PLANET_RADIUS * (1 + HAZARD_RADIUS_PADDING) + player.r +
    HAZARD_BASE_CLEARANCE + HAZARD_GRAVITY_PADDING);
}

function hazardMetrics(body) {
  if (body === player || isLooseDebris(body) || !["moon", "planet"].includes(body.type) ||
      ["eat", "collect"].includes(collisionDisposition(player, body))) return null;
  const dx = body.x - player.x, dy = body.y - player.y;
  const distance = Math.hypot(dx, dy);
  const ux = distance === 0 ? 0 : dx / distance;
  const uy = distance === 0 ? -1 : dy / distance;
  const vx = player.vx - body.vx, vy = player.vy - body.vy;
  const closingSpeed = Math.max(0, vx * ux + vy * uy);
  const surfaceGap = distance - body.r - player.r;
  const lead = isThreatAssistEnabled() ? HAZARD_ASSIST_REACTION_SECONDS : HAZARD_REACTION_SECONDS;
  const clearance = HAZARD_BASE_CLEARANCE + body.r * HAZARD_RADIUS_PADDING;
  const force = gravityFromSource(player, body);
  const inwardPull = Math.max(0, force.ax * ux + force.ay * uy);
  const pullMargin = Math.min(HAZARD_GRAVITY_PADDING, 0.5 * inwardPull * lead * lead);
  const brakingDistance = closingSpeed * closingSpeed /
    (2 * HAZARD_WARNING_DECELERATION * playerMovementLimits().scale);
  const warningDistance = clearance + closingSpeed * lead + brakingDistance + pullMargin;
  const squaredSpeed = vx * vx + vy * vy;
  const closestTime = squaredSpeed === 0 ? 0 : Math.max(0, (dx * vx + dy * vy) / squaredSpeed);
  const closestGap = Math.hypot(dx - vx * closestTime, dy - vy * closestTime) - body.r - player.r;
  const collisionCourse = closingSpeed >= HAZARD_MIN_CLOSING_SPEED && closestGap < clearance + pullMargin;
  const beingPulled = inwardPull >= PULL_CUE_THRESHOLD && surfaceGap < clearance + pullMargin;
  if (surfaceGap > warningDistance || (surfaceGap > clearance && !collisionCourse && !beingPulled)) return null;
  return { id: body.id, type: body.type, body, ux, uy, surfaceGap, closingSpeed,
    warningDistance, brakingDistance, timeToSurface: closingSpeed > 0 ? Math.max(0, surfaceGap) / closingSpeed : Infinity,
    priority: surfaceGap < clearance ? 0 : 1 };
}

function collectHazardWarnings() {
  const warnings = [];
  const seen = new Set();
  const visit = body => {
    // Query resident objects, not just visible or locally simulated centers.
    if (seen.has(body.id) || (body.type !== "moon" && body.type !== "planet")) return;
    seen.add(body.id);
    if (bodyIntersectsView(body, camera.x, camera.y, width / (2 * camera.zoom),
        height / (2 * camera.zoom), body.r)) return;
    const warning = hazardMetrics(body);
    if (warning) warnings.push(warning);
  };
  const scan = hazardScanRadius();
  visitRegionBodies(worldRegionBounds(player.x, player.y, scan, scan, 0), visit);
  for (const body of world.movingBodies.values()) visit(body);
  // Fast grown approaches can exceed the detailed region window. Reuse the
  // bounded planet index rather than generating distant food for warning queries.
  const bounds = backgroundCellBounds(scan, scan);
  for (let y = bounds.minY; y <= bounds.maxY; y++) {
    for (let x = bounds.minX; x <= bounds.maxX; x++) {
      const body = world.backgroundPlanets.get(world.generatedPlanetCells.get(regionKey(x, y)));
      if (body) visit(body);
    }
  }
  warnings.sort((a, b) => a.priority - b.priority || a.timeToSurface - b.timeToSurface ||
    a.surfaceGap - b.surfaceGap || a.id.localeCompare(b.id));
  return warnings;
}

function rectanglesOverlap(a, b, padding = 5) {
  return a.x < b.x + b.w + padding && a.x + a.w + padding > b.x &&
    a.y < b.y + b.h + padding && a.y + a.h + padding > b.y;
}

function indicatorObstacles() {
  const obstacles = [getHudBounds()];
  if (gameplayNotification()) {
    const w = Math.min(280, width - 16);
    obstacles.push({ x: width / 2 - w / 2, y: height * 0.8 - 16, w, h: 32 });
  }
  return obstacles;
}

function indicatorAtAngle(angle, withLabel) {
  const margin = Math.min(HAZARD_EDGE_MARGIN, width * 0.12, height * 0.12);
  const ux = Math.cos(angle), uy = Math.sin(angle);
  const rayX = Math.abs(ux) < 1e-9 ? Infinity : (width / 2 - margin) / Math.abs(ux);
  const rayY = Math.abs(uy) < 1e-9 ? Infinity : (height / 2 - margin) / Math.abs(uy);
  const ray = Math.max(0, Math.min(rayX, rayY));
  const x = width / 2 + ux * ray, y = height / 2 + uy * ray;
  const arrow = { x: x - 9, y: y - 9, w: 18, h: 18 };
  let label = null;
  if (withLabel) {
    const w = 132, h = 32;
    // Separate on at least one axis, including diagonal bearings near corners.
    const inward = Math.min((w / 2 + 18) / Math.max(Math.abs(ux), 1e-9),
      (h / 2 + 18) / Math.max(Math.abs(uy), 1e-9));
    label = { x: constrain(x - ux * inward - w / 2, 10, width - w - 10),
      y: constrain(y - uy * inward - h / 2, 10, height - h - 10), w, h };
  }
  return { x, y, arrow, label };
}

function layoutHazardIndicators(warnings) {
  if (width < 100 || height < 90) return [];
  const compact = width < 420 || height < 260;
  const maximum = compact ? 1 : Math.min(HAZARD_MAX_INDICATORS, isThreatAssistEnabled() ? 3 : 2);
  const obstacles = indicatorObstacles();
  const placed = [];
  for (const warning of warnings) {
    if (placed.length >= maximum) break;
    const angle = Math.atan2(warning.uy, warning.ux);
    if (placed.some(item => Math.abs(Math.atan2(Math.sin(item.angle - angle), Math.cos(item.angle - angle))) < 0.26)) continue;
    let chosen = null;
    // Keep the arrow when a label cannot fit beside the HUD on a narrow view.
    for (const withLabel of compact ? [false] : [true, false]) {
      const offsets = [0, 0.16, -0.16, 0.32, -0.32, 0.5, -0.5, 0.8, -0.8, 1.1, -1.1];
      if (!withLabel) offsets.push(1.35, -1.35, 1.6, -1.6);
      for (const offset of offsets) {
        const position = indicatorAtAngle(angle + offset, withLabel);
        const boxes = [position.arrow, position.label].filter(Boolean);
        if (boxes.some(box => obstacles.some(obstacle => rectanglesOverlap(box, obstacle)))) continue;
        chosen = { ...warning, ...position, angle };
        obstacles.push(...boxes);
        break;
      }
      if (chosen) break;
    }
    if (chosen) placed.push(chosen);
  }
  return placed;
}

function getPullCue(obstacles) {
  const magnitude = Math.hypot(player.gravityAx, player.gravityAy);
  if (magnitude < PULL_CUE_THRESHOLD || width < 100 || height < 90) return null;
  const ux = player.gravityAx / magnitude, uy = player.gravityAy / magnitude;
  const maxRadius = Math.max(20, Math.min(width, height) * 0.3);
  const radius = Math.min(maxRadius, Math.max(54, player.r * camera.zoom + 34));
  const angle = Math.atan2(uy, ux);
  // On short viewports the HUD can occupy the pull-facing side. Shift the cue
  // around the inner compass while keeping the arrow's direction truthful.
  for (const offset of [0, 0.65, -0.65, 1.2, -1.2, 1.85, -1.85]) {
    const x = width / 2 + Math.cos(angle + offset) * radius;
    const y = height / 2 + Math.sin(angle + offset) * radius;
    const box = { x: x - 13, y: y - 13, w: 26, h: 26 };
    if (obstacles.some(obstacle => rectanglesOverlap(box, obstacle))) continue;
    const label = width >= 420 && height >= 260 ? { x: x - 37, y: y + 14, w: 74, h: 18 } : null;
    const showLabel = label && label.x >= 0 && label.y >= 0 &&
      label.x + label.w <= width && label.y + label.h <= height &&
      !obstacles.some(obstacle => rectanglesOverlap(label, obstacle));
    return { x, y, angle, magnitude, box, label: showLabel ? label : null,
      opacity: constrain((magnitude - PULL_CUE_THRESHOLD) / 180, 0.2, 0.8) };
  }
  return null;
}

function drawHazardIndicators() {
  const warnings = layoutHazardIndicators(collectHazardWarnings());
  const obstacles = indicatorObstacles();
  push();
  rectMode(CORNER);
  textAlign(CENTER, CENTER);
  for (const warning of warnings) {
    push();
    translate(warning.x, warning.y);
    rotate(warning.angle);
    noStroke(); fill(255, 112, 110);
    triangle(8, 0, -5, -5, -5, 5);
    pop();
    obstacles.push(warning.arrow);
    if (!warning.label) continue;
    const box = warning.label;
    obstacles.push(box);
    noStroke(); fill(10, 14, 23, 225); rect(box.x, box.y, box.w, box.h, 5);
    fill(255, 150, 145); textSize(12);
    text((canFragmentTogether(player, warning.body) ? "IMPACT" : "DANGER") + " · " +
      (warning.type === "planet" ? "Planet" : "Moon"), box.x + box.w / 2, box.y + 9);
    fill(235); textSize(11);
    const detail = warning.closingSpeed >= HAZARD_MIN_CLOSING_SPEED ?
      "Closing · ~" + Math.min(99, warning.timeToSurface).toFixed(1) + "s" : "Nearby surface";
    text(detail, box.x + box.w / 2, box.y + 23);
  }
  const pull = getPullCue(obstacles);
  if (pull) {
    push(); translate(pull.x, pull.y); rotate(pull.angle);
    noFill(); stroke(115, 210, 240, pull.opacity * 255); strokeWeight(1.5);
    line(-10, 0, 8, 0); line(8, 0, 1, -5); line(8, 0, 1, 5);
    pop();
    if (pull.label) {
      const box = pull.label;
      noStroke(); fill(10, 14, 23, 210); rect(box.x, box.y, box.w, box.h, 4);
      fill(145, 220, 240); textSize(11);
      text(pull.magnitude >= 180 ? "Strong pull" : "Pull", box.x + box.w / 2, box.y + box.h / 2);
    }
  }
  pop();
}
