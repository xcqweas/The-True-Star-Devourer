function makeAsteroidShape(radius, pointCount, roughness) {
  let points = [];
  for (let i = 0; i < pointCount; i++) {
    let angle = map(i, 0, pointCount, 0, TWO_PI);
    let localRadius = radius * random(1 - roughness, 1 + roughness);
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

function drawBodyForCurrentStage(body, baseColor, detailColor) {
  if (currentStageIndex === 1) {
    drawRockyMoonBody(body, baseColor, detailColor);
    return;
  }

  // Future stage implementations:
  // if (currentStageIndex === 2) {
  //   drawPlanetBody(body, baseColor, detailColor);
  //   return;
  // }

  drawAsteroidBody(body, baseColor, detailColor);
}
