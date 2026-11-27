function followPlayer() {
  camera.x = player.x;
  camera.y = player.y;
}

function targetZoomForRadius(radius) {
  const growth = CAMERA_REFERENCE_RADIUS / Math.max(radius, CAMERA_REFERENCE_RADIUS);
  return constrain(CAMERA_MAX_ZOOM * growth ** CAMERA_GROWTH_EXPONENT, CAMERA_MIN_ZOOM, CAMERA_MAX_ZOOM);
}

function resetCamera() {
  followPlayer();
  camera.zoom = camera.targetZoom = targetZoomForRadius(player.r);
  camera.backgroundZoom = camera.zoom;
}

function updateCamera(elapsedSeconds) {
  followPlayer();
  camera.targetZoom = targetZoomForRadius(player.r);
  const elapsed = constrain(elapsedSeconds, 0, MAX_FRAME_DELTA_MS / 1000);
  // Mass/radius change immediately; zoom follows over a short interval. Easing
  // in log space gives the same relative response at every physical scale.
  const current = constrain(camera.zoom, CAMERA_MIN_ZOOM, CAMERA_MAX_ZOOM);
  const blend = -Math.expm1(-CAMERA_ZOOM_RESPONSE * elapsed);
  camera.zoom = Math.exp(Math.log(current) +
    (Math.log(camera.targetZoom) - Math.log(current)) * blend);
  const densityBlend = -Math.expm1(-BACKGROUND_DENSITY_RESPONSE * elapsed);
  camera.backgroundZoom = Math.exp(Math.log(camera.backgroundZoom) +
    (Math.log(camera.zoom) - Math.log(camera.backgroundZoom)) * densityBlend);
}

function worldToScreen(x, y) {
  return {
    x: (x - camera.x) * camera.zoom + width / 2,
    y: (y - camera.y) * camera.zoom + height / 2
  };
}

function screenToWorld(x, y) {
  return {
    x: (x - width / 2) / camera.zoom + camera.x,
    y: (y - height / 2) / camera.zoom + camera.y
  };
}

function bodyIntersectsView(body, centerX, centerY, halfWidth, halfHeight, extent = body.r) {
  const dx = Math.max(0, Math.abs(body.x - centerX) - halfWidth);
  const dy = Math.max(0, Math.abs(body.y - centerY) - halfHeight);
  return dx * dx + dy * dy <= extent * extent;
}

function isBodyVisible(body) {
  // Include the existing threat ring/glow and irregular asteroid silhouette.
  return bodyIntersectsView(body, camera.x, camera.y,
    width / (2 * camera.zoom), height / (2 * camera.zoom), body.r * 1.3 + 8);
}
