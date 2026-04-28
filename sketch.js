let gameState = "menu";

let player;
let star_objects = [];
let score = 0;
let startFrame = 0;
let lastSpawnFrame = 0;
let difficultyFactor = 1;
let selectedDifficultyIndex = 1;
let currentStageIndex = 0;
const MIN_SPAWN_INTERVAL = 5;
const MAX_SPAWN_INTERVAL = 90;
const MAX_STARS = 30;
const START_CENTER_BLOCK_W = 0.25;
const START_CENTER_BLOCK_H = 0.25;
const DIFFICULTY_PRESETS = [
  { name: "Easy", factor: 0.9 },
  { name: "Normal", factor: 1 },
  { name: "Hard", factor: 1.1 }
];
const GAME_STAGES = ["playingStage0", "playingStage1"];


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

function setup() {
  createCanvas(1600, 900);
  startGame();
  gameState = "menu";
}

function draw() {
  background(30);

  if (gameState === "menu") {
    drawMenu();
  } 

  else if (GAME_STAGES.includes(gameState)) {
    runGame();
  } 
  
  else if (gameState === "gameover") {
    drawGameOver();
  }

  else if (gameState === "progress") {
    drawProgress();
  }

  else if (gameState === "ending") {
    drawEnding();
  }
}

function drawMenu() {
  fill(255);
  textAlign(CENTER, CENTER);
  textSize(36);
  text("The True Star Devourer", width / 2, height / 2 - 40);

  textSize(16);
  text("Use Mouse to control your star and eat smaller stars!", width / 2, height / 2 + 10);
  text("But watch out for bigger stars!", width / 2, height / 2 + 40);

  textSize(20);
  let selected = DIFFICULTY_PRESETS[selectedDifficultyIndex];
  text("Difficulty: " + selected.name, width / 2, height / 2 + 80);

  textSize(16);
  text("LEFT/RIGHT ARROW: Change difficulty", width / 2, height / 2 + 110);

  textSize(20);
  text("Press SPACE to Start", width / 2, height / 2 + 145);
}

function getSpawnInterval() {
  let fillRatio = star_objects.length / MAX_STARS;
  return lerp(MIN_SPAWN_INTERVAL, MAX_SPAWN_INTERVAL, fillRatio);
}

function getInitialSpawnPosition(r) {
  let centerX = width / 2;
  let centerY = height / 2;
  let halfBlockW = (width * START_CENTER_BLOCK_W) / 2;
  let halfBlockH = (height * START_CENTER_BLOCK_H) / 2;

  for (let i = 0; i < 50; i++) {
    let x = random(r, width - r);
    let y = random(r, height - r);
    let inCenterBlock = abs(x - centerX) < halfBlockW && abs(y - centerY) < halfBlockH;
    if (!inCenterBlock) {
      return { x, y };
    }
  }

  // Fallback to corners if random sampling fails.
  let corner = floor(random(4));
  if (corner === 0) return { x: r, y: r };
  if (corner === 1) return { x: width - r, y: r };
  if (corner === 2) return { x: r, y: height - r };
  return { x: width - r, y: height - r };
}

function runGame() {
  // UI
  fill(255);
  textAlign(LEFT, TOP);
  textSize(16);
  text("Time Passed: " + floor((frameCount - startFrame) / 60), 20, 20);
  text("Score: " + score, 20, 40);

  // move player toward mouse
  let dx = mouseX - player.x;
  let dy = mouseY - player.y;
  player.x += dx * 0.05;
  player.y += dy * 0.05;
  player.angle += player.rotationSpeed;

  // draw player
  drawAsteroidBody(player, color(180, 205, 235), color(130, 155, 185));

  // respawn stars over time, growing larger as time passes
  if (frameCount - lastSpawnFrame >= getSpawnInterval() && star_objects.length < MAX_STARS) {
    spawnStar();
    lastSpawnFrame = frameCount;
  }

  // draw and check star_objects
  for (let i = star_objects.length - 1; i >= 0; i--) {
    let f = star_objects[i];

    // move star
    f.x += f.vx;
    f.y += f.vy;
    f.angle += f.rotationSpeed;

    drawAsteroidBody(f, color(150, 128, 102), color(105, 88, 68));

    // only bounce once the star is fully on-screen (prevents edge-spawned stars from immediately bouncing back)
    if (!f.entered) {
      if (f.x - f.r >= 0 && f.x + f.r <= width && f.y - f.r >= 0 && f.y + f.r <= height) {
        f.entered = true;
      }
    } 
    
    else {
      if (f.x - f.r < 0 || f.x + f.r > width)  f.vx *= -1;
      if (f.y - f.r < 0 || f.y + f.r > height) f.vy *= -1;
    }

    let d = dist(player.x, player.y, f.x, f.y);

    // check collision, can only eat if player is bigger, otherwise game over
    if (d < player.r + f.r) {
      if (player.r > f.r) {
        player.r += f.r * 0.05 / difficultyFactor; // grow by 5% of the eaten star's radius scaled by difficulty (harder difficulties grow less per star to balance out the faster spawn and larger star sizes)
        star_objects.splice(i, 1);
        score += 1;
        if (score === 75) {
          gameState = "progress";
          return;
        }
      } 
      
      else {
        gameState = "gameover";
        return;
      }
    }
  }
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

function keyPressed() {
  if (gameState === "menu") {
    if (keyCode === LEFT_ARROW) {
      selectedDifficultyIndex = (selectedDifficultyIndex - 1 + DIFFICULTY_PRESETS.length) % DIFFICULTY_PRESETS.length;
    }

    if (keyCode === RIGHT_ARROW) {
      selectedDifficultyIndex = (selectedDifficultyIndex + 1) % DIFFICULTY_PRESETS.length;
    }
  }

  if (key === ' ') {
    if (gameState === "menu") {
      difficultyFactor = DIFFICULTY_PRESETS[selectedDifficultyIndex].factor;
      startGame();
      gameState = "playingStage0";
    } 
    
    else if (gameState === "gameover") {
      startGame();
      gameState = "playingStage0";
    }

    else if (gameState === "progress") { 
      if (currentStageIndex < GAME_STAGES.length - 1) {
        currentStageIndex++;
        gameState = GAME_STAGES[currentStageIndex];
        startGame();
      }
      else {
        // No more stages, end the game with a win state
        gameState = "ending";
      }
    }
  }
}

function drawProgress() {
  fill(255);
  textAlign(CENTER, CENTER);
  textSize(28);
  text("Congratulations! You've evolved into the next stage!", width / 2, height / 2 - 20);
  textSize(20);
  text("Press SPACE to continue", width / 2, height / 2 + 20);
}

function startGame() {
  score = 0;
  startFrame = frameCount;
  lastSpawnFrame = frameCount;

  player = {
    x: width / 2,
    y: height / 2,
    r: 20,
    angle: random(TWO_PI),
    rotationSpeed: random(-0.02, 0.02),
    shapeRadius: 20,
    shape: makeAsteroidShape(20, 11, 0.22)
  };

  star_objects = [];

  for (let i = 0; i < 20; i++) {
    spawnStar(true);
  }
}

function drawEnding() {
  fill(255);
  textAlign(CENTER, CENTER);
  textSize(32);
  text("You have become the True Star Devourer!", width / 2, height / 2 - 20); 
  text("For now... Until the next BIG BOOM", width / 2, height / 2); 
  textSize(20);
  text("Refresh the page to play again", width / 2, height / 2 + 40);
}

function spawnStar(initial = false) {
  // radius range grows with elapsed time: starts at 8–30, scales up over time
  let elapsed = (frameCount - startFrame) / 90; // seconds
  let growth = elapsed / 90; // reaches 1.0 after 1.5 minutes

  let minR = 8  + growth * 80  * difficultyFactor;
  let maxR = 30 + growth * 160 * difficultyFactor;
  let r = random(minR, maxR);

  let speed = random(1.25+growth, 2.25+growth) * (20 / r) * difficultyFactor; // smaller stars tend to move faster, but all new stars spawn at higher speeds as time goes on
  let x, y, vx, vy;
  let shape = makeAsteroidShape(r, floor(random(9, 14)), 0.28);
  let angle = random(TWO_PI);
  let rotationSpeed = random(-0.03, 0.03) * (20 / r);
  
  if (initial) {
    // place at startup away from the center area to avoid immediate collisions
    let spawnPos = getInitialSpawnPosition(r);
    x = spawnPos.x;
    y = spawnPos.y;
    let angle = random(TWO_PI);
    vx = cos(angle) * speed;
    vy = sin(angle) * speed;
    star_objects.push({ x, y, r, vx, vy, entered: true, shape, shapeRadius: r, angle, rotationSpeed });
    return;
  } 
  
  else {
    // enter from a random edge, velocity points inward
    let edge = floor(random(4));
    if (edge === 0)      { x = random(width); y = -r;           vx = random(-1, 1) * speed; vy =  speed; }
    else if (edge === 1) { x = random(width); y = height + r;   vx = random(-1, 1) * speed; vy = -speed; }
    else if (edge === 2) { x = -r;            y = random(height); vx =  speed; vy = random(-1, 1) * speed; }
    else                 { x = width + r;     y = random(height); vx = -speed; vy = random(-1, 1) * speed; }
  }
  star_objects.push({ x, y, r, vx, vy, entered: false, shape, shapeRadius: r, angle, rotationSpeed });
}
