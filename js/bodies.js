function makeAsteroidShape(radius, pointCount, roughness, rng = Math.random) {
  let points = [];
  for (let i = 0; i < pointCount; i++) {
    let angle = map(i, 0, pointCount, 0, TWO_PI);
    let localRadius = radius * (1 - roughness + rng() * roughness * 2);
    points.push({
      x: cos(angle) * localRadius,
      y: sin(angle) * localRadius
    });
  }
  return points;
}

function drawAsteroidBody(body, baseColor, detailColor) {
  let shapeScale = body.r / (body.shapeRadius || body.r);
  let smoothness = constrain(map(body.r, 20, 140, 0, 0.85), 0, 0.85);
  push();
  translate(body.x, body.y);
  rotate(body.angle);
  noStroke();
  fill(baseColor);
  beginShape();

  for (let point of body.shape) {
    let scaledX = point.x * shapeScale;
    let scaledY = point.y * shapeScale;
    let pointRadius = dist(0, 0, scaledX, scaledY);
    let circleX = pointRadius === 0 ? 0 : (scaledX / pointRadius) * body.r;
    let circleY = pointRadius === 0 ? 0 : (scaledY / pointRadius) * body.r;
    vertex(lerp(scaledX, circleX, smoothness), lerp(scaledY, circleY, smoothness));
  }
  endShape(CLOSE);

  fill(detailColor);
  circle(-body.r * 0.2, -body.r * 0.1, body.r * 0.45);
  circle(body.r * 0.25, body.r * 0.15, body.r * 0.28);
  pop();
}

function drawRockyMoonBody(body, baseColor, detailColor) {
  let shapeScale = body.r / (body.shapeRadius || body.r);
  push();
  translate(body.x, body.y);
  rotate(body.angle);
  noStroke();

  // Very circular silhouette with subtle irregularity from the stored shape.
  fill(baseColor);
  beginShape();
  for (let point of body.shape) {
    let scaledX = point.x * shapeScale;
    let scaledY = point.y * shapeScale;
    let pointRadius = dist(0, 0, scaledX, scaledY);
    let circleX = pointRadius === 0 ? 0 : (scaledX / pointRadius) * body.r;
    let circleY = pointRadius === 0 ? 0 : (scaledY / pointRadius) * body.r;
    vertex(lerp(scaledX, circleX, 0.95), lerp(scaledY, circleY, 0.95));
  }
  endShape(CLOSE);

  // Moon-like crater details.
  fill(detailColor);
  circle(-body.r * 0.22, -body.r * 0.12, body.r * 0.42);
  circle(body.r * 0.18, body.r * 0.2, body.r * 0.3);
  circle(body.r * 0.05, -body.r * 0.28, body.r * 0.2);
  pop();
}

function makeShapeForType(type, radius, rng) {
  if (type === "moon") return makeAsteroidShape(radius, 24, 0.08, rng);
  if (type === "planet" || MASSIVE_PLANET_BRANCHES[type] || type === "debris") return [];
  return makeAsteroidShape(radius, 9 + Math.floor(rng() * 5), 0.28, rng);
}

function createBody(id, type, x, y, r, rng, vx = 0, vy = 0) {
  return {
    id, type, x, y, r, vx, vy,
    kind: type === "debris" ? "debris" : "intact", originId: id, ownerId: id === "player" ? "player" : null,
    impactSpeedScale: 1, // controllers can calibrate impacts to their movement scale
    mass: massForRadius(r / bodyRadiusScale(type)),
    ax: 0, ay: 0, gravityAx: 0, gravityAy: 0,
    gravitySource: id !== "player" && !!GRAVITY_SOURCE_PROFILES[type]?.enabled,
    angle: rng() * Math.PI * 2,
    rotationSpeed: (rng() * 2 - 1) * (isPlanetaryBody({ type }) ? 0.015 : 30 / r),
    variant: Math.floor(rng() * 3),
    shapeRadius: r,
    shape: makeShapeForType(type, r, rng)
  };
}

function drawPlanetBody(body, baseColor, detailColor) {
  push();
  translate(body.x, body.y);
  rotate(body.angle);
  noStroke();
  fill(baseColor);
  circle(0, 0, body.r * 2);
  fill(detailColor);
  ellipse(-body.r * 0.25, -body.r * 0.2, body.r * 0.8, body.r * 0.4);
  ellipse(body.r * 0.3, body.r * 0.3, body.r * 0.55, body.r * 0.7);
  circle(body.r * 0.25, -body.r * 0.4, body.r * 0.3);
  pop();
}

function drawBody(body, isPlayer = false, detailed = true) {
  const { base: baseColor, detail: detailColor } = getBodyPalette(body, isPlayer);
  if (isLooseDebris(body)) {
    drawDebrisBody(body, baseColor, detailColor, detailed);
  } else if (!detailed) {
    // A display-only LOD. No radius, shape, mass, identity, or motion is modified.
    push();
    fill(baseColor);
    noStroke();
    if (!isPlayer) {
      stroke(...getThreatVisual(body.r, player.r, body).ring);
      strokeWeight(0.8 / camera.zoom);
    }
    circle(body.x, body.y, Math.max(body.r * 2, 2.5 / camera.zoom));
    pop();
  } else if (MASSIVE_PLANET_BRANCHES[body.type]) {
    drawMassivePlanetBody(body, baseColor, detailColor);
  } else if (body.type === "planet") {
    drawPlanetBody(body, baseColor, detailColor);
  } else if (body.type === "moon") {
    drawRockyMoonBody(body, baseColor, detailColor);
  } else {
    drawAsteroidBody(body, baseColor, detailColor);
  }
  if (!isPlayer && detailed && !isLooseDebris(body)) {
    // A thin, fixed-pixel rim communicates relative physical size at every form.
    // Easy modes add the existing larger glow and pulsing ring.
    push(); noFill();
    stroke(...getThreatVisual(body.r, player.r, body).ring);
    strokeWeight(1 / camera.zoom);
    circle(body.x, body.y, body.r * 2);
    pop();
  }
}

function drawMassivePlanetBody(body, baseColor, detailColor) {
  push(); translate(body.x, body.y); rotate(body.angle);
  noStroke(); fill(baseColor); circle(0, 0, body.r * 2);
  fill(detailColor);
  if (body.type === "gasGiant") {
    // Bands stay inside the physical atmosphere; the storm reads at player scale.
    for (const y of [-0.65, -0.3, 0.12, 0.55]) {
      const halfWidth = Math.sqrt(1 - (Math.abs(y) + 0.09) ** 2);
      ellipse(0, body.r * y, body.r * halfWidth * 2, body.r * 0.18);
    }
    fill(180, 89, 64); ellipse(body.r * 0.3, body.r * 0.12, body.r * 0.45, body.r * 0.22);
    fill(246, 204, 145); ellipse(body.r * 0.3, body.r * 0.12, body.r * 0.2, body.r * 0.09);
  } else {
    circle(-body.r * 0.3, -body.r * 0.2, body.r * 0.65);
    circle(body.r * 0.25, body.r * 0.3, body.r * 0.4);
    stroke(246, 174, 94); strokeWeight(body.r * 0.055);
    line(-body.r * 0.6, body.r * 0.4, -body.r * 0.1, body.r * 0.1);
    line(-body.r * 0.1, body.r * 0.1, body.r * 0.15, -body.r * 0.6);
  }
  pop();
}

function drawDebrisBody(body, baseColor, detailColor, detailed) {
  // Angular gold shards at every mass/LOD, never a moon/planet silhouette.
  const r = Math.max(debrisRenderRadius(body), 2 / camera.zoom);
  push(); translate(body.x, body.y); rotate(body.angle);
  fill(baseColor); stroke(...getThreatVisual(body.r, player.r).ring); strokeWeight(1 / camera.zoom);
  beginShape();
  vertex(-r, -r * 0.35); vertex(r * 0.15, -r);
  vertex(r, -r * 0.1); vertex(r * 0.4, r * 0.8); vertex(-r * 0.65, r * 0.55);
  endShape(CLOSE);
  if (detailed) {
    stroke(detailColor); strokeWeight(1.3 / camera.zoom);
    line(-r * 0.6, -r * 0.15, r * 0.35, r * 0.25);
    line(r * 0.35, r * 0.25, r * 0.2, -r * 0.6);
  }
  pop();
}
