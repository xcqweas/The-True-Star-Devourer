function getBodyPalette(body, isPlayer = false) {
  if (isLooseDebris(body)) return { base: color(225, 170, 65), detail: color(110, 65, 30) };
  if (body.type === "moon") {
    if (isPlayer) return { base: color(176, 184, 196), detail: color(128, 138, 150) };
    return { base: color(156, 162, 170), detail: color(108, 116, 124) };
  }
  if (body.type === "planet") {
    const palettes = [
      { base: color(65, 133, 182), detail: color(46, 100, 118) },
      { base: color(183, 114, 78), detail: color(133, 75, 63) },
      { base: color(125, 103, 170), detail: color(87, 76, 130) }
    ];
    return palettes[body.variant];
  }
  if (isPlayer) return { base: color(180, 205, 235), detail: color(130, 155, 185) };
  return { base: color(150, 128, 102), detail: color(105, 88, 68) };
}
