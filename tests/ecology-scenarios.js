// Deterministic unattended scenes shared by Node and the ecology replay page.
function loadEcologyScenario(name) {
  startGame({seed:9182,fixture:true});world.regions.clear();world.gravitySources.clear();
  steering.armed = steering.engaged = true; steering.rampTicks = STEERING_ACTIVATION_TICKS;
  world.ecology.clear();world.sourceRegions.clear();
  selectedDifficultyIndex=2;difficultyFactor=1;
  const scene={name,totalMass:player.mass,foods:[],debris:[],bodies:[]};
  const add=(id,type,x,y,r,vx=0,vy=0)=>{
    const body=createBody('ecology:'+id,type,x,y,r,seededRandom(hashSeed(9182,id)),vx,vy);
    storeWorldBody(world,body);scene.bodies.push(body);scene.totalMass+=body.mass;return body;
  };
  if(name==='competition') {
    scene.first=add('first','asteroid',4100,0,40,200,0);
    scene.second=add('second','asteroid',4300,0,40,-200,0);
    const shard=add('prize','debris',4200,0,14);
    shard.kind='debris';shard.ownerId=null;shard.originId='neutral-cloud';
    shard.bornAtTick=-DEBRIS_MERGE_AGE_TICKS;shard.collectAfterTick=0;shard.publicAfterTick=0;
    shard.reclaimAfterTick=0;shard.gravityAfterTick=1e9;shard.highlightUntilTick=1e9;
    storeWorldBody(world,shard);scene.debris.push(shard);
  } else {
    scene.source=add('source','planet',5000,0,600);
    for(let i=0;i<24;i++) {
      const angle=i*Math.PI*2/24, radius=760+(i%3)*60;
      scene.foods.push(add('food:'+i,'asteroid',5000+Math.cos(angle)*radius,Math.sin(angle)*radius,10+i%4));
    }
    scene.a=add('moon:a','moon',3900,-1600,200,260,0);
    scene.b=add('moon:b','moon',4600,-1600,200,-260,0);
    for(let i=0;i<32;i++) {
      const body=add('crumb:'+i,'debris',4650+(i%8)*8,1400+Math.floor(i/8)*8,6);
      body.kind='debris';body.originId='old-cloud';body.ownerId=null;body.bornAtTick=-DEBRIS_MERGE_AGE_TICKS;
      body.collectAfterTick=body.publicAfterTick=body.reclaimAfterTick=0;
      body.gravityAfterTick=0;body.highlightUntilTick=0;storeWorldBody(world,body);scene.debris.push(body);
    }
  }
  gameState='playing';mouseX=width/2;mouseY=height/2;
  syncWorldRegions();updateGravitySources(true);syncEcology(true);resetCamera();
  camera.zoom=camera.backgroundZoom=0.1;
  return scene;
}
