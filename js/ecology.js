function canCollectDebris(collector, debris, tick = runTick) {
  const sourceBody = debris.parentId !== undefined ? collector.id === debris.parentId :
    collector.originId === debris.originId;
  if (sourceBody) {
    const owned = debris.ownerId != null && collector.ownerId === debris.ownerId;
    return tick >= (owned ? debris.collectAfterTick ?? 0 : debris.reclaimAfterTick ?? 0);
  }
  return tick >= (debris.publicAfterTick ?? 0);
}

function resolveSurfaceContact(a, b, contact, state = world) {
  // Stop swept crossings at entry; persistent overlaps use the current normal.
  if (contact.time > 0) {
    a.x = contact.ax; a.y = contact.ay; b.x = contact.bx; b.y = contact.by;
  }
  const dx = a.x - b.x, dy = a.y - b.y, distance = Math.hypot(dx, dy);
  const nx = distance > 1e-9 ? dx / distance : contact.nx;
  const ny = distance > 1e-9 ? dy / distance : contact.ny;
  const shareA = b.mass / (a.mass + b.mass), shareB = 1 - shareA;
  const correction = Math.max(0, a.r + b.r + ECOLOGY_SURFACE_CLEARANCE - distance);
  a.x += nx * correction * shareA; a.y += ny * correction * shareA;
  b.x -= nx * correction * shareB; b.y -= ny * correction * shareB;
  const closing = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
  if (closing < ECOLOGY_SURFACE_RELEASE_SPEED) {
    const impulse = Math.max(ECOLOGY_SURFACE_RELEASE_SPEED,
      -closing * ECOLOGY_SURFACE_RESTITUTION) - closing;
    impactVelocity(a, a.vx + nx * impulse * shareA, a.vy + ny * impulse * shareA);
    impactVelocity(b, b.vx - nx * impulse * shareB, b.vy - ny * impulse * shareB);
    for (const [body, source] of [[a,b],[b,a]]) {
      if (isGravityResponder(body) && isGravitySource(source)) {
        body.surfaceRelease = { sourceId:source.id,
          untilTick:runTick + ECOLOGY_SURFACE_GRAVITY_HOLD_TICKS };
      }
    }
  }
  if (a.id !== 'player') storeWorldBody(state, a);
  if (b.id !== 'player') storeWorldBody(state, b);
}

function residentBody(body) {
  if (world.consumedIds.has(body.id)) return false;
  if (body === player) return true;
  return world.regions.get(body.regionKey)?.get(body.id) === body;
}

function settleDormantBody(body) {
  // A fading body must not freeze embedded in a body that retired earlier.
  // Apply the same contact policy at zero background activation, bounded to
  // neighboring resident buckets; retirement never discards physical mass.
  const neighbors=[];
  visitRegionBodies(worldRegionBounds(body.x,body.y,body.r+MAX_PLANET_RADIUS,
    body.r+MAX_PLANET_RADIUS,0),other=>{
    if(other!==body&&!isLooseDebris(other)&&residentBody(other))neighbors.push(other);
  });
  neighbors.sort((a,b)=>b.r-a.r||a.id.localeCompare(b.id));
  neighbors.length=Math.min(neighbors.length,ECOLOGY_RETIRE_NEIGHBORS);
  for(let pass=0;pass<ECOLOGY_CONTACT_PASSES*2;pass++) {
    let corrected=false;
    for(const other of neighbors) {
      if (!residentBody(other)) continue;
      const dx=body.x-other.x,dy=body.y-other.y,distance=Math.hypot(dx,dy);
      const overlap=body.r+other.r+ECOLOGY_SURFACE_CLEARANCE-distance;
      if(overlap<=0)continue;
      resolveBodyImpact(body,other,sweptBodyContact(body,body,other,other));
      if (!residentBody(body)) return;
      corrected=true;
    }
    if(!corrected)break;
  }
  const remaining=neighbors.filter(residentBody);
  if(remaining.some(other=>Math.hypot(body.x-other.x,body.y-other.y)<body.r+other.r)) {
    const x=body.x,y=body.y,offset=hashSeed(world.seed,body.id,'retire')/4294967296*Math.PI*2;
    for(let attempt=0;attempt<PLACEMENT_ATTEMPTS*4;attempt++) {
      const angle=offset+attempt*2.399963229728653, distance=(1+Math.floor(attempt/8))*(body.r*2+ECOLOGY_SURFACE_CLEARANCE);
      const cx=x+Math.cos(angle)*distance,cy=y+Math.sin(angle)*distance;
      if(remaining.every(other=>Math.hypot(cx-other.x,cy-other.y)>=body.r+other.r+ECOLOGY_SURFACE_CLEARANCE)) {
        body.x=cx;body.y=cy;break;
      }
    }
  }
  storeWorldBody(world,body);
}

function ecologySources(body) {
  const rx = coordinateRegion(body.x), ry = coordinateRegion(body.y), key = regionKey(rx, ry);
  if (world.ecologySourceCache.has(key)) return world.ecologySourceCache.get(key);
  const reach = Math.ceil(GRAVITY_MAX_INFLUENCE / REGION_SIZE) + 1, candidates = [];
  for (let y=ry-reach;y<=ry+reach;y++) for (let x=rx-reach;x<=rx+reach;x++) {
    for (const source of world.sourceRegions.get(regionKey(x,y))?.values() ?? []) {
      if (residentBody(source) && isGravitySource(source)) candidates.push(source);
    }
  }
  const cx=(rx+0.5)*REGION_SIZE,cy=(ry+0.5)*REGION_SIZE;
  candidates.sort((a,b)=>(Math.hypot(a.x-cx,a.y-cy)-gravityInfluenceRadius(a))-
    (Math.hypot(b.x-cx,b.y-cy)-gravityInfluenceRadius(b)) || a.id.localeCompare(b.id));
  const selected=candidates.slice(0,ECOLOGY_SOURCES_PER_CELL);
  world.ecologySourceCache.set(key,selected);
  return selected;
}

function syncEcology(initialize = false) {
  world.ecologyStats = { tick:runTick, pairChecks:0, contacts:0, impacts:0, merges:0, simulated:0, retirements:0 };
  if(initialize || runTick%ECOLOGY_REFRESH_TICKS===0 || !world.ecologySourceCache) world.ecologySourceCache = new Map();
  world.mergeGhosts = world.mergeGhosts.filter(ghost=>runTick<ghost.untilTick);
  const near = new Set(star_objects.map(body=>body.id));
  world.localBodyIds=near;
  const detail = worldDetailHalfExtents();
  let candidates=world.ecologyCandidates;
  if(initialize || runTick%ECOLOGY_REFRESH_TICKS===0 || !candidates) {
    candidates = new Map();
    visitRegionBodies(worldRegionBounds(player.x,player.y,detail.x,detail.y),body=>{
      if (residentBody(body) && !near.has(body.id) && bodyIntersectsView(body,player.x,player.y,detail.x,detail.y)) candidates.set(body.id,body);
    });
    // Keep moving cores/sources and their interaction neighborhoods awake after
    // the observer leaves. Stable reserved slots do not depend on camera/player distance.
    const previous = world.ecologyMovingIds ?? new Set();
    world.ecologyMoving = [...world.movingBodies.values()].filter(residentBody)
      .sort((a,b)=>Number(previous.has(b.id))-Number(previous.has(a.id)) || a.id.localeCompare(b.id))
      .slice(0,ECOLOGY_CONTINUITY_BODIES);
    world.ecologyMovingIds = new Set(world.ecologyMoving.map(body=>body.id));
    const interactions = new Set();
    for (const mover of world.movingBodies.values()) if (residentBody(mover)) candidates.set(mover.id,mover);
    for (const mover of world.ecologyMoving) {
      const lead = Math.hypot(mover.vx,mover.vy) * ECOLOGY_REFRESH_TICKS * SIMULATION_STEP_SECONDS;
      const contactReach = mover.r + ACTIVE_MARGIN + lead;
      const fieldReach = isGravitySource(mover) ? gravityInfluenceRadius(mover) + ACTIVE_MARGIN : 0;
      const reach = Math.max(contactReach,fieldReach);
      visitRegionBodies(worldRegionBounds(mover.x,mover.y,reach,reach),body=>{
        if (!residentBody(body) || body===mover) return;
        const distance = Math.hypot(body.x-mover.x,body.y-mover.y);
        if (distance < contactReach + body.r || (isGravityResponder(body) && distance < fieldReach)) {
          candidates.set(body.id,body); interactions.add(body.id);
        }
      });
    }
    // Retire old clouds even after the player has left their region. No offline catch-up.
    for (const body of world.debris.values()) {
      if (residentBody(body) && runTick >= (body.publicAfterTick ?? 0) && !near.has(body.id)) {
        candidates.set(body.id,body);
        if(runTick >= (body.gravityAfterTick ?? 0)) {
          for(const source of ecologySources(body)) if(!near.has(source.id) &&
            Math.hypot(source.x-body.x,source.y-body.y)<gravityInfluenceRadius(source)+ACTIVE_MARGIN) candidates.set(source.id,source);
        }
      }
    }
    const rank=body=>body.ecologyRank ??= hashSeed(world.seed,body.id,'ecology');
    const priority=body=>interactions.has(body.id)&&body.mass>=FRAGMENTATION_MIN_MASS ? 8 :
      world.movingBodies.has(body.id) ? 7 :
      Math.hypot(body.x-player.x,body.y-player.y)<ECOLOGY_OPENING_FOOD_RADIUS ? 6 :
      interactions.has(body.id) ? 5 : isGravitySource(body) ? 3 : isLooseDebris(body) ? 2 : 0;
    world.ecologySelected=[...candidates.values()].filter(body=>!world.ecologyMovingIds.has(body.id))
      .sort((a,b)=>priority(b)-priority(a)||rank(a)-rank(b)||a.id.localeCompare(b.id))
      .slice(0,ECOLOGY_BACKGROUND_BODIES);
    world.ecologyCandidates=candidates;
  }
  const selected=[...world.ecologyMoving,...world.ecologySelected].filter(body=>residentBody(body)&&!near.has(body.id));
  const wanted=new Set([...near,...selected.map(body=>body.id)]);
  const step=SIMULATION_STEP_SECONDS/ECOLOGY_FADE_SECONDS;
  for (const [id,entry] of world.ecology) {
    if (!residentBody(entry.body)) {world.ecology.delete(id);continue;}
    entry.weight=constrain(entry.weight+(wanted.has(id)?step:-step),0,1);
    entry.body.ecologyOpacity=smoothGravityWeight(entry.weight);
    if (!wanted.has(id) && entry.weight===0 && world.ecologyStats.retirements<ECOLOGY_MAX_RETIREMENTS) {
      settleDormantBody(entry.body);world.ecology.delete(id);world.ecologyStats.retirements++;
    }
  }
  const capacity=MAX_ACTIVE_BODIES+ECOLOGY_BACKGROUND_BODIES+ECOLOGY_FADING_BODIES+ECOLOGY_CONTINUITY_BODIES;
  for (const body of [...star_objects,...selected]) {
    if (!residentBody(body)) continue;
    if (!world.ecology.has(body.id) && world.ecology.size<capacity) {
      const weight=initialize?1:step;
      world.ecology.set(body.id,{body,weight,sources:new Map()});
      body.ecologyOpacity=smoothGravityWeight(weight);
    }
  }
  // Bodies outside the simulation pool are absent from the moving backdrop.
  for (const body of candidates.values()) if (!world.ecology.has(body.id)) body.ecologyOpacity=0;
  return [...world.ecology.values()].filter(entry=>entry.weight>0||wanted.has(entry.body.id)).map(entry=>entry.body);
}

function ecologyGravity(body) {
  const entry=world.ecology.get(body.id), selected=ecologySources(body);
  if (!entry || !isGravityResponder(body)) return selected;
  const ids=new Set(selected.map(source=>source.id));
  const step=SIMULATION_STEP_SECONDS/GRAVITY_SOURCE_FADE_SECONDS;
  for (const [id,source] of entry.sources) {
    source.activation=constrain(source.activation+(ids.has(id)?step:-step),0,1);
    if ((!ids.has(id)&&source.activation===0)||!residentBody(source.body)) entry.sources.delete(id);
  }
  for (const source of selected) if (!entry.sources.has(source.id) && entry.sources.size<ECOLOGY_SOURCES_PER_CELL*2) {
    entry.sources.set(source.id,{body:source,activation:entry.weight===1||world.localBodyIds.has(body.id)?1:Math.min(1,step)});
  }
  return [...entry.sources.values()].map(source=>({body:source.body,weight:smoothGravityWeight(source.activation)}));
}

function debrisRenderRadius(body) {
  if (body.mergeFromRadius===undefined) return body.r;
  const t=smoothGravityWeight((runTick-body.mergeAtTick)/DEBRIS_MERGE_FADE_TICKS);
  return body.mergeFromRadius+(body.r-body.mergeFromRadius)*t;
}

function tryMergeDebris(a,b) {
  if (runTick%DEBRIS_MERGE_INTERVAL_TICKS || (world.ecologyStats.merges??0)>=DEBRIS_MAX_MERGES_PER_TICK ||
      !isLooseDebris(a)||!isLooseDebris(b)||a.ownerId!==b.ownerId||a.originId!==b.originId ||
      Math.hypot(a.x-b.x,a.y-b.y)>a.r+b.r+ECOLOGY_SURFACE_CLEARANCE ||
      a.r>DEBRIS_MERGE_MAX_RADIUS||b.r>DEBRIS_MERGE_MAX_RADIUS ||
      runTick-(a.bornAtTick??runTick)<DEBRIS_MERGE_AGE_TICKS || runTick-(b.bornAtTick??runTick)<DEBRIS_MERGE_AGE_TICKS ||
      a.mass+b.mass>massForRadius(DEBRIS_MERGED_MAX_RADIUS) || Math.hypot(a.vx-b.vx,a.vy-b.vy)>DEBRIS_MERGE_MAX_SPEED) return false;
  const visible=isBodyVisible(a)&&backgroundBodyOpacity(a)>0 || isBodyVisible(b)&&backgroundBodyOpacity(b)>0;
  if (visible && world.mergeGhosts.length>=DEBRIS_MAX_MERGE_GHOSTS) return false;
  const keeper=a.id.localeCompare(b.id)<0?a:b, donor=keeper===a?b:a;
  const total=keeper.mass+donor.mass;
  keeper.mergeFromRadius=debrisRenderRadius(keeper);keeper.mergeAtTick=runTick;
  keeper.vx=(keeper.vx*keeper.mass+donor.vx*donor.mass)/total;
  keeper.vy=(keeper.vy*keeper.mass+donor.vy*donor.mass)/total;
  if (visible) world.mergeGhosts.push({body:{...donor,mass:0},untilTick:runTick+DEBRIS_MERGE_FADE_TICKS});
  setBodyMass(keeper,total); consumeWorldBody(donor);
  storeWorldBody(world,keeper);world.ecologyStats.merges=(world.ecologyStats.merges??0)+1;
  return true;
}

function resolveEcologyContacts(bodies, starts) {
  world.contactBodies=bodies;
  const size=ECOLOGY_COLLISION_CELL_SIZE;
  for (let pass=0;pass<ECOLOGY_CONTACT_PASSES;pass++) {
    const cells=new Map(), giants=[];
    for(const body of bodies) {
      if (!residentBody(body)) continue;
      const start=pass===0?starts.get(body.id):body;
      const minX=Math.floor((Math.min(body.x,start.x)-body.r)/size),maxX=Math.floor((Math.max(body.x,start.x)+body.r)/size);
      const minY=Math.floor((Math.min(body.y,start.y)-body.r)/size),maxY=Math.floor((Math.max(body.y,start.y)+body.r)/size);
      if((maxX-minX+1)*(maxY-minY+1)>256) {giants.push(body);continue;}
      for(let y=minY;y<=maxY;y++) for(let x=minX;x<=maxX;x++) {
        const key=regionKey(x,y);if(!cells.has(key))cells.set(key,[]);cells.get(key).push(body);
      }
    }
    const seen=new Set(), contacts=[];
    const consider=(a,b)=>{
      if (a===b||!residentBody(a)||!residentBody(b)) return;
      const key=contactPairKey(a,b);if(seen.has(key))return;seen.add(key);
      if (world.ecologyStats.pairChecks>=ECOLOGY_MAX_PAIR_CHECKS)return;
      world.ecologyStats.pairChecks++;
      const contact=sweptBodyContact(a,pass===0?starts.get(a.id):a,b,pass===0?starts.get(b.id):b);
      if(!contact)return;
      contacts.push({a,b,contact,key});
    };
    const lists=[...cells.values()];
    // Rotate crowded buckets so the fixed check budget does not starve one pair.
    const offset=lists.length?runTick%lists.length:0;
    for(let i=0;i<lists.length && world.ecologyStats.pairChecks<ECOLOGY_MAX_PAIR_CHECKS;i++) {
      const list=lists[(i+offset)%lists.length];
      const bodyOffset=list.length?(runTick*31+pass*7)%list.length:0;
      for(let a=0;a<list.length && world.ecologyStats.pairChecks<ECOLOGY_MAX_PAIR_CHECKS;a++)
        for(let b=a+1;b<list.length && world.ecologyStats.pairChecks<ECOLOGY_MAX_PAIR_CHECKS;b++)
          consider(list[(a+bodyOffset)%list.length],list[(b+bodyOffset)%list.length]);
    }
    for(const giant of giants)for(const body of bodies){if(world.ecologyStats.pairChecks>=ECOLOGY_MAX_PAIR_CHECKS)break;consider(giant,body);}
    contacts.sort((a,b)=>a.contact.time-b.contact.time||a.key.localeCompare(b.key));
    const changed=new Set();
    for(const entry of contacts) {
      let {a,b,contact}=entry;
      if(!residentBody(a)||!residentBody(b))continue;
      if((a===player||b===player)&&gameState!=='playing')continue;
      if(changed.has(a.id)||changed.has(b.id)) {
        contact=sweptBodyContact(a,a,b,b);if(!contact)continue;
      }
      world.ecologyStats.contacts++;
      if(isLooseDebris(a)&&isLooseDebris(b)){if(tryMergeDebris(a,b)){changed.add(a.id);changed.add(b.id);}continue;}
      // Keep player event fields oriented consistently for HUD/ownership handling.
      if(b===player){const swap=a;a=b;b=swap;contact={...contact,ax:contact.bx,ay:contact.by,bx:contact.ax,by:contact.ay,nx:-contact.nx,ny:-contact.ny};}
      const result=resolveBodyImpact(a,b,contact);
      if(a===player) handlePlayerContact(b,result);
      // Fresh ejecta joins the remaining contact passes immediately; it never
      // needs a solid collision or a later ecology refresh to become collectible.
      for (const shard of result.kind === 'fragmented' ? result.debris : []) {
        bodies.push(shard); starts.set(shard.id,{x:shard.x,y:shard.y});
      }
      changed.add(a.id);changed.add(b.id);
    }
  }
  world.contactBodies=null;
}

function handlePlayerContact(body,result) {
  if(result.kind==='fragmented') {
    impactNotification={text:(result.strength<0.35?'Glancing':'Hard')+' hit: you -'+
      Math.round(100*result.lossA/(player.mass+result.lossA))+'%, target -'+
      Math.round(100*result.lossB/(body.mass+result.lossB))+'%',expiresAtTick:runTick+EVOLUTION_NOTICE_TICKS};
  } else if(result.kind==='collected' || result.kind==='absorbed') {
    if (result.collector === player) {updatePlayerEvolution();score++;}
    else if (result.consumed === player) gameState='gameover';
  }
}

function drawMergeGhosts() {
  for(const ghost of world.mergeGhosts) {
    if(!isBodyVisible(ghost.body))continue;
    const alpha=constrain((ghost.untilTick-runTick)/DEBRIS_MERGE_FADE_TICKS,0,1);
    push();drawingContext.globalAlpha*=alpha*backgroundBodyOpacity(ghost.body);
    drawBody(ghost.body,false,false);pop();
  }
}
