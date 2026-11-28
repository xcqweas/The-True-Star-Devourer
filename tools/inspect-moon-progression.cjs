// Standalone tuning probes. Loads gameplay directly; never imports or runs a test suite.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const scripts = [...fs.readFileSync(path.join(root, 'index.html'), 'utf8')
  .matchAll(/<script src="(js\/[^"]+)"/g)].map(([, name]) => name);
const previousTuning = {
  ABSORPTION_MOON_MASS_RATIO:64,
  EVOLUTION_FORMS:[{type:'asteroid',label:'Asteroid',mass:400},{type:'moon',label:'Moon',mass:14400},
    {type:'planet',label:'Planet',mass:1440000}],
  ASTEROID_OUTER_RADIUS_SPREAD:18,FRAGMENTATION_GRACE_TICKS:75,
  DEBRIS_EJECTION_SPEED:140,DEBRIS_DRAG:1.2,DEBRIS_GRAVITY_DELAY_TICKS:720,
  DEBRIS_SPACING:32,DEBRIS_RECLAIM_TICKS:720,DEBRIS_HIGHLIGHT_TICKS:900
};

function loadGame(constants = {}) {
  const context = { Math, URLSearchParams, width:1600, height:900, mouseX:800, mouseY:450,
    TWO_PI:Math.PI*2, PI:Math.PI, min:Math.min, max:Math.max, abs:Math.abs,
    round:Math.round, floor:Math.floor, sin:Math.sin, cos:Math.cos,
    constrain:(v,a,b)=>Math.max(a,Math.min(b,v)), lerp:(a,b,t)=>a+(b-a)*t,
    map:(v,a,b,c,d)=>c+(d-c)*(v-a)/(b-a) };
  vm.createContext(context);
  for(const script of scripts) {
    let source=fs.readFileSync(path.join(root,script),'utf8');
    if(script==='js/constants.js')for(const [name,value] of Object.entries(constants))
      source=source.replace(new RegExp(`const ${name} = [^;]+;`),`const ${name} = ${JSON.stringify(value)};`);
    vm.runInContext(source,context,{filename:script});
  }
  for(const name of ['pacing-scenario.js','fragmentation-scenarios.js'])
    vm.runInContext(fs.readFileSync(path.join(root,'tests',name),'utf8'),context,{filename:name});
  return {run:source=>vm.runInContext(source,context),json:source=>
    JSON.parse(vm.runInContext(`JSON.stringify(${source})`,context))};
}

function supply(constants) {
  const game=loadGame(constants);
  return game.json(`(()=>{
    const samples=[];
    for(const seed of [1,42,1948])for(const distance of [0,8000,16000,32000]) {
      const bodies=[],rx=coordinateRegion(distance);
      for(let y=-3;y<=3;y++)for(let x=rx-3;x<=rx+3;x++)bodies.push(...generateRegion(seed,x,y));
      const food=bodies.filter(b=>b.type==='asteroid'),moons=bodies.filter(b=>b.type==='moon');
      samples.push({seed,distance,asteroids:food.length,meanAsteroidMass:food.reduce((n,b)=>n+b.mass,0)/food.length,
        asteroidRadii:[Math.min(...food.map(b=>b.r)),Math.max(...food.map(b=>b.r))],
        moons:moons.length,moonMass:moons.reduce((n,b)=>n+b.mass,0),
        feeding:[120,180,240,360,480,600].map(r=>{
          const actor={mass:massForRadius(r),r};
          return {r,edibleMoons:moons.filter(b=>collisionDisposition(actor,b)==='eat').length};
        })});
    }
    return {moonMass:EVOLUTION_FORMS[1].mass,planetMass:EVOLUTION_FORMS[2].mass,
      requiredGain:EVOLUTION_FORMS[2].mass-EVOLUTION_FORMS[1].mass,samples};
  })()`);
}

function opening(seed,constants) {
  const game=loadGame(constants);
  game.run(`const route=loadPacingScenario(${seed});
    for(let i=0;i<10800&&route.phase!=='moon'&&gameState==='playing';i++) {
      steerPacingScenario(route);updateGame();
    }`);
  return game.json(`({seed:${seed},phase:route.phase,state:gameState,seconds:runTick/SIMULATION_FPS,
    meals:score,mass:player.mass,x:player.x,y:player.y})`);
}

function encounter(name,constants) {
  const game=loadGame(constants);
  game.run(`const route=loadFragmentationScenario('${name}');
    let drift=0,peakDistance=0,firstLootTick=null;const recovery=[];
    for(let i=0;i<1800&&route.phase!=='done'&&gameState==='playing';i++) {
      steerFragmentationScenario(route);updateGame();observeFragmentationScenario(route);
      const total=player.mass+[...world.regions.values()].flatMap(b=>[...b.values()]).reduce((m,b)=>m+b.mass,0);
      drift=Math.max(drift,Math.abs(total-route.totalMass));
      if(route.impactTick!==null) {
        for(const shard of route.fragments)peakDistance=Math.max(peakDistance,Math.hypot(shard.x-player.x,shard.y-player.y));
        if(route.collectedTargetMass>0)firstLootTick??=runTick;
        const since=runTick-route.impactTick;
        if([120,240,360].includes(since))recovery.push({seconds:since/SIMULATION_FPS,netGain:player.mass-route.initialMass,
          targetLoot:route.collectedTargetMass});
      }
    }`);
  return game.json(`({name:'${name}',phase:route.phase,state:gameState,seconds:runTick/SIMULATION_FPS,
    initial:route.initialMass,retained:route.afterImpactMass,final:player.mass,netGain:player.mass-route.initialMass,
    targetLoot:route.collectedTargetMass,firstLootSeconds:firstLootTick===null?null:(firstLootTick-route.impactTick)/SIMULATION_FPS,
    collectionSeconds:route.impactTick===null?null:(runTick-route.impactTick)/SIMULATION_FPS,
    impactCount:world.nextImpactId,massDrift:drift,peakDistance,recovery})`);
}

function progression(seed,constants={},seconds=45) {
  const game=loadGame(constants);
  game.run(`const openingRoute=loadPacingScenario(${seed});
    for(let i=0;i<10800&&openingRoute.phase!=='moon'&&gameState==='playing';i++) {
      steerPacingScenario(openingRoute);updateGame();
    }
    const startTick=runTick,startMass=player.mass,history=[],events=[];
    let target=null,recoverUntil=0,cloud=[],peakLostFraction=0;
    const realImpact=resolveBodyImpact;
    resolveBodyImpact=(...args)=>{
      const event=realImpact(...args);
      if(event.kind==='fragmented'&&(event.a===player||event.b===player)) {
        cloud=event.debris;recoverUntil=runTick+8*SIMULATION_FPS;target=null;
        const lost=event.a===player?event.lossA:event.lossB;
        peakLostFraction=Math.max(peakLostFraction,lost/(player.mass+lost));
        events.push({tick:runTick-startTick,kind:'fragmented',lost});
      } else if(event.kind==='absorbed'&&event.collector===player)
        events.push({tick:runTick-startTick,kind:event.consumed.type,mass:event.mass});
      return event;
    };
    for(let i=0;i<${seconds}*SIMULATION_FPS&&gameState==='playing'&&player.mass<EVOLUTION_FORMS[2].mass;i++) {
      if(!target||!residentBody(target)||runTick%30===0) {
        const nearby=[],scan=Math.min(10000,Math.max(4000,width/(2*targetZoomForRadius(player.r))));
        visitRegionBodies(worldRegionBounds(player.x,player.y,scan,scan),body=>nearby.push(body));
        const recovering=runTick<recoverUntil&&cloud.some(residentBody);
        const eligible=body=>isLooseDebris(body)?canCollectDebris(player,body):collisionDisposition(player,body)==='eat';
        const obstacles=nearby.filter(b=>!isLooseDebris(b)&&!eligible(b));
        let choices=recovering?cloud.filter(b=>residentBody(b)&&eligible(b)):nearby.filter(b=>eligible(b)||
          (canFragmentTogether(player,b)&&b.mass<=player.mass*1.25));
        const value=body=> {
          const distance=Math.hypot(body.x-player.x,body.y-player.y);
          const contactTime=Math.max(0,distance-player.r-body.r)/playerMovementLimits().speed;
          if(eligible(body))return body.mass/(contactTime+0.35);
          const loss=impactMassLoss(player,body,playerMovementLimits().speed);
          return Math.max(0,0.7*body.mass*loss.b-0.3*player.mass*loss.a)/(contactTime+6);
        };
        choices=choices.filter(b=>Math.hypot(b.x-player.x,b.y-player.y)<scan);
        choices.sort((a,b)=>value(b)-value(a)||a.id.localeCompare(b.id));
        target=choices.find(b=>pacingPathClear(b,obstacles.filter(o=>o!==b)));
        // Resume ordinary feeding if every remaining shard requires crossing a core.
        if(!target&&recovering){recoverUntil=0;cloud=[];}
      }
      const dx=target?target.x-player.x:0,dy=target?target.y-player.y:0;
      const cap=runTick<recoverUntil?Math.min(1000,playerMovementLimits().speed):playerMovementLimits().speed;
      const distance=Math.hypot(dx,dy),approach=Math.min(cap,distance*3);
      const vx=(distance?dx/distance*approach:0)+(target?.vx??0)-player.gravityVx;
      const vy=(distance?dy/distance*approach:0)+(target?.vy??0)-player.gravityVy;
      const speed=Math.hypot(vx,vy),offset=STEERING_DEAD_ZONE+
        (STEERING_MAX_DISTANCE-STEERING_DEAD_ZONE)*Math.min(1,speed/playerMovementLimits().speed);
      mouseX=width/2+(speed?vx/speed*offset:0);mouseY=height/2+(speed?vy/speed*offset:0);
      updateGame();
      if((runTick-startTick)%(5*SIMULATION_FPS)===0)history.push({seconds:(runTick-startTick)/SIMULATION_FPS,mass:player.mass});
    }`);
  return game.json(`({seed:${seed},state:gameState,seconds:(runTick-startTick)/SIMULATION_FPS,startMass,
    finalMass:player.mass,planetMass:EVOLUTION_FORMS[2].mass,reachedPlanet:player.mass>=EVOLUTION_FORMS[2].mass,
    moonMeals:events.filter(e=>e.kind==='moon').length,asteroidMeals:events.filter(e=>e.kind==='asteroid').length,
    collisions:events.filter(e=>e.kind==='fragmented').length,peakLostFraction,history,x:player.x,y:player.y})`);
}

function policy(constants={}) {
  const game=loadGame(constants);
  return game.json(`(()=>{
    return [1,2,2.99,3,4,25,63.99,64].map(ratio=>{
      const other=createBody('other','moon',0,0,radiusForMass(FRAGMENTATION_MIN_MASS),seededRandom(2));
      const actor=createBody('actor','moon',0,0,radiusForMass(other.mass*ratio),seededRandom(1));
      const moon=collisionDisposition(actor,other);
      other.type='planet';other.gravitySource=true;
      const planet=collisionDisposition(actor,other);
      return {massRatio:ratio,radiusRatio:ratio**(1/MASS_RADIUS_EXPONENT),moon,planet};
    });
  })()`);
}

function inspect(constants={}) {
  const report={supply:supply(constants),opening:[1,42,1948].map(seed=>opening(seed,constants)),
    encounters:['smaller','comparable','larger'].map(name=>encounter(name,constants)),thresholds:policy(constants)};
  return report;
}

if(require.main===module) {
  const constants=process.argv.includes('--before')?previousTuning:{};
  const report=process.argv.includes('--progression')?[1,42,1948].map(seed=>progression(seed,constants)):inspect(constants);
  console.log(JSON.stringify(report,null,2));
}
module.exports={loadGame,supply,opening,encounter,progression,policy,inspect,previousTuning};
