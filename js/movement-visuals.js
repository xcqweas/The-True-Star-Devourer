function resetMovementVisuals() {
  const rng = seededRandom(hashSeed(runSeed, "decorations"));
  movementVisuals = {
    trail: [], parallaxX: 0, parallaxY: 0,
    lastX: player.x, lastY: player.y,
    layers: [0.035, 0.09].map(factor => ({
      factor,
      stars: Array.from({ length: PARALLAX_STARS_PER_LAYER }, () => ({
        u: rng(), v: rng(), size: 0.6 + rng() * 0.65
      }))
    }))
  };
}

function updateParallax() {
  // Integrate movement so zooming far from the origin cannot whip the backdrop
  // around. Zoom affects visual displacement only, never a physical position.
  movementVisuals.parallaxX += (player.x - movementVisuals.lastX) * camera.zoom;
  movementVisuals.parallaxY += (player.y - movementVisuals.lastY) * camera.zoom;
  movementVisuals.lastX = player.x;
  movementVisuals.lastY = player.y;
}

function parallaxStarPosition(layer, star) {
  const padding = 4;
  const wrap = (value, period) => ((value % period) + period) % period;
  return {
    x: wrap(star.u * (width + padding * 2) - movementVisuals.parallaxX * layer.factor, width + padding * 2) - padding,
    y: wrap(star.v * (height + padding * 2) - movementVisuals.parallaxY * layer.factor, height + padding * 2) - padding
  };
}

function drawParallax() {
  push();
  strokeWeight(0.7);
  for (const layer of movementVisuals.layers) {
    // Dim blue crosses, unlike the brighter solid silhouettes of physical bodies.
    stroke(95, 135, 175, layer.factor < 0.05 ? 55 : 85);
    for (const star of layer.stars) {
      const { x, y } = parallaxStarPosition(layer, star);
      line(x - star.size, y, x + star.size, y);
      line(x, y - star.size, x, y + star.size);
    }
  }
  pop();
}

function recordMovementTrail() {
  const trail = movementVisuals.trail;
  while (trail.length && runTick - trail[0].tick >= TRAIL_LIFETIME_TICKS) trail.shift();
  if (runTick % TRAIL_SAMPLE_TICKS !== 0 || Math.hypot(player.vx, player.vy) < TRAIL_MIN_SPEED) return;
  const last = trail[trail.length - 1];
  if (last && Math.hypot(player.x - last.x, player.y - last.y) < 6) return;
  trail.push({ x: player.x, y: player.y, r: player.r, tick: runTick });
  if (trail.length > TRAIL_MAX_POINTS) trail.shift();
}

function drawMovementTrail() {
  const trail = movementVisuals.trail;
  push();
  for (let i = 1; i < trail.length; i++) {
    const point = trail[i];
    const fade = constrain(1 - (runTick - point.tick) / TRAIL_LIFETIME_TICKS, 0, 1);
    stroke(120, 180, 220, 65 * fade);
    strokeWeight(Math.min(point.r * 0.2, 4 / camera.zoom) * fade);
    line(trail[i - 1].x, trail[i - 1].y, point.x, point.y);
  }
  pop();
}
