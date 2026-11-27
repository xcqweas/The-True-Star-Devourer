# The True Star Devourer

A p5.js browser game about eating smaller bodies and avoiding larger ones.

## Run and controls

Serve this folder with a local web server (for example VS Code Live Server or
`python -m http.server 8000 --bind 127.0.0.1`) and open `index.html`.
p5.js and the menu font currently load from external CDNs, so initial loading
requires network access. The repository has no build step or new dependencies.

- SPACE starts or begins a fresh run after death or the ending. Evolution needs no keypress.
- LEFT/RIGHT changes difficulty in the menu.
- Move the mouse in a direction from the screen center to steer. Distance controls
  target speed: a 12-pixel dead zone brakes, and 180 pixels reaches full strength.
- The player remains centered. Steering accelerates toward the requested velocity,
  with a drive component capped at 1200 world units/second and 6000 world units/second
  squared. Gravity drift adds to this velocity, allowing boosts above the drive cap.
  Centering the mouse brakes drift; steer outward to escape a gravity source.
- Eat a body with a strictly smaller radius to absorb mass and gain one point.
  Equal or larger bodies kill the player, regardless of their type. Thin green rims
  mean edible; red rims mean lethal, including equal sizes, on every difficulty.
  Easy difficulties retain extra pulsing rings/glows. Score counts meals; it does not control evolution.
- Red edge arrows warn of relevant dangerous moons/planets. Cyan arrows show the
  actual net gravitational pull, not a steering target. The menu includes this legend.

## Continuous growth and evolution

All physical bodies share the configurable relationship
`mass = MASS_SCALE * radius ** MASS_RADIUS_EXPONENT`. The defaults are scale 1 and
exponent 2, representing constant-density area in this 2D game: mass equals radius
squared, and radius equals the square root of mass. Types do not introduce different
densities. New procedural and fixture bodies derive their mass from their radius;
the player starts at mass 400 (radius 20).

Each meal adds `prey.mass * CONSUMPTION_MASS_GAIN / difficultyFactor` to player mass,
then recomputes physical radius. The default gain is 1: Normal absorbs 100% of prey
mass, with easier/harder presets increasing/decreasing this amount. At Normal,
eating a radius-15 body at radius 20 grows the player to radius 25. Appropriate prey
therefore gives noticeable growth; tiny prey still gives its smaller mass contribution.

`js/constants.js` defines the positive mass scale/exponent, absorption gain, ordered
`EVOLUTION_FORMS` mass thresholds, final threshold, and notification duration:

| Milestone | Total mass | Radius with default mass law |
| --- | ---: | ---: |
| Asteroid (start) | 400 | 20 |
| Moon | 14,400 | 120 |
| Planet | 1,440,000 | 1,200 |
| True Star Devourer (ending) | 4,000,000 | 2,000 |

Keep thresholds increasing and the final threshold above the Planet threshold.
Retune thresholds when changing the mass law. Form thresholds are cosmetic changes;
they never add mass or snap radius to a new size. Excess mass is retained, including
when a meal crosses multiple configured thresholds. Moon form is near the smallest
generated moons, and Planet form is near the smallest generated planets; the strict
relative-radius eating rule still applies at every form.

Evolution changes only the player's type and stored shape. Position, velocity,
acceleration, angle, mass, score, elapsed ticks, camera zoom, world seed, world objects,
and consumed records continue through each change. Other objects keep their types.
A three-second simulation-time notification appears while gameplay continues.
The HUD shows current form, mass, and progress through the current mass interval
toward the next form or final goal. Only the final mass milestone opens the ending.
Death/ending restart clears growth, notifications, score, time, and world records,
keeps the selected difficulty, and chooses a new seed unless a URL seed is pinned.

## World and simulation

Physical positions/radii use world units; velocities use units/second and rotation
uses radians/second. Simulation still runs at exactly 60 ticks/second with relative
swept-circle collision detection. Catch-up after a suspended tab is capped at 250 ms.
The camera keeps the player centered and gradually pulls back as it grows. Resizing
changes the viewport/visual coverage without moving or resizing physical objects,
resetting zoom, or clearing the trail. The HUD and evolution notices draw in screen
coordinates after the world.

## Camera and movement cues

Camera tuning lives in `js/constants.js`. The default target is
`clamp((64 / max(radius, 64)) ** 0.75, 0.1, 1)` pixels per world unit. The player grows
from radius 20 to 64 at full zoom before the camera starts pulling back. The exponent
below 1 also retains apparent growth after zoom settles. Exponential easing uses
`1 - exp(-0.9 * elapsedSeconds)`, so new mass is visibly larger first and the camera
reveals more space over the following seconds. Long frame deltas share the 250 ms
catch-up cap. `CAMERA_MIN_ZOOM`, `CAMERA_MAX_ZOOM`, `CAMERA_REFERENCE_RADIUS`,
`CAMERA_GROWTH_EXPONENT`, and `CAMERA_ZOOM_RESPONSE` are configurable.

Zoom is only a rendering transform. Physical positions, radius/mass, velocities,
acceleration inputs, eating/death rules, and swept collisions do not use current zoom.
Mouse direction and throttle still use screen pixels from the center, so steering
strength is consistent across zoom levels. Camera easing does not change simulation.

Two seeded layers of dim blue cross-shaped background stars move at different depths.
They are decoration, visually distinct from solid interactive bodies and their threat
outlines. A faint blue trail stores recent world-space player positions,
fades over 1.6 seconds of simulation time, and stops emitting at rest. Neither effect
consumes the world generator's random stream or participates in collision detection.

## Selective gameplay gravity

Moons and planets emit configurable fields; the player never emits gravity, even
after evolving. The player and asteroids up to radius 80 respond to fields. Massive
bodies follow their prescribed velocities, without mutual gravitational reactions.
Default generated moons and planets are stationary.

All parameters are centralized in `js/constants.js`. Defaults:

| Parameter | Value |
| --- | --- |
| Gravity strength `GRAVITY_G` | 500 |
| Moon strength / reach beyond surface | 0.3 / 1000 world units |
| Planet strength / reach beyond surface | 1 / 3600 world units |
| Maximum center-to-receiver influence | 6000 world units |
| Softening length | max(40, half the source radius) |
| Radial fade | smoothstep over outer 35% of influence |
| Acceleration cap, per source / combined | 500 / 700 world units/second squared |
| Gravity-generated small-body speed limit | 2000 world units/second |
| Selected / outgoing fading source budgets | 64 / 64 |
| Source warmup margin / transition time | 1024 world units / 0.35 seconds |

The acceleration is proportional to
`G * source.mass * typeStrength * delta / (distanceSquared + softeningSquared) ** 1.5`,
multiplied by the radial fade and then capped. It is zero at the exact center and at
or beyond the influence boundary. Acceleration does not depend on receiver mass.
Each physical tick queries sources, accumulates every body's acceleration from the
same tick-start positions, then integrates each body exactly once using semi-implicit
Euler. Relative swept-circle tests still resolve player collisions after integration.
Eating, death, score, and evolution rules are unchanged.

Steering controls a drive velocity, while a separate drift component accumulates
gravity and external acceleration. Drift damping ranges from 0.12/second at full
throttle to 2.4/second at the center, with a smooth throttle blend. Drift is limited
to 1000 world units/second, so total player speed is bounded by 2200 without clipping
every boost at the 1200-unit drive limit. Center braking does not hover against an
active field; counter-steer to hold position. Full outward drive retains 200 units/second
of headroom over maximum drift, but acceleration/braking distance still matters. Tests
demonstrate a safe close pass and outward escapes from near-surface inward drift,
including the maximum permitted drift speed.

Source queries use persistent world buckets, independently of the local simulation
list and camera zoom. Generation coverage includes the largest influence plus warmup
margin. Offscreen sources therefore stay available when their fields matter. Cache
weights smoothly transition when sources enter/leave the budget, including in crowded
fields. Prescribed sources in that cache also integrate once per tick, even offscreen.
Beyond both physical activation and relevant source coverage they freeze and resume
without offline catch-up. Eaten sources are removed from both the field cache and world.

## Hazard readability

`js/hazards.js` queries resident world buckets rather than just rendered/active objects.
It can warn about a dangerous moon/planet with its center and surface still offscreen.
For each body it computes surface gap (`center distance - both radii`) and relative
radial closing speed. Warning range adds a radius-based clearance, reaction distance,
`closingSpeed ** 2 / (2 * warningDeceleration)`, and a capped allowance for local pull.
The reaction allowance is 3.2 seconds on Very Easy/Easy and 2.4 seconds otherwise.
All tuning values live with the `HAZARD_*` constants. These are presentation estimates;
they never change forces, collision radii, positions, or activation.

Constant-velocity closest approach suppresses distant tangential/receding hazards;
near surfaces and strong nearby attraction still qualify. Near-surface hazards rank
first, then time to surface, gap, and stable ID. Aligned arrows are deduplicated.
At most three warnings appear on Easy modes, two otherwise, and one arrow without
text on compact viewports. Fixed-pixel arrows/labels avoid each other, the HUD, and
evolution notice. An arrow survives without its label if text cannot fit. When
displaced to make room, an arrow still points toward the body.
The scan is bounded to a 14,000-unit half-window plus player radius and the existing
region-query cap; it creates no regions and uses the generator's existing prewarm.

A single restrained cyan compass arrow uses the player's actual combined gravity
acceleration (including source blending/cancellation), above 45 units/second squared.
Its opacity increases with pull; larger viewports add a Pull/Strong pull label.
It shifts around the inner compass if necessary to avoid UI, keeping its true direction.
HUD/notice backplates preserve contrast against large bodies. Short viewports use
a compact HUD so the screen center stays clear.

## World generation and activation

Regions are 1024 x 1024 world units. A run seed and signed region coordinates determine
layout, identity, shape, and velocity independently of exploration order, viewport,
and run clock. Use `?seed=42` to replay a layout. Difficulty and the existing generator's
namespace (0) stay fixed throughout the run, independent of player form. Timed edge spawning and its
90-second radius ramp have been replaced by spatial generation; small asteroids
remain available as the player grows.

Each region attempts up to ten asteroid placements; approximately 24% also attempt
a moon. A 6144-unit planet cell has a 70% chance of one planet with radius 1200-1800.
Each planet is owned only by the region containing its center. Placement reserves a
300-unit collision clearance at the start, with source influence circles also kept
at least 300 units away from the origin. This leaves the starting player outside all
gravity fields. Placement also keeps at least 1024 units between planet surfaces, and 320
units between other large-body surfaces. Asteroids avoid large-body footprints.
Every placement uses at most 16 attempts and may be skipped if there is no space.
These gaps reserve navigable routes; moving asteroids can subsequently drift through them.

Coverage is prepared for gravity queries and the widest configured zoom, including oversized-body
extent and a 512-unit margin. Thus zooming out reveals existing bodies without changing
world identities or which bodies physically move. Coverage checks visit at most 49 x 49
regions, with newly needed strips generated as the player travels.

Physical activation uses a separate world-space window: half-width/height at least
800/450 units, growing to twice the player's radius, plus the margin and body extent.
At most 1024 local bodies are simulated, prioritizing nearby surfaces, plus at most
128 field-cache sources (deduplicated against local bodies). Bodies outside these
ranges, or beyond the simulation cap, freeze with full state; they can still be visible
at low zoom and resume without offline catch-up when physically near. This policy makes
simulation independent of current zoom, easing speed, and rendering FPS.

Rendering queries the zoomed viewport with body extent, culls offscreen bodies, and
draws at most 1600 bodies plus the player. Nearby bodies and large silhouettes have
priority. At most 256 non-player bodies use full shapes/craters/threat glows per frame;
objects below 2.5 screen-pixel radius and detail-budget overflow use simple solid discs
(with threat outlines). LOD never changes IDs, physical radius, mass, shape data, or motion.
Background work is capped at 140 stars; the trail at 64 samples. All budgets are configurable.

Bodies crossing region boundaries move to their new position bucket without changing
identity. Generated moons and planets have zero translational velocity. Eaten IDs stay recorded,
and evolution keeps this same world for the entire run.

## Deterministic scale fixture

Open `index.html?fixture=scale&seed=42` through your local server. This isolated test
world contains three asteroids, a moon, and a radius-1800 planet centered at (2500, 0).
The planet surface begins 700 units to the right of the start. On a 1600 x 900 viewport
its center is off screen while its surface is visible. Fly above/below it to navigate
around it. The fixture disables procedural generation so the scene stays reproducible.

For camera and movement checks, open `tests/visual-camera.html` through your server.
Its developer-only buttons set test sizes, choose a scale/procedural scene, and cruise
or brake. The page uses the real game scripts, with a status readout for current/target
zoom, generated regions, and simulated bodies. These controls are absent from `index.html`.

Open `tests/visual-gravity.html` for the deterministic One source, Multiple sources,
Close pass, and Escape scenarios shared with Node tests in `tests/gravity-scenarios.js`.
Each replays its recommended inputs and pauses for inspection. Mouse control enables
normal manual steering; Replay resets that scenario. The optional 0.45x overview
changes only the developer page's camera, making offscreen sources easier to inspect.

Open `tests/visual-integration.html` for safe-start, growth/evolution, gravity-pass,
impact, and early-warning stopping points. It shares its mouse-input waypoint route
with Node through `tests/integration-scenario.js`; no mass is granted during that route.
SPACE after death invokes the real fresh-run restart. The panel can collapse for
inspection. `tests/visual-viewport.html` resizes an embedded game's actual browser
viewport between 1100 x 680, 480 x 320, 320 x 560, and 320 x 180 without reloading its world.

## Project structure

- `js/constants.js`: units, steering/generation limits, difficulty, and mass milestones
- `js/game-state.js`: mutable run state and camera
- `js/camera.js`: growth zoom, frame-rate-independent easing, transforms, and visibility
- `js/growth.js`: mass/radius conversion, absorption, evolution, and milestone progress
- `js/bodies.js`: per-type body creation, stored shapes, and rendering
- `js/gravity.js`: source queries/blending, softened fields, force accumulation, integration
- `js/stage-visuals.js`: per-type palettes for the player and independent world bodies
- `js/world.js`: seeded generation, resident buckets, activation, and consumption
- `js/hazards.js`: surface/closing-speed warnings, pull cue, bounded screen-space layout
- `js/movement-visuals.js`: seeded parallax and bounded world-space trail
- `js/spawn-and-init.js`: run options and initialization
- `js/screens.js`: menu and non-gameplay screens
- `js/gameplay.js`: fixed ticks, acceleration, swept collisions, world/HUD rendering
- `js/p5-entry.js`: p5 lifecycle and key controls

`index.html` loads the scripts in dependency order. `sketch.js` is a legacy marker.

## Validation and limits

Run `node --test`. Tests load the same script list as the browser and use p5 math and
drawing stubs. They cover camera centering, steering/braking, world movement, swept
collisions, resize invariance, mixed types/scales, deterministic signed regions,
placement spacing, unique IDs, consumption, dormant state, budgets, menus, mass/radius
consistency (including alternate configurations), milestone boundaries, continuity,
nonblocking notification expiry, offscreen collisions for large players, and restart
behavior. Camera tests cover round-trip coordinates, configurable zoom bounds,
frame-rate-independent easing, resize invariance, matching physical simulation across
zooms, oversized surfaces, LOD/render budgets, trail expiry, and decorative parallax.
Gravity tests cover attraction direction, falloff, center softening, cutoff continuity,
superposition, prescribed motion, offscreen sources, region/budget transitions, force-pass
ordering, one integration per body, safe starts, source consumption, stability, and escape.
World traversal, evolution, and all four gravity scenarios match at 30, 60, and 144
rendering FPS. Hazard tests add exact edible/lethal classification, relative motion,
oversized/offscreen centers, harmless trajectory filtering, difficulty assistance,
priority/clutter limits, layout/contrast bounds, signed seams, and no physical side effects.
The shared integration route completes ten meals, evolves to Moon, safely passes a
planet's field, deliberately impacts, and restarts fresh. It matches exactly at all
three rendering rates (death at tick 846; peak pull about 297.8). A maximum-speed
approach test waits the full 3.2-second reaction allowance before escaping, retaining
over 1500 units of surface clearance. Suspended recovery with fields/warnings still
executes at most 15 ticks. All 88 tests pass.

The streaming stress probe samples 161 positions over 160 region widths, including
negative coordinates, and revisits the consumed body's region. It verifies no duplicate
IDs or resurrection. Observed maxima were 68 active bodies, 27 cached sources, 922
rendered bodies, and one warning; 4404 generated regions held 41,323 resident bodies.
This generation/query/force probe took about 1.1-1.7 seconds on the test host; it is not a
browser frame-time benchmark or a survival playthrough.

Browser checks on the developer fixture confirmed growth before pullback, centered
framing, trails, parallax, procedural region traversal while zooming, low-zoom mixed
scales, and screen-space HUD/notices, with no captured console errors or warnings.
Gravity browser checks confirmed single/multiple fields, a curved close-pass trail,
and manual outward escape until gravity and source-cache counts reached zero, without
a collision or captured console errors/warnings.
Integration browser checks confirmed the early offscreen warning, edible rims,
ten-meal growth, Moon evolution, a safe gravity pass, strong-pull cue near an oversized
surface, death, and SPACE restart with a new seed and cleared score/consumption.
Real embedded viewport resizing kept centered framing and readable HUD/arrows at
480 x 320, 320 x 560, and 320 x 180; compact instructions were checked too. The short
viewport retained both the warning and true-direction pull cue when the HUD occupied
their preferred positions; widening restored their labels. A procedural cruise
loaded 1142 regions and consumed 303 bodies before dying at radius 813.1; its final
active count was 118. The direct integration/camera pages had no captured console
errors/warnings. The iframe resize harness logged one unattributed MutationObserver
error during automation; the repository contains no MutationObserver and the visual
resize checks still completed. Its origin remains unverified.
Natural full-run pacing through Planet/the ending, prolonged browser sessions,
4K/low-end hardware performance, and real browser tab suspension remain unverified
visually; restart/milestones, bounded recovery, physical resize invariance, and budgets
are covered in Node.

The world is generated locally on demand; visited regions, dormant bodies, and eaten
IDs stay in memory until a new world starts. Thus active work is bounded, but session
memory grows with exploration. At extreme viewport sizes/density, the region/render
budgets can omit distant bodies; local-body/source budgets can also approximate crowded
fields. Omitted field contributions blend rather than abruptly switching on/off.
Distant visible movers freeze outside physical activation and relevant source coverage.
Large artificial mass jumps may briefly fill the viewport while zoom eases out.
Warning timing extrapolates current relative motion and local pull; it does not solve
future curved trajectories or guarantee avoidance after arbitrary late inputs.
Crowded/tiny views intentionally omit lower-priority indicators. Colors supplement
shape/position/text for massive hazards, but tiny-body food/danger rims remain color-based.
Scale bands and generation density away from the expanded safe start remain unchanged,
so finding enough moons to reach Planet form can require substantial exploration.
This is selective gameplay gravity, not an orbital-accuracy N-body simulation: forces
are finite-range and capped, steering/drift damping and speed limits dissipate energy,
and sources do not react to receivers. Small bodies do not collide or merge with other
bodies/sources and may pass through their interiors. Source removal takes effect in
the next force pass. Tight orbits and long-run energy conservation are not guaranteed.
There is no disk persistence. Rendering has no interpolation between physical ticks,
so displays above 60 Hz may show fixed-tick stepping.
