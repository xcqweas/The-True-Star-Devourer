// Generation/render-count inspection only. Does not register or run the test suite.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const scripts = [...fs.readFileSync(path.join(root, 'index.html'), 'utf8')
  .matchAll(/<script src="(js\/[^\"]+)"/g)].map(([, name]) => name);

function loadGame() {
  const context = { Math, URLSearchParams, TWO_PI:Math.PI*2, PI:Math.PI, width:1600, height:900,
    min:Math.min, max:Math.max, floor:Math.floor, sin:Math.sin, cos:Math.cos,
    constrain:(v,a,b)=>Math.max(a,Math.min(b,v)),
    map:(v,a,b,c,d)=>c+(d-c)*(v-a)/(b-a),
    lerp:(a,b,t)=>a+(b-a)*t };
  vm.createContext(context);
  for (const script of scripts) vm.runInContext(fs.readFileSync(path.join(root,script),'utf8'),context,{filename:script});
  return context;
}

function inspect(seed, radius, position, zoom = null, difficulty = 1) {
  const context=loadGame();
  return JSON.parse(vm.runInContext(`
    difficultyFactor=${difficulty};startGame({seed:${seed}});
    setBodyMass(player,massForRadius(${radius}));player.x=${position[0]};player.y=${position[1]};
    resetCamera();${zoom === null ? '' : `camera.zoom=camera.backgroundZoom=${zoom};`}
    syncWorldRegions();syncEcology(true);
    const rendered=getRenderableBodies();
    const physical=rendered.filter(b=>bodyIntersectsView(b,camera.x,camera.y,width/(2*camera.zoom),height/(2*camera.zoom),b.r));
    const counts=items=>Object.fromEntries(['asteroid','moon','planet'].map(type=>[type,items.filter(b=>b.type===type).length]));
    const food=[...world.regions.values()].flatMap(b=>[...b.values()]).filter(b=>
      b.type==='asteroid'&&b.r<20&&Math.hypot(b.x,b.y)-b.r<1600);
    JSON.stringify({seed:runSeed,radius:player.r,position:[player.x,player.y],zoom:camera.zoom,
      rendered:counts(rendered),physical:counts(physical),
      substantial:counts(physical.filter(b=>backgroundBodyOpacity(b)>=0.5)),
      openingFood:food.length,openingFoodMass:food.reduce((m,b)=>m+b.mass,0),
      bodies:physical.map(b=>({id:b.id,type:b.type,x:b.x,y:b.y,r:b.r,alpha:backgroundBodyOpacity(b)}))});
  `,context));
}

function inspectLayout() {
  const context=loadGame();
  return JSON.parse(vm.runInContext(`
    startGame({seed:42});
    const generated=[];let dense=0,travel=0;
    for(let y=-12;y<=12;y++)for(let x=-12;x<=12;x++){
      const bodies=generateRegion(42,x,y);generated.push(...bodies);
      const count=bodies.filter(b=>b.type==='asteroid').length;
      dense=Math.max(dense,count);if(Math.hypot(x,y)>4)travel=travel===0?count:Math.min(travel,count);
    }
    const systems=[];
    for(const seed of [1,42,1948])for(let y=-3;y<=3;y++)for(let x=-3;x<=3;x++) {
      const planet=planetForCell(seed,x,y);if(!planet)continue;
      const moons=systemMoonsForPlanet(seed,planet);
      systems.push({seed,planet,moons,extent:Math.max(planet.r,...moons.map(m=>Math.hypot(m.x-planet.x,m.y-planet.y)+m.r))});
    }
    let gap=Infinity,moonGap=Infinity;
    for(const system of systems){
      for(const moon of system.moons)moonGap=Math.min(moonGap,Math.hypot(moon.x-system.planet.x,moon.y-system.planet.y)-moon.r-system.planet.r);
      for(const other of systems)if(other!==system&&other.seed===system.seed)
        gap=Math.min(gap,Math.hypot(other.planet.x-system.planet.x,other.planet.y-system.planet.y)-system.extent-other.extent);
    }
    const signature=items=>JSON.stringify(items.map(b=>[b.id,b.x,b.y,b.r]).sort((a,b)=>a[0].localeCompare(b[0])));
    const large=generated.filter(b=>b.type!=='asteroid');
    let minimumLargeGap=Infinity;
    for(let i=0;i<large.length;i++)for(let j=i+1;j<large.length;j++)
      minimumLargeGap=Math.min(minimumLargeGap,Math.hypot(large[i].x-large[j].x,large[i].y-large[j].y)-large[i].r-large[j].r);
    const revisited=[];
    for(let y=12;y>=-12;y--)for(let x=12;x>=-12;x--)revisited.push(...generateRegion(42,x,y));
    JSON.stringify({sampleRegions:625,sampleBodies:generated.length,
      counts:Object.fromEntries(['asteroid','moon','planet'].map(type=>[type,generated.filter(b=>b.type===type).length])),
      duplicateIds:generated.length-new Set(generated.map(b=>b.id)).size,
      wrongOwners:generated.filter(b=>b.id.split(':')[2]!==regionKey(coordinateRegion(b.x),coordinateRegion(b.y))).length,
      unsafeStarts:generated.filter(b=>!isOutsideStartingArea(b)).length,
      asteroidClearanceViolations:generated.filter(b=>b.type==='asteroid'&&!hasClearance(b,large,64)).length,
      minimumLargeGap,
      orderIndependent:signature(generated)===signature(revisited),
      actualAsteroidsPerRegion:{max:dense,min:travel},systems:systems.length,
      moonsPerSystem:{min:Math.min(...systems.map(s=>s.moons.length)),max:Math.max(...systems.map(s=>s.moons.length))},
      minimumSystemGap:gap,minimumPlanetMoonGap:moonGap});
  `,context));
}

if(process.argv.includes('--layout')) {
  console.log(JSON.stringify(inspectLayout(),null,2));
} else {
const seeds = [1,42,1948];
const views = [20,120,300,600,1200,1999];
const rows = [];
for (const seed of seeds) for (const radius of views) {
  rows.push(inspect(seed,radius,[0,0]));
  rows.push(inspect(seed,radius,[32000,16000]));
}
const zoomRows = [1,0.1,0.03,0.01].map(zoom=>inspect(42,600,[32000,16000],zoom));
const openings = [];
for(const seed of [1,7,42,71,1948,123456]) for(const difficulty of [0.8,1,1.2]) {
  const row=inspect(seed,20,[0,0],null,difficulty);
  openings.push({seed,difficulty,edible:row.openingFood,mass:row.openingFoodMass});
}
const layout=inspectLayout();
const summary = ({bodies,...row})=>row;
const maps = rows.filter(row=>row.seed===42&&row.position[0]===32000&&[600,1999].includes(row.radius));
const output = { viewport:[1600,900], rows:rows.map(summary), zoomRows:zoomRows.map(summary), openings, layout, maps };
if(process.argv[2])fs.writeFileSync(path.resolve(process.argv[2]),JSON.stringify(output,null,2));
for(const radius of views) {
  const sample=rows.filter(row=>row.radius===radius);
  const mean=type=>+(sample.reduce((n,row)=>n+row.physical[type],0)/sample.length).toFixed(1);
  const maximum=type=>Math.max(...sample.map(row=>row.physical[type]));
  console.log(JSON.stringify({radius,zoom:sample[0].zoom,mean:{asteroid:mean('asteroid'),moon:mean('moon'),planet:mean('planet')},maxPlanets:maximum('planet')}));
}
console.log('Fixed radius 600 zooms: '+JSON.stringify(zoomRows.map(({zoom,physical})=>({zoom,...physical}))));
console.log('Opening edible range: '+Math.min(...openings.map(row=>row.edible))+'–'+Math.max(...openings.map(row=>row.edible)));
console.log('Layout: '+JSON.stringify(layout));
}
