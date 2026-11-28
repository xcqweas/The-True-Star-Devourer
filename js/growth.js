function massForRadius(radius) {
  return MASS_SCALE * radius ** MASS_RADIUS_EXPONENT;
}

function radiusForMass(mass) {
  return (mass / MASS_SCALE) ** (1 / MASS_RADIUS_EXPONENT);
}

function setBodyMass(body, mass) {
  body.mass = mass;
  body.r = radiusForMass(mass);
}

function updatePlayerEvolution() {
  let nextIndex = currentFormIndex;
  while (nextIndex + 1 < EVOLUTION_FORMS.length && player.mass >= EVOLUTION_FORMS[nextIndex + 1].mass) {
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
  if (player.mass >= FINAL_MASS_MILESTONE) gameState = "ending";
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
