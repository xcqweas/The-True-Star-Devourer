let gameState = "menu";

let player;
let star_objects = [];
let score = 0;
let startFrame = 0;
let lastSpawnFrame = 0;
const SPAWN_INTERVAL = 30; // spawn a new star every 3 seconds
const MAX_STARS = 30;

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
  else if (gameState === "playing") {
    runGame();
  } 
  else if (gameState === "gameover") {
    drawGameOver();
  }
}

function drawMenu() {
  fill(255);
  textAlign(CENTER, CENTER);
  textSize(36);
  text("Star Game", width / 2, height / 2 - 40);

  textSize(20);
  text("Press SPACE to Start", width / 2, height / 2 + 10);
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

  // draw player
  fill(200, 200, 255);
  ellipse(player.x, player.y, player.r * 2);

  // respawn stars over time, growing larger as time passes
  if (frameCount - lastSpawnFrame >= SPAWN_INTERVAL && star_objects.length < MAX_STARS) {
    spawnStar();
    lastSpawnFrame = frameCount;
  }

  // draw and check star_objects
  for (let i = star_objects.length - 1; i >= 0; i--) {
    let f = star_objects[i];

    fill(255, 200, 100);
    ellipse(f.x, f.y, f.r * 2);

    // move star
    f.x += f.vx;
    f.y += f.vy;
    // only bounce once the star is fully on-screen (prevents edge-spawned stars from immediately bouncing back)
    if (!f.entered) {
      if (f.x - f.r >= 0 && f.x + f.r <= width && f.y - f.r >= 0 && f.y + f.r <= height) {
        f.entered = true;
      }
    } else {
      if (f.x - f.r < 0 || f.x + f.r > width)  f.vx *= -1;
      if (f.y - f.r < 0 || f.y + f.r > height) f.vy *= -1;
    }

    let d = dist(player.x, player.y, f.x, f.y);

    // check collision, can only eat if player is bigger, otherwise game over
    if (d < player.r + f.r) {
      if (player.r > f.r) {
        player.r += f.r * 0.04; // grow by 4% of the eaten star's radius
        star_objects.splice(i, 1);
        score += 1;
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
  if (key === ' ') {
    if (gameState === "menu" || gameState === "gameover") {
      startGame();
      gameState = "playing";
    }
  }
}

function startGame() {
  score = 0;
  startFrame = frameCount;
  lastSpawnFrame = frameCount;

  player = {
    x: width / 2,
    y: height / 2,
    r: 20
  };

  star_objects = [];

  for (let i = 0; i < 20; i++) {
    spawnStar(true);
  }
}

function spawnStar(initial = false) {
  // radius range grows with elapsed time: starts at 8–30, scales up over 2 minutes
  let elapsed = (frameCount - startFrame) / 60; // seconds
  let growth = elapsed / 120; // reaches 1.0 after 2 minutes
  let minR = 8  + growth * 44;
  let maxR = 30 + growth * 120;
  let r = random(minR, maxR);
  let speed = random(1.25+growth, 2.25+growth) * (20 / r);
  let x, y, vx, vy;
  
  if (initial) {
    // place randomly anywhere on screen with a random direction
    x = random(r, width - r);
    y = random(r, height - r);
    let angle = random(TWO_PI);
    vx = cos(angle) * speed;
    vy = sin(angle) * speed;
    star_objects.push({ x, y, r, vx, vy, entered: true });
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
  star_objects.push({ x, y, r, vx, vy, entered: false });
}
