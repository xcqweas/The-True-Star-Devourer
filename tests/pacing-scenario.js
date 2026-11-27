// Developer-only foraging route using actual procedural food, forces and input.
function loadPacingScenario(seed = 42) {
  selectedDifficultyIndex = 2; difficultyFactor = 1;
  startGame({ seed }); gameState = 'playing';
  // Entry activation has its own real-transition checks. This controller starts armed.
  steering.armed = steering.engaged = true; steering.rampTicks = STEERING_ACTIVATION_TICKS;
  return { target:null, meals:0, phase:'forage', moonTick:null, seed };
}

function pacingPathClear(target, obstacles) {
  const dx=target.x-player.x,dy=target.y-player.y,length=dx*dx+dy*dy;
  return obstacles.every(body=> {
    const t=length ? constrain(((body.x-player.x)*dx+(body.y-player.y)*dy)/length,0,1) : 0;
    return Math.hypot(player.x+dx*t-body.x,player.y+dy*t-body.y)>player.r+body.r+100;
  });
}

function steerPacingScenario(route) {
  if(player.mass>=EVOLUTION_FORMS[1].mass) {
    route.phase='moon';route.moonTick ??= runTick;route.meals=score;
    mouseX=width/2;mouseY=height/2;return;
  }
  if(!route.target || world.consumedIds.has(route.target.id) || runTick%30===0) {
    const nearby=[];
    visitRegionBodies(worldRegionBounds(player.x,player.y,2400,2400),body=>nearby.push(body));
    const obstacles=nearby.filter(body=>!isLooseDebris(body) && body.r>=player.r);
    const candidates=nearby.filter(body=>body.type==='asteroid' && body.r<player.r &&
      Math.hypot(body.x-player.x,body.y-player.y)<2400);
    candidates.sort((a,b)=>Math.hypot(a.x-player.x,a.y-player.y)-Math.hypot(b.x-player.x,b.y-player.y) || a.id.localeCompare(b.id));
    route.target=candidates.find(body=>pacingPathClear(body,obstacles));
  }
  const target=route.target;
  const dx=target ? target.x-player.x : 0,dy=target ? target.y-player.y : 0;
  const limit=playerMovementLimits().speed;
  // Track moving food and compensate for field drift using ordinary mouse throttle.
  const vx=dx*3+(target?.vx ?? 0)-player.gravityVx;
  const vy=dy*3+(target?.vy ?? 0)-player.gravityVy;
  const speed=Math.hypot(vx,vy);
  const offset=STEERING_DEAD_ZONE+(STEERING_MAX_DISTANCE-STEERING_DEAD_ZONE)*Math.min(1,speed/limit);
  mouseX=width/2+(speed ? vx/speed*offset : 0);
  mouseY=height/2+(speed ? vy/speed*offset : 0);
}
