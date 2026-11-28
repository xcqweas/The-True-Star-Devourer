function massForRadius(radius) {
  return MASS_SCALE * radius ** MASS_RADIUS_EXPONENT;
}

function radiusForMass(mass) {
  return (mass / MASS_SCALE) ** (1 / MASS_RADIUS_EXPONENT);
}

function bodyRadiusScale(type) { return MASSIVE_PLANET_BRANCHES[type]?.radiusScale ?? 1; }

function isPlanetaryBody(body) { return body.type === "planet" || !!MASSIVE_PLANET_BRANCHES[body.type]; }

function playerFormLabel() {
  return MASSIVE_PLANET_BRANCHES[player.type]?.label ?? EVOLUTION_FORMS[currentFormIndex].label;
}

function setBodyMass(body, mass) {
  body.mass = mass;
  body.r = radiusForMass(mass) * bodyRadiusScale(body.type);
}

function updatePlayerEvolution() {
  if (pendingEvolutionIndex !== null) return;
  let nextIndex = currentFormIndex;
  while (nextIndex + 1 < EVOLUTION_FORMS.length && player.mass >= EVOLUTION_FORMS[nextIndex + 1].mass) {
    if (EVOLUTION_FORMS[nextIndex + 1].choices) break;
    nextIndex++;
  }
  if (nextIndex !== currentFormIndex) {
    currentFormIndex = nextIndex;
    const form = EVOLUTION_FORMS[currentFormIndex];
    player.type = form.type;
    // Only appearance changes. The same player object retains all physical state.
    player.shapeRadius = player.r;
    player.shape = makeShapeForType(form.type, player.r,
      seededRandom(hashSeed(runSeed, "evolution", form.type)));
    evolutionNotification = {
      text: "Evolved into " + form.label + "!",
      expiresAtTick: runTick + EVOLUTION_NOTICE_TICKS
    };
  }
  const next = EVOLUTION_FORMS[currentFormIndex + 1];
  if (next?.choices && player.mass >= next.mass) {
    pendingEvolutionIndex = currentFormIndex + 1;
    gameState = "evolving";
    return;
  }
  if (player.mass >= FINAL_MASS_MILESTONE) gameState = "ending";
}

function choosePlayerEvolution(type) {
  const form = EVOLUTION_FORMS[pendingEvolutionIndex];
  if (gameState !== "evolving" || !form?.choices?.includes(type)) return false;
  currentFormIndex = pendingEvolutionIndex;
  pendingEvolutionIndex = null;
  player.type = type;
  // Preserve the exact mass and the same controlled core; only density changes.
  setBodyMass(player, player.mass);
  player.shapeRadius = player.r;
  player.shape = makeShapeForType(type, player.r, seededRandom(hashSeed(runSeed, "evolution", type)));
  evolutionNotification = { text: "Evolved into " + playerFormLabel() + "!",
    expiresAtTick: runTick + EVOLUTION_NOTICE_TICKS };
  simulationAccumulator = 0; // no catch-up for time spent making the choice
  gameState = "playing";
  updatePlayerEvolution(); // retain overshoot, including a configured final threshold
  return true;
}

function absorbBodyMass(body, collector = player) {
  setBodyMass(collector, collector.mass + body.mass);
}

function getEvolutionProgress() {
  const current = EVOLUTION_FORMS[currentFormIndex];
  const next = EVOLUTION_FORMS[currentFormIndex + 1];
  const nextMass = next ? next.mass : FINAL_MASS_MILESTONE;
  return {
    label: next ? next.label : "True Star Devourer",
    mass: nextMass,
    fraction: constrain((player.mass - current.mass) / (nextMass - current.mass), 0, 1)
  };
}

function formatMass(mass) {
  if (mass >= 1000000) return (mass / 1000000).toFixed(2) + "M";
  if (mass >= 1000) return (mass / 1000).toFixed(1) + "K";
  return Math.round(mass).toString();
}
