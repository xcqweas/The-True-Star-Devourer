let menuScene = null;

function makePlanetPalette() {
  const palettes = [
    { base: color(255, 130, 120), glow: color(255, 180, 140), ring: color(255, 220, 190, 140) },
    { base: color(95, 170, 255), glow: color(155, 210, 255), ring: color(200, 230, 255, 150) },
    { base: color(190, 140, 255), glow: color(230, 200, 255), ring: color(240, 220, 255, 140) },
    { base: color(120, 245, 200), glow: color(180, 255, 230), ring: color(220, 255, 240, 140) }
  ];

  return random(palettes);
}

function createMenuScene() {
  const stars = [];
  const asteroids = [];
  const planets = [];

  const starCount = floor(width * height / 3200);
  for (let i = 0; i < starCount; i++) {
    stars.push({
      x: random(width),
      y: random(height),
      size: random(1, 3.2),
      alphaBase: random(80, 220),
      twinkleSpeed: random(0.01, 0.04),
      twinkleOffset: random(TWO_PI)
    });
  }

  for (let i = 0; i < 10; i++) {
    const bumps = floor(random(7, 11));
    const profile = [];
    for (let j = 0; j < bumps; j++) {
      profile.push(random(0.78, 1.08));
    }

    asteroids.push({
      x: random(width),
      y: random(height),
      radius: random(14, 34),
      speedX: random(-1.2, 1.2),
      speedY: random(-0.5, 0.5),
      angle: random(TWO_PI),
      spin: random(-0.02, 0.02),
      bumps,
      profile
    });
  }

  for (let i = 0; i < 3; i++) {
    const palette = makePlanetPalette();
    planets.push({
      x: random(width * 0.12, width * 0.88),
      y: random(height * 0.14, height * 0.5),
      radius: random(60, 130),
      drift: random(0.05, 0.16),
      phase: random(TWO_PI),
      hasRing: random() < 0.6,
      palette
    });
  }

  menuScene = {
    w: width,
    h: height,
    stars,
    asteroids,
    planets
  };
}

function ensureMenuScene() {
  if (!menuScene || menuScene.w !== width || menuScene.h !== height) {
    createMenuScene();
  }
}

function drawMenuBackground() {
  // Build a subtle cosmic gradient from top to bottom.
  for (let y = 0; y < height; y += 3) {
    const t = y / max(1, height);
    const c = lerpColor(color(5, 10, 28), color(12, 18, 46), t);
    stroke(c);
    line(0, y, width, y);
  }

  noStroke();
  for (let i = 0; i < menuScene.stars.length; i++) {
    const s = menuScene.stars[i];
    const twinkle = sin(frameCount * s.twinkleSpeed + s.twinkleOffset) * 70;
    fill(255, 245, 210, constrain(s.alphaBase + twinkle, 40, 255));
    circle(s.x, s.y, s.size);
  }
}

function drawMenuPlanets() {
  for (let i = 0; i < menuScene.planets.length; i++) {
    const p = menuScene.planets[i];
    const bobY = sin(frameCount * p.drift * 0.03 + p.phase) * 16;
    const px = p.x + cos(frameCount * p.drift * 0.01 + p.phase) * 10;
    const py = p.y + bobY;

    noStroke();
    fill(red(p.palette.glow), green(p.palette.glow), blue(p.palette.glow), 40);
    circle(px, py, p.radius * 2.2);

    fill(p.palette.base);
    circle(px, py, p.radius * 1.75);

    fill(255, 255, 255, 36);
    ellipse(px - p.radius * 0.25, py - p.radius * 0.22, p.radius * 0.7, p.radius * 0.45);

    if (p.hasRing) {
      push();
      translate(px, py);
      rotate(PI / 10);
      noFill();
      stroke(p.palette.ring);
      strokeWeight(3);
      ellipse(0, 0, p.radius * 2.3, p.radius * 0.85);
      stroke(255, 255, 255, 70);
      strokeWeight(1);
      ellipse(0, 0, p.radius * 2.05, p.radius * 0.6);
      pop();
    }
  }
}

function drawAsteroidShape(radius, profile) {
  const bumps = profile.length;
  beginShape();
  for (let i = 0; i < bumps; i++) {
    const a = map(i, 0, bumps, 0, TWO_PI);
    const r = radius * profile[i];
    vertex(cos(a) * r, sin(a) * r);
  }
  endShape(CLOSE);
}

function drawMenuAsteroids() {
  for (let i = 0; i < menuScene.asteroids.length; i++) {
    const a = menuScene.asteroids[i];
    a.x += a.speedX;
    a.y += a.speedY;
    a.angle += a.spin;

    if (a.x < -50) a.x = width + 50;
    if (a.x > width + 50) a.x = -50;
    if (a.y < -50) a.y = height + 50;
    if (a.y > height + 50) a.y = -50;

    push();
    translate(a.x, a.y);
    rotate(a.angle);
    noStroke();
    fill(110, 105, 120, 220);
    drawAsteroidShape(a.radius, a.profile);

    fill(72, 70, 86, 170);
    circle(-a.radius * 0.2, -a.radius * 0.05, a.radius * 0.55);
    circle(a.radius * 0.28, a.radius * 0.18, a.radius * 0.42);
    pop();
  }
}

function drawMenuTextPanel() {
  const panelW = min(width * 0.78, 920);
  const panelH = min(height * 0.56, 500);
  const panelX = width / 2;
  const panelY = height * 0.57;

  noStroke();
  fill(7, 12, 34, 175);
  rectMode(CENTER);
  rect(panelX, panelY, panelW, panelH, 28);

  fill(255, 255, 255, 30);
  rect(panelX, panelY - panelH * 0.36, panelW * 0.92, 3, 2);

  textAlign(CENTER, CENTER);
  textFont("Great Vibes");
  textSize(constrain(width * 0.075, 48, 110));
  fill(115, 190, 255, 120);
  text("The True Star Devourer", width / 2 + 3, height * 0.37 + 3);
  fill(248, 238, 255);
  text("The True Star Devourer", width / 2, height * 0.37);

  textFont("Trebuchet MS");
  fill(225, 230, 255);
  textSize(constrain(width * 0.018, 14, 22));
  text("Use Mouse to control your star and eat smaller stars!", width / 2, height * 0.5);
  text("But watch out for bigger stars!", width / 2, height * 0.54);

  const selected = DIFFICULTY_PRESETS[selectedDifficultyIndex];
  textSize(constrain(width * 0.024, 18, 30));
  fill(255, 235, 170);
  text("Difficulty: " + selected.name, width / 2, height * 0.615);

  textSize(constrain(width * 0.016, 13, 18));
  fill(215, 222, 250);
  text("LEFT/RIGHT ARROW: Change difficulty", width / 2, height * 0.665);

  const pulse = map(sin(frameCount * 0.06), -1, 1, 150, 255);
  textSize(constrain(width * 0.03, 22, 36));
  fill(255, 245, 205, pulse);
  text("Press SPACE to Start", width / 2, height * 0.74);
}

function drawMenu() {
  ensureMenuScene();
  drawMenuBackground();
  drawMenuPlanets();
  drawMenuAsteroids();
  drawMenuTextPanel();
}

function drawGameOver() {
  fill(255);
  textAlign(CENTER, CENTER);
  textSize(32);
  text("Game Over", width / 2, height / 2 - 20);

  textSize(20);
  text("Final Score: " + score, width / 2, height / 2 + 20);
  text("Press SPACE to Restart", width / 2, height / 2 + 60);
}

function drawProgress() {
  fill(255);
  textAlign(CENTER, CENTER);
  textSize(28);
  text("Congratulations! You've evolved into the next stage!", width / 2, height / 2 - 60);
  textSize(20);
  text("Press SPACE to continue", width / 2, height / 2 - 20);
}

function drawEnding() {
  fill(255);
  textAlign(CENTER, CENTER);
  textSize(32);
  text("You have become the True Star Devourer!", width / 2, height / 2 - 40);
  text("For now... Until the next BIG BOOM", width / 2, height / 2);
  textSize(20);
  text("Well, until next update", width / 2, height / 2 + 40);
  text("You can refresh the page to play again!", width / 2, height / 2 + 80);
}
