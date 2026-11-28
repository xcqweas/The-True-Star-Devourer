# The True Star Devourer

A p5.js browser game about collecting material, surviving impacts, and raiding larger bodies.

## Run and controls

Serve this folder with a local web server (for example VS Code Live Server or
`python -m http.server 8000 --bind 127.0.0.1`) and open `index.html`.
p5.js and the menu font currently load from external CDNs, so initial loading
requires network access. The repository has no build step or new dependencies.

- SPACE starts or begins a fresh run after death or the ending. Moon and Planet
  evolution are automatic. At 4M mass, press 1 or 2 (or click a card) to choose
  a massive solid planet or gas giant; the simulation pauses for this one choice.
- LEFT/RIGHT changes difficulty in the menu.
- After starting/restarting, hold the cursor within 24 pixels of center for seven
  simulation ticks (about 0.12 seconds) to arm steering. A center ring and prompt
  remain visible until then. A distant menu cursor never starts the drive.
- Move the mouse in a direction from the screen center to steer. The first steering
  input ramps in over 0.4 seconds; waiting at center does not consume that ramp. Distance controls
  target speed: a 12-pixel dead zone brakes, and 180 pixels reaches full strength.
- The player remains centered. Steering accelerates toward the requested velocity,
  with opening drive capped at 1080 world units/second and acceleration at 6000 world
  units/second squared. Both scale smoothly with physical size to retain apparent travel.
  Gravity drift adds to this velocity, allowing boosts above the drive cap.
  Centering the mouse brakes drift; steer outward to escape a gravity source.
- With either intact body below Moon mass, the larger absorbs the smaller;
  equal small bodies separate. At Moon mass, a 3:1 mass ratio permits direct
  feeding; comparable moons fragment. Encounters involving a planetary emitter
  retain a 64:1 threshold, preserving risky raids. These rules apply
  equally to the player and ambient bodies. Loose gold shards are edible at any mass.
  Rims show relative physical radius: green smaller, yellow similar (0.8–1.25 times
  the player's radius), red larger. Eligibility, form and escape protection do not change colors.
  A white player ring marks brief escape protection. Easy modes retain extra assistance.
  Score counts collected meals/shards; it does not control evolution.
- Red edge arrows warn of relevant dangerous moons/planets. Cyan arrows show the
  actual net gravitational pull, not a steering target. The menu includes this legend.

## Continuous growth and evolution

Bodies use the configurable base relationship
`mass = MASS_SCALE * (radius / radiusScale) ** MASS_RADIUS_EXPONENT`. The defaults
are scale 1 and exponent 2, representing area in this 2D game. Asteroids, moons,
ordinary planets and loose debris have radiusScale 1. The new massive solid and
gas branches use 0.85 and 1.4 respectively, giving different physical densities
at identical mass. `massForRadius` / `radiusForMass` describe the base law;
constructors and `setBodyMass` apply the body's configured radiusScale.
The player starts at mass 400 (radius 20).

Each absorption transfers the consumed body's exact mass to its collector, then
recomputes physical radius. This conserves mass for player and ambient collectors
at every difficulty; difficulty still controls generated food sizes and assistance.
Eating a radius-15 body at radius 20 grows the player to radius 25. Appropriate prey
therefore gives noticeable growth; tiny prey still gives its smaller mass contribution.

`js/constants.js` defines the positive mass scale/exponent, absorption ratios, ordered
`EVOLUTION_FORMS` mass thresholds, final threshold, and notification duration:

| Milestone | Total mass | Radius with default mass law |
| --- | ---: | ---: |
| Asteroid (start) | 400 | 20 |
| Moon | 14,400 | 120 |
| Planet | 810,000 | 900 |
| Massive planet choice | 4,000,000 | Solid 1,700 / gas 2,800 |
| True Star Devourer (ending) | 16,000,000 | Solid 3,400 / gas 5,600 |

Keep thresholds increasing and the final threshold above the massive-planet threshold.
Retune thresholds when changing the mass law. Automatic form thresholds change appearance;
the massive-planet choice also changes physical density and impact retention.
Evolution never adds mass. Excess mass is retained, including
when a meal crosses multiple configured thresholds. Moon form is near the smallest
generated moons. Physical mass and the body's emitter profile determine interaction
eligibility; form appearance retains the highest milestone
already reached when mass is lost. It never grants mass or changes ownership.
Planet form now starts below the size of generated planets. Moon's required gain
is 795,600 mass, down from 1,425,600; the Asteroid entry/exit are unchanged.

Evolution changes the player's type and stored shape; the new branch also derives
its physical radius from the same preserved mass. Position, velocity,
acceleration, angle, mass, score, elapsed ticks, camera zoom, world seed, world objects,
and consumed records continue through each change. Other objects keep their types.
A three-second simulation-time notification appears while gameplay continues.
The HUD shows current form, mass, and progress through the current mass interval
toward the next form or final goal. Only the final mass milestone opens the ending.
Death/ending restart clears growth, notifications, score, time, and world records,
keeps the selected difficulty, and chooses a new seed unless a URL seed is pinned.

### Massive-planet tuning

`MASSIVE_PLANET_STAGE` keeps the 4M entry, 16M victory, target mass range and spawn
chance together in `js/constants.js`. `MASSIVE_PLANET_BRANCHES` defines the branch
labels, radius scales, loss scales and choice descriptions. The branch persists
after damage, cannot be switched, and resets on a fresh run. Selection retains
the same player/core, mass (including overshoot), world, consumed IDs, motion,
score, tick, steering state and current camera zoom. Paused wall time is discarded.

| Branch | Radius at equal mass | Collision loss multiplier | Appearance |
| --- | ---: | ---: | --- |
| Massive solid planet | 0.85x base | 0.60x | Rust-colored crust, dark craters, bright fault lines |
| Gas giant | 1.40x base | 1.35x | Gold atmosphere, horizontal bands, red storm |

The gas giant's diameter/sweep is about 65% wider than the solid's; the solid's
smaller footprint is harder to hit but collects less scattered material. At an
equal-mass reference-speed impact, the unmodified loss is 39.19%, solid loses
23.51%, and gas loses 52.91%. Existing loss caps and largest-own-core guarantees
still apply. Debris has ordinary density and inherits ownership, not branch traits.
All intact feeding thresholds continue to use mass; rim colors continue to use
actual physical radius, even when a green target still requires a risky raid.

24% of occupied planetary cells become a seeded massive solid or gas target with
4M–6.4M mass. With 60% planet-cell occupancy, that is about one late target per
seven 24,576-unit cells. This replaces a sparse subset of planetary landmarks,
preserves ordinary planet sizes and keeps existing system moons useful as food.
The larger footprint reserves room for its moons and inter-system approach gap.
These targets exist throughout the run and never respawn or resize on evolution.
They retain planetary emitter/64:1 feeding behavior; the player remains a receiver.
Ordinary planets and repeated raids also contribute substantial gains. The new
stage requires another 12M mass, so a single configured late target cannot end it.

Camera minimum zoom is 0.003 and maximum movement scale is 64. At 16M mass, settled
solid/gas zoom is 0.007224 / 0.004474, with player screen radii about 24.6 / 25.1 px.
Both retain 300 px/s full-drive travel and the existing acceleration/braking response.
Large-body spatial margins, background rendering, gravity profiles and warnings
include both branches. Player contact candidates receive budget priority before
ambient grid work; actual resolution still sorts all candidates by contact time.

## Impacts and collision debris

`js/collisions.js` provides shared swept-contact geometry and body-pair resolution.
Player and ambient encounters use the same fragmentation and debris collection
resolver. A spatial broadphase tests swept contacts, sorts them by contact time,
and uses stable IDs for ties, so competing collectors cannot duplicate a meal.

Two cohesive bodies at or above `FRAGMENTATION_MIN_MASS` shed mass below the direct
absorption ratio. `ABSORPTION_MOON_MASS_RATIO` defaults to 3:1 inclusive, equivalent
to a 1.73:1 radius ratio with the default mass law. Pairs involving a planetary
emitter use `ABSORPTION_LARGE_MASS_RATIO`, still 64:1. The stored emitter profile,
independent of the gravity enable switch, identifies these planets. Cosmetic player
evolution does not raise its feeding threshold; the player never becomes an emitter.
Both player and ambient pairs use this same property-based rule. The minimum
cohesive mass defaults to the Moon milestone, 14,400 (radius 120 under the default mass law).
The retained core keeps the same object, ID, origin, owner, form, and controls.
Each parent's five loose pieces inherit its origin/owner metadata. The core remains
larger than any one of its own pieces, including with aggressive loss tuning; the
player never takes control of an enemy's larger shard.

Loss fractions use relative normal closing speed, so a fast head-on hit costs more
than a slow or glancing hit. Let
`s = clamp(normalSpeed / (900 * movementScale), 0, 1)`. `movementScale` is the maximum
of the participants' control-speed multipliers (1 for unscaled ambient bodies).
For each body:

`comparableLoss = (0.08 + 0.36*s) * (1 + 0.35) * 0.5^0.6`

`lossFraction = clamp(comparableLoss * (otherMass / ownMass)^0.6 * impactLossScale, 0, maxLoss)`

`impactLossScale` is 1 for ordinary bodies, 0.6 for massive solids and 1.35 for gas giants.

`retainedMass = ownMass * (1 - lossFraction)`

Each participant resolves its own retained mass. Increasing disparity raises the
smaller participant's fractional loss and lowers the larger participant's loss.
At reference speed, 1:1 loses 39.19% each; at 4:1, the smaller loses 80% and the larger
17.06%. The default fraction cap is 0.8. A further cap derived from available
piece count always keeps each own core largest. Slow contact can shed a small
amount; normal impact strength saturates at the scaled reference speed. Equal
proportions of available drive retain equal severity as player movement scales;
faster head-on hits remain more damaging than slow/glancing hits. NPC-only impacts
retain their existing 900-unit reference.

Surviving cores plus ejecta exactly partition each parent's original mass, with the
last piece taking the floating-point remainder. Debris, shed cores and intact bodies
transfer their actual remaining mass at every difficulty. Shards are gold angular
polygons with crack marks and size-colored rims, including at low detail and
Moon/Planet masses. They never emit gravity.

The resolver places remnants at swept entry positions, separates their surfaces,
and gives them an outward impulse. The touching surfaces define an impact point
before either body shrinks. Debris spreads into two lateral lobes around that point,
outside both surviving cores and other new pieces, along the larger body's near face.
Neither player identity nor the faster body's absolute world velocity anchors the
cloud. Placement has bounded retries and an exterior fallback. Pair contact records
prevent a sustained overlap from generating more debris, even after protection
expires. A pair rearms only after separation and the configured minimum interval.
Additional overlapping bodies cannot immediately kill a protected survivor.
Hit notices show the player's and target's loss percentages; normal steering remains
available immediately. Impacts do not reset camera zoom or pause the simulation.

All tuning lives alongside the existing constants in `js/constants.js`:

| Tuning | Default |
| --- | --- |
| Minimum cohesive mass | Moon milestone, 14,400 |
| Sub-Moon / Moon / planetary-emitter absorption mass ratios | Strictly greater than 1 / at least 3 / at least 64 |
| Similar-size rim band | 0.8–1.25 times player radius (`OUTLINE_SIMILAR_RADIUS_RATIO = 1.25`) |
| Normal impact reference speed | 900 world units/second, multiplied by control-speed scale |
| Base / speed loss / comparable bonus / mass bias | 0.08 / 0.36 / 0.35 / 0.6 |
| Maximum fraction / pieces per participant | 0.8 / 5 |
| Surface separation / outward relative speed | 60 units / 240 units/second |
| Escape protection / minimum rearm interval | 2.5 / 1.5 seconds |
| Rearm surface gap | More than 100 units |
| Ejection speed / drag / surface spacing | 100 units/second / 2 per second / 16 units |
| Owned source recovery / other collectors / neutral source reclaim | 0.2 / 0 / 20 seconds |
| Gravity delay | 20 seconds |
| Full debris visibility / fade to normal density | First 20 seconds / following 2 seconds |

Debris has no destructive expiry timer. Drag keeps it near the impact site, and gravity
starts after the collection window. Every collector uses the same eligibility policy:
the owned source body recovers its material after 0.2 seconds; a neutral source body
waits twenty seconds. Every other collector, including allies, can collect immediately
on contact. Source identity uses `parentId`, with origin fallback for legacy fixtures.
The source recovery timer is independent of the configurable public opening time.
Eligible shards transfer before any surface impulse, including during the impact tick's
remaining contact passes. Only source-protected or explicitly delayed shards separate
from a surface while waiting. After highlighting expires, normal smooth density rules apply.
Consumed debris stays consumed. Falling below Moon mass makes the next unprotected
large-body strike lethal, so collecting material and choosing an escape path matter.

## Ambient ecosystem and debris lifecycle

`js/ecology.js` extends simulation into a fixed physical background window, independent
of zoom and rendering FPS. Nearby interaction keeps priority. Background candidates
refresh every six ticks, with stable identity-based selection and a 0.6-second fade;
selected and fading actors continue receiving forces and resolving contacts. Small
inactive movers are hidden before retiring. Large intact silhouettes remain readable.
An indexed source query follows each ambient actor rather than borrowing the player's
field selection. Source discovery is cached locally, source weights blend over the
existing 0.35 seconds, and forces still use tick-start positions. Thus visible nearby
material already responds to a distant emitter before the player arrives.

A world index tracks moving intact Moon-mass bodies and previously broken cores,
including sub-Moon remnants. Sixty-four stable continuity slots keep them awake
independently of the player's position; additional movers have priority in the
existing background pool. Their nearby collision targets and field responders join
background selection using resident spatial buckets and a short motion lookahead.
Thus recoil and nearby encounters continue after departure, even outside the player's
local/source caches. Current-position indices also keep a moving planet renderable
and queryable after it leaves its original generated cell. Each body still integrates
once per fixed tick; camera zoom and rendering cadence do not choose continuity slots.

Player and ambient bodies use the same absorption, fragmentation and separation policy,
including final contacts before retirement. Absorbable small bodies do not remain on
planetary surfaces. Protected or otherwise non-absorbing contacts separate and give a minimum
180-unit/second outward relative release, retaining 0.08 restitution for harder hits.
Responding bodies receive a 1.25-second hold against the contacted emitter's
gravity, followed by a smooth 0.5-second return. Other emitters still attract them;
normal steering remains available. This prevents surface-resting stacks while protecting
fresh source material. Two intact large bodies use the same disparity-dependent
absorption or shedding rules. Three bounded contact passes also
handle overlap after a collector grows. Crowded buckets rotate their scan order to
avoid repeatedly spending the entire check budget on the same pairs.

Old debris remains eligible for background simulation after the player leaves. Nearby
emitters join that retirement work so the old cloud can be attracted and collected.
Tiny shards can merge only after twenty seconds, while touching, at low relative speed,
and with matching origin and ownership. Input radii are at most 24 units and the result
is capped at radius 36. Merging preserves mass and the gold fragment classification;
it never creates an intact moon. A donor fades for 0.5 seconds while its recipient's
rendered radius eases to the new physical radius. These visual ghosts contain no mass
and cannot collide or be collected.

Hard limits favor deferred work over disappearing material. With no debris slots,
large contacts resolve their surfaces and defer additional shedding; they never remove
mass or allocate an unbounded particle burst. Available capacity can reduce pieces
per participant, with the existing largest-core guarantee preserved. Retiring movers
receive a bounded final contact check so they do not freeze inside earlier dormant
bodies. Absorption transfers mass and separation releases surfaces after their fade.

| Ecosystem tuning | Default |
| --- | --- |
| Local / background / additional fading cache slots | 1024 / 128 / 128 |
| Reserved moving-core/source continuity slots / minimum speed | 64 / 0.1 world units/s |
| Background/source discovery refresh | Every 6 ticks |
| Ambient sources per cell / outgoing source weights | 32 / at most 32 |
| Collision cell size / narrow-phase check budget | 256 units / 12,000 per tick |
| Contact passes / fragmentation events | 3 / at most 4 per tick |
| Ordinary surface clearance / restitution | 2 units / 0.08 |
| Minimum surface release speed / contacted-field hold / fade | 180 units/s / 1.25s / 0.5s |
| Maximum live debris | 512 across the run |
| Merge age / input radius / output radius / relative speed | 20s / 24 / 36 / 80 units per second |
| Merge interval / merges / fading donor ghosts | 15 ticks / at most 8 per tick / at most 32 |
| Final retirement checks | At most 8 bodies per tick, 64 neighbors each |

The ecology cache is capped at 1344 entries. Immediate local contacts retain priority
during a dense region handoff; including that temporary local overlap and up to 128
player field-cache sources gives a conservative maximum of 2497 integrated bodies,
including the player. The normal local/background union is much smaller. Generation,
rendering, collision checks, source lists, merge work and debris each retain separate
budgets. Extremely crowded cells can take several ticks to settle completely.

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
`clamp((20 / max(radius, 20)) ** 0.96, 0.003, 1)` pixels per world unit. Pullback begins
with the first growth. Settled player screen radii at physical radii 20, 120, 300,
1200, and 2000 are approximately 20, 21.49, 22.29, 23.56, and 24.05 pixels: about
20% apparent radius growth over 100x physical growth. Screen occupancy scales by
the same ratio at any fixed viewport size. The zoom floor stays below the target
through the final milestone.

Mass and physical radius update immediately on consumption. Zoom never snaps in
response to a meal: `log(zoom)` eases toward `log(target)` using
`1 - exp(-10 * elapsedSeconds)`. This completes 95% of the logarithmic change in
about 0.3 seconds, with the same relative response at small and large scales.
Long frame deltas share the 250 ms catch-up cap. `CAMERA_MIN_ZOOM`,
`CAMERA_MAX_ZOOM`, `CAMERA_REFERENCE_RADIUS`, `CAMERA_GROWTH_EXPONENT`, and
`CAMERA_ZOOM_RESPONSE` remain configurable. Retuning milestones or the mass law
may require lowering the zoom floor further.

The opening drive cap remains 1080, with acceleration 6000 and response 12/second.
`STEERING_ARM_RADIUS`, `STEERING_ARM_HOLD_TICKS`, and `STEERING_ACTIVATION_TICKS`
configure neutral entry and first-input activation. They reset only on a fresh run,
so centering to brake or recovering from an impact does not rearm the entry gate.

Grown movement uses the settled physical-size zoom target, never the current eased
camera zoom. Its multiplier is
`clamp(PLAYER_SCREEN_TRAVEL_SPEED / (PLAYER_MAX_SPEED * targetZoomForRadius(radius)), 1, PLAYER_MAX_MOVEMENT_SCALE)`.
Defaults are 300 screen pixels/second and a maximum multiplier of 64. Drive speed
and acceleration both receive this multiplier; response/braking time stays consistent.
The base speed is a floor, so opening travel slows gradually with growth before
reaching the 300-pixel target. There are no jumps at evolution thresholds.

| Physical radius | Full drive, world units/s | Settled screen travel, pixels/s |
| --- | ---: | ---: |
| 20 | 1080 | 1080 |
| 60 | 1080 | 376 |
| 120 | 1676 | 300 |
| 240 | 3259 | 300 |
| 600 | 7855 | 300 |
| 1000 | 12827 | 300 |
| 1200 | 15281 | 300 |
| 2000 | 24953 | 300 |

The maximum multiplier bounds world speed at extreme size. Gravity/drift remains
in world units and its cap stays 880, retaining at least the opening's 200-unit
outward drive headroom. All movement tuning remains in the existing constants file.

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
Generated moons and planets start stationary; impacts can give them a recoil velocity.

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
Impact resolution runs after this force/integration pass. Reduced source mass affects
the next tick's field; gravity and debris never grant the player a source field.

Steering controls a drive velocity, while a separate drift component accumulates
gravity and external acceleration. Drift damping ranges from 0.12/second at full
throttle to 2.4/second at the center, with a smooth throttle blend. Drift is limited
to 880 world units/second, so total player speed is bounded by 1960 without clipping
every boost at the current drive limit. Center braking does not hover against an
active field; counter-steer to hold position. Full outward drive retains at least 200 units/second
of headroom over maximum drift, but acceleration/braking distance still matters. Tests
demonstrate a safe close pass and outward escapes from near-surface inward drift,
including the maximum permitted drift speed.

Source queries use persistent world buckets and an emitter index, independently of
camera zoom. Generation coverage includes the largest influence plus warmup margin.
Offscreen emitters therefore remain available to nearby simulated material even when
the player is distant. Player and ambient caches blend budget changes separately.
Prescribed sources in the player cache integrate once per tick, even offscreen, and
ambient actors use their own local source lists. Beyond simulation coverage, stored
motion freezes without offline catch-up; an emitter's field remains queryable.
Eaten sources are removed from the field indices and world.

## Hazard readability

`js/hazards.js` queries resident world buckets rather than just rendered/active objects.
It can warn about a dangerous moon/planet with its center and surface still offscreen.
Border warnings are suppressed whenever the body's physical silhouette intersects
the current camera viewport, including a planet whose center is off screen but whose
surface is visible. They resume once that surface leaves view. Geometry is evaluated
from current body positions and current zoom/viewport; no cached spawn-cell bearing
is reused. Consumed movers leave the world, rendering, and warning indices together.
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
The scan retains a minimum 14,000-unit half-window. Grown speed extends its lead
using reaction time, a braking estimate scaled with acceleration, and body clearance.
Far planets use the existing bounded cell index beyond the detailed-region cap;
world prewarm covers this lead even on compact viewports. Warning queries themselves
create no regions, and IDs are deduplicated across both paths.

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

Planetary landmarks use 24,576-unit cells with a 60% chance of one radius-1200–1800
planet (`PLANET_CELL_REGIONS = 24`, `PLANET_CELL_CHANCE = 0.6`). Each has two to four
moons placed in a local system, with surface gaps of 1300–2500 units from its planet.
One unused angular slot leaves a broad approach sector (at least 144 degrees between
neighboring moon-center bearings with the defaults). Moons start stationary; this
arrangement introduces no orbit or new body classification. Complete system extents
stay inset from cell boundaries, reserving at least 6144 units between systems.

Asteroid fields use independent 8192-unit cells, present 70% of the time. A 2400-unit
core and 800-unit falloff blend the density, with bounded center jitter leaving at
least 1024 units between neighboring field extents. Region budgets range from two
asteroid attempts in sparse travel lanes to twenty in field centers. The fixed
opening patch keeps ten attempts around the origin, through radius 2400, then blends
into the regional pattern over 1200 units. Fields are spatial generation choices,
not objects that appear/disappear with zoom. Planetary systems reduce the surrounding
field contribution to 15%, keeping landmark approaches relatively clear.

Independent moons favor asteroid regions: the existing 24% regional chance is
weighted by field density, falling to 8% of that chance in travel lanes. These moons
provide intermediate impact/collection targets; curated system moons provide further
growth opportunities beside the planetary landmarks. Generation remains coordinate
and seed based, with all spatial tuning in `js/constants.js`.
Asteroid radius is `(ASTEROID_MIN_RADIUS + spread * rng() ** 2) * difficulty`, capped
by `MAX_ASTEROID_RADIUS`. The protected opening keeps spread 18, Normal radii 6–24,
and theoretical mean mass 172.8. Beyond a fixed region-center distance of 8000,
spread blends smoothly toward `ASTEROID_OUTER_RADIUS_SPREAD = 42` over 4000 units.
Normal outer radii reach 48 and theoretical mean mass reaches 556.8. Small food
remains mixed in. Density budgets, Moon sizes and planetary placement stay the same.
This is fixed seeded geography: neither player growth nor revisits resize food,
change IDs, or regenerate already resident objects.
Each planet is owned only by the region containing its center. Placement reserves a
300-unit collision clearance at the start, with source influence circles also kept
at least 300 units away from the origin. This leaves the starting player outside all
gravity fields. Placement also keeps at least 6144 units between complete planetary systems, and 320
units between other large-body surfaces. Asteroids avoid large-body footprints.
Every placement uses at most 16 attempts and may be skipped if there is no space.
These gaps reserve navigable routes; moving asteroids can subsequently drift through them.

Detailed regions are prepared for the local simulation and gravity queries, including
oversized-body extent and a 512-unit margin, independently of zoom. Coverage checks
visit at most 49 x 49 regions, with newly needed strips generated as the player travels.
The widest configured view separately prewarms initially stationary planets using their existing
24,576-unit cells, capped at 65 x 65 cells (`MAX_BACKGROUND_CELL_REACH`). This covers the
much wider late-game view without generating thousands of regions of tiny asteroids.
Both paths share the same planet IDs and body objects; approaching a distant planet
preserves its state, and consuming it removes it from both paths. Render queries use
the current cell window rather than scanning all previously visited planet cells.

Physical activation uses a separate world-space window: half-width/height at least
800/450 units, growing to twice the player's radius, plus the margin and body extent.
Up to 1024 local bodies retain interaction priority, with the background/fading pool
and field-cache sources described above, deduplicated before integration. Moving
background detail fades before it retires. Intact large silhouettes and resident fields
remain available beyond the moving-body pool. Physical simulation stays independent
of current zoom, camera easing speed, and rendering FPS.

Rendering queries the zoomed viewport with body extent, culls offscreen bodies, and
draws at most 1600 bodies plus the player. Nearby bodies and large silhouettes have
priority. At most 256 non-player bodies use full shapes/craters/threat glows per frame;
objects below 2.5 screen-pixel radius and detail-budget overflow use simple solid discs
(with threat outlines). LOD never changes IDs, physical radius, mass, shape data, or motion.
Background decoration is capped at 140 stars; the trail at 64 samples. Merging adds
at most 32 simple fading donor ghosts. All budgets are configurable.

Distant physical bodies smoothly fade between screen radii 3 and 0.6 pixels, instead
of accumulating as minimum-size dots at low zoom. Nearby food retains full opacity
within 512 world units of the player's surface, blending to the distant rule over
another 1024 units. Non-planets also fade across the outer 2048 units of detailed
coverage, before new regions become visible. Bodies stay resident and collectible;
fading never consumes or deletes them. Body, rim, and assistance glow share opacity.
`BACKGROUND_*` constants configure these ranges. A separate scale response of 3/second
smooths density changes after sudden growth. Decorative parallax stars are unchanged;
the opening's food generation rate and size distribution are unchanged.

Bodies crossing region boundaries move to their new position bucket without changing
identity. Generated moons and planets begin with zero translational velocity. Eaten IDs stay recorded,
and evolution keeps this same world for the entire run.

## Deterministic scale fixture

Open `index.html?fixture=scale&seed=42` through your local server. This isolated test
world contains three asteroids, a moon, and a radius-1800 planet centered at (2500, 0).
The planet surface begins 700 units to the right of the start. On a 1600 x 900 viewport
its center is off screen while its surface is visible. Fly above/below it to navigate
around it. The fixture disables procedural generation so the scene stays reproducible.

For camera and movement checks, open `tests/visual-camera.html` through your server.
Its developer-only buttons set test sizes, run gradual growth, choose a scale/procedural
scene, and cruise or brake. Neutral start retains the actual cursor position and
uses the real entry gate. Normal foraging runs the shared seed-42 procedural controller
from `tests/pacing-scenario.js`; automated cruise/foraging explicitly starts armed.
The page uses the real game scripts, with a status readout for current/target
zoom, generated regions, simulated/drawn bodies, screen travel, drive limit, steering state, and screen occupancy. These
controls are absent from `index.html`.

Open `tests/visual-gravity.html` for the deterministic One source, Multiple sources,
Close pass, and Escape scenarios shared with Node tests in `tests/gravity-scenarios.js`.
Each replays its recommended inputs and pauses for inspection. Mouse control enables
normal manual steering; Replay resets that scenario. The optional 0.45x overview
changes only the developer page's camera, making offscreen sources easier to inspect.

Open `tests/visual-integration.html` for safe-start, growth/evolution, gravity-pass,
impact-survival, and early-warning stopping points. It shares its mouse-input waypoint route
with Node through `tests/integration-scenario.js`; no mass is granted during that route.
SPACE after death invokes the real fresh-run restart. The panel can collapse for
inspection. `tests/visual-viewport.html` resizes an embedded game's actual browser
viewport between 1100 x 680, 480 x 320, 320 x 560, and 320 x 180 without reloading its world.

Open `tests/visual-fragmentation.html` for Smaller, Comparable, and Larger encounters,
with separate impact, escape, and collection stopping points plus manual mouse control.
Move away continues for ten seconds after collection, with a readout of the target's
speed and simulation residency, so recoil can be inspected after leaving the local pool.
It shares its route with Node in `tests/fragmentation-scenarios.js`. Its readout tracks
current mass, recovered target mass, debris count, and total mass error. These developer
controls are absent from the normal game.

Open `tests/visual-ecology.html` for the Unattended region, Distant entry, and Competing
collectors scenes shared with Node through `tests/ecology-scenarios.js`. The readout
reports mass error, live/peak debris, impacts, simulated bodies, and pair checks.

Open `tests/visual-massive-stage.html` for the paused evolution choice, individual
solid/gas raids, manual mouse control, and an automated route through the 16M ending.
Its panel hides during the choice and reports physical radius,
zoom, mass accounting and encounter timing. These developer controls are absent
from the normal game.

## Project structure

- `js/constants.js`: units, steering/generation limits, difficulty, and mass milestones
- `js/game-state.js`: mutable run state and camera
- `js/camera.js`: growth zoom, frame-rate-independent easing, transforms, and visibility
- `js/growth.js`: mass/radius conversion, absorption, evolution, and milestone progress
- `js/bodies.js`: per-type body creation, stored shapes, and rendering
- `js/gravity.js`: source queries/blending, softened fields, force accumulation, integration
- `js/stage-visuals.js`: per-type palettes for the player and independent world bodies
- `js/world.js`: seeded generation, resident buckets, activation, and consumption
- `js/collisions.js`: shared swept contacts, mass loss, ownership, ejecta, and contact recovery
- `js/ecology.js`: ambient activation/fields, ordered contacts, surfaces, recovery eligibility, and tiny-debris merging
- `js/hazards.js`: surface/closing-speed warnings, pull cue, bounded screen-space layout
- `js/movement-visuals.js`: seeded parallax and bounded world-space trail
- `js/spawn-and-init.js`: run options and initialization
- `js/screens.js`: menu and non-gameplay screens
- `js/gameplay.js`: fixed ticks, acceleration, swept collisions, world/HUD rendering
- `js/p5-entry.js`: p5 lifecycle, key controls and evolution-card mouse input

`index.html` loads the scripts in dependency order. `sketch.js` is a legacy marker.

## Validation and limits

Massive-planet stage (2026-11-27): the pre-change baseline passed all 147 Node tests.
The final `node --test --test-reporter=spec tests/game.test.cjs` run passed all
156 tests, with zero failures/skips (248.5 seconds). Syntax checks also passed for
23 JavaScript files, seven inline scripts and every local script reference;
`git diff --check` passed.
The stage checks cover exact threshold/pause and both keyboard choices, mouse choice,
overshoot, immutable branches after mass loss, restart, branch density and loss,
the wider physical shard sweep, useful moons, mass-based 64:1 planetary feeding,
physical-size rims, deterministic sparse target supply, clearances, streaming IDs,
camera framing and movement/braking through the revised ending. The browser test
page is `tests/visual-massive-stage.html`, sharing its actual steering/impact/collection
route with Node through `tests/massive-stage-scenarios.js`.
Additional checks cover the full debris-capacity aftermath, bounded source fields
and branch rims at both LODs. Both ending routes produce identical physical state,
collected IDs and ending ticks at 30, 60 and 144 rendering FPS.

The isolated Normal route alternates maximum-mass 6.4M gas and solid targets,
preserves old remnants and uses ordinary steering, escape and shard collection.
Solid reached 16.214M in 20.3 simulation seconds across five encounters/five impacts;
gas reached 16.195M in 20.6 seconds across four encounters/five impacts. Peak shard
counts were 10/16 and pair checks 156/228; total mass error stayed below 7.5e-9.
These favorable, close-spaced fixtures validate mechanics and ending reachability,
not average procedural play duration. Supply sampling found 124 late targets among
520 occupied cells over three seeds. Runtime rendering remains unverified for this
pass: Windows denied binding the local server (WinError 10013), including outside
the sandbox, and browser security rejected a direct file preview. Drawing in Node
uses p5 stubs and does not establish visual appearance or browser frame rate.

A one-second full-drive streaming probe in the generated seed-42 world started
at 16M mass, temporarily raising victory to 1e12 only for the probe. Solid/gas
peaks were 1,019/1,007 local bodies, 1,712/1,604 simulated bodies, 8,737/10,148 pair
checks and 416/550 rendered bodies; no debris was generated. Both stayed centered
and inside the existing budgets. They generated 2,850/5,191 regions. Headless
execution took 5.2/8.9 seconds respectively on this host; generation at the expanded
scale is costly in this VM, and these numbers do not establish browser frame rate.

A separate 30-second seed-42 cruise started at 4M mass at (32,000, 16,000), with
already edible material inside the pre-choice planet footprint marked consumed.
It used default victory and ordinary full-right steering without aiming at loot.
Neither branch won: solid ended at 3.669M and gas at 0.457M after incidental hits,
despite 4,556/5,003 collections. This demonstrates the sampled route's collision
cost and gas vulnerability, not average player pacing or a complete natural run.
The existing center-distance gravity cap remains 6,000; sufficiently wide gas
bodies can touch before their centers enter a source's field.

Moon progression tuning (2026-11-27): no test suites were run for this pass.
`tools/inspect-moon-progression.cjs` is a standalone measurement tool that loads the
game scripts directly and never imports a test runner. Use `--before` to reproduce
the previous tuning and `--progression` for the seeded ordinary-input growth routes.
Its snapshots are saved in `tools/moon-progression-before.json`,
`tools/moon-progression-after.json`, `tools/moon-routes-before.json` and
`tools/moon-routes-after.json`. The baseline uses parameter overrides, not a separate
historical executable. The measurements exclude browser rendering and human input.

Opening routes at seeds 1, 42 and 1948 still take 25.65, 25.02 and 22.73 simulated
seconds and 64, 60 and 60 collections respectively. The outer-field samples at
distances 16000 and 32000 average 541–581 mass per asteroid, versus 163–184 before.
Comparable Moon contacts still shed 39.19% at reference speed; pairs just below 3:1
still fragment. At exactly 3:1, intact Moon feeding opens. Planetary raid pairs still
fragment below 64:1, including with the global gravity switch off.

The scripted progression routes continue from actual opening play, with no granted
Moon mass, spawned food, collection multipliers or teleportation. The routing policy
chooses visible-range feeding opportunities, favors safe paths, and permits a useful
slightly larger Moon collision. It steers through ordinary mouse inputs and pauses
feeding to recover nearby impact material. Seeds 1/42/1948 reach Planet in
20.35/30.08/20.35 additional seconds, with 13/15/13 Moon body collections; seed 42 also
has two fragmentation events and a largest single impact loss of 29.71%.
Under the previous tuning, the same routes are still Moon at 45 seconds, at
287,914/256,417/241,060 mass respectively, with eight or nine fragmentation events.
These are efficient scripted runs, not estimates of typical human completion times.

At player radius 240, full recovery from a favorable radius-140 Moon gives a net
14,666 mass in 5.25 seconds after impact (previously 5.88); an equal Moon gives
22,573 in 4.82 seconds (previously 6.55); a radius-1200 planetary raid gives 81,803
in 6.93 seconds (previously 7.92). This includes repayment of the player's own shed
mass; it does not count the whole cloud as profit. Equal-Moon recovery at four
seconds now gives +4,515 net instead of break-even, and the raid at six seconds
gives +39,866 instead of +21,434. A raid still removes 80% of the player's mass at
impact, so its higher possible profit retains a severe temporary survival cost.
All loose pieces remain collectible at any player mass. Encounter mass drift stays
below 3e-10 in these isolated probes. JavaScript syntax checks passed for the game,
probe and relevant fixture scripts, plus inline scripts and local script references
in seven HTML pages. No browser playthrough was performed this pass.

Earlier interaction-rule validation (before Moon progression tuning):

- `node --test --test-isolation=none --test-reporter=spec tests/game.test.cjs`: 147 passed, 0 failed, 0 skipped (157.6 seconds).
- JavaScript syntax checked for 22 script files and inline scripts in seven HTML pages; all local script references exist.
- Browser visual inspection remains unverified because local preview access was blocked, as detailed below.

The interaction-rule pass was inspected before editing. The yellow/amber rim branch
used fragmentation eligibility, so every large target acquired it once the player
reached Moon mass. The old shared severity bonus fell with disparity and its
other/total weighting saturated: full-speed smaller-body losses rose only from
39.19% at equality toward 44% at extreme ratios, leaving a dominant core. The old
global birth/public collection delays sent fresh shards through surface resolution.
Ordinary ambient contact deliberately retained intact food and separated it, while
the player used a separate eat/death path. Retirement only displaced intact overlaps.
The baseline's six-second surface probes already released bodies, so they did not
reproduce permanent resting; the confirmed policy problem was the missing ambient
absorption outcome and inconsistent contact paths.

The earlier regression coverage includes independent core/ejecta partitions, monotonic
fractional loss across disparity, the inclusive 64:1 absorption boundary in both
participant orders, configurable thresholds and mass laws, exact transfer at every
difficulty, impact-tick collection without a surface impulse, source-specific recovery,
and shared player/ambient surface release and retirement. Rim tests exercise physical
radii 20, 119, 120, 240, 1199, 1200 and 1999, all body forms and debris, both LODs,
and retained Planet appearance after mass loss. These use the real simulation and
rendering functions with p5 drawing stubs, not browser screenshots.

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
The shared integration route eats eleven intact meals, evolves to Moon, safely passes a
planet's field, deliberately fragments, and escapes. It matches exactly through 1440
ticks at all three rendering rates (peak pull about 298.9). A maximum-speed
approach test waits the full 3.2-second reaction allowance before escaping, retaining
over 1200 units of surface clearance. Suspended recovery with fields/warnings still
executes at most 15 ticks.

The earlier interaction-rule pass started with 140 passing tests and finished with
147. Neither count is a suite result for the Moon tuning pass. The spatial
composition measurements below are saved generator snapshots that predate the
distant-food size tuning; they have not been regenerated as composition benchmarks.

Current composition inspection uses `node tools/inspect-composition.cjs` (no test
registration or test-suite execution). It samples a 1600 x 900 viewport at physical
radii 20, 120, 300, 600, 1200, and 1999, at three seeds and two fixed world positions
(origin and 32,000 / 16,000), plus fixed-radius camera zooms 1 / 0.1 / 0.03 / 0.01.
Counts include physical silhouettes intersecting the view with nonzero render opacity,
excluding decorative stars; they are static generation snapshots, not travelled runs.

| Player radius | Settled zoom | Mean planets before | Mean planets after |
| --- | ---: | ---: | ---: |
| 20 | 1.0000 | 0.5 | 0 |
| 120 | 0.1791 | 0.7 | 0.2 |
| 300 | 0.0743 | 5.3 | 0.3 |
| 600 | 0.0382 | 20.5 | 0.7 |
| 1200 | 0.0196 | 76.2 | 3.7 |
| 1999 | 0.0120 | 189.8 | 10.8 |

The six sampled late views contain at most fifteen planets, versus two hundred
previously. At fixed radius 600/zoom 0.01, seed 42's distant view drops from 272
planets to sixteen. Nearby opening food remains 56–79 edible objects across six seeds
and three difficulties, matching the prior sampled range without changing food mass.
An inspection of 625 seed-42 regions finds 4256 asteroids, 53 moons, one planet,
no duplicate IDs, wrong owning regions, unsafe starts, or asteroid-clearance violations.
Generation in reverse order reproduces identical IDs/positions/radii. Region budgets
reach two and twenty as intended. Ninety systems across three seeds have two to four
moons each, at least 8587.6 units between their enclosing system extents, and a minimum
planet/moon surface gap of 1300.0 units. These samples check composition and available
targets, not the time required to finish later progression.

Saved counts are in `tools/composition-before.json` and `tools/composition-after.json`.
`tools/composition-comparison.png` compares two fixed views using actual generated
coordinates, radius and opacity; it is a schematic, not a browser screenshot.
Regenerate it with `python tools/render-composition.py` after saving inspection output.
The camera developer page also reports per-type visible body counts.

Game scripts and developer-page inline scripts also receive JavaScript syntax and
local script-reference checks. These are Node simulations with drawing stubs.

Entry/pacing checks use the real SPACE transition with a distant cursor, verify no
drive until a deliberate center hold, test interruption/restart of that hold, and
match activation at 30/60/144 render FPS. The first drive tick reaches only 1.09
world units/s; after first-input activation it reaches 951.8 at 0.4 seconds and
1077.7 at 0.7 seconds. Waiting at center does not use up activation time.

The movement table above is measured with real force accumulation/integration.
At every sampled size, ordinary drive reaches 99.79% of its limit in half a second
and center braking reduces it to 0.21% in another half second. Tests cover continuous
limits across thresholds, rapid growth without an instantaneous velocity jump, and
identical movement with different rendered zooms. Comparable head-on losses remain
39.19%, versus 16.74% at quarter drive, across radii 120, 240, 600, and 1000.
Grown warning/escape probes at radii 120, 600, 1000, and 1900 wait 3.2 seconds before
counter-steering, avoid impacts, and retain at least 611 units of surface clearance;
compact procedural views also prewarm distant planetary warning coverage.

A procedural-food sample across 289 seed-42 regions measures mean asteroid mass
171.45 versus 676.97 with the old spread, with 2816 versus 2806 placements. Consuming
eligible generated samples reaches Moon after 90 versus 32 meals. A separate
seed-42 foraging controller uses actual procedural positions/motion, ordinary mouse
throttle, gravity, ecology, and collisions without injected mass or teleportation.
It reaches Moon after 74 collections in 27.12 simulated seconds, versus 26 collections
in 11.52 seconds with the old food spread and otherwise identical settings. Neither
route has an impact. This is a scripted single-seed comparison, not a prediction of
typical human play time or a guarantee for every seed.

The opening/camera/density baseline adds checks for immediate meal mass with delayed
zoom, consistent relative response across scales, gradual growth at 30/60/144 FPS,
radius-2000 occupancy, and a rapid 20-to-2000 radius jump. The latter falls below
29 screen pixels of radius after one third of a second and below 24.1 after one
second. Once steering is fully activated, drive from rest reaches 1015.6 units/second
after 0.25 seconds; center braking reduces cruising speed below 2.3 after 0.5 seconds. Across six seeds
and three difficulties, each sampled start has at least 56 fully visible edible
bodies within 1600 world units. Fade tests cover continuity, nearby food, opacity
isolation, physical state retention, and distant planet identity/consumption.

Fragmentation validation uses three normal-steering routes starting at mass 57,600
(radius 240). Each creates one impact and ten shards, escapes, collects the cloud,
and finishes with the same player object. Total mass is checked every physical tick
within 1e-12 relative tolerance. Scripted collection results:

| Target | Player mass after impact | Player mass after collection | Completion |
| --- | ---: | ---: | ---: |
| Smaller, radius 140 / mass 19,600 | 45,778.00 | 72,266.43 | 357 ticks |
| Comparable, radius 240 / mass 57,600 | 35,026.91 | 80,173.09 | 397 ticks |
| Larger, radius 1200 / mass 1,440,000 | 11,520.00 | 139,402.57 | 479 ticks |

These demonstrate possible gains with the test waypoint controller, not an average
player outcome. All three routes have identical physical results at 30/60/144 render
FPS. Additional tests cover ownership of each origin, largest-core guarantees, speed
and mass-ratio effects, source shrinkage, duplicate collection, sustained contact and
rearming, ten-second debris accessibility, large-shard polygon/palette render paths,
compact HUD feedback, difficulty-independent collision-material accounting, alternate
mass laws, zero configured loss, high-speed swept entry, recovery near another body,
and death/restart after a remnant falls below the threshold.

Presentation/continuity regressions verify swept impact-point anchoring, placement
outside every core/shard, both lateral lobes, and unchanged shard positions after a
common velocity offset changes which participant is faster in world space. Each
raid continues through ten seconds of actual outward steering after collection.
Targets leave both the local and player-source pools while retaining their expected
coasting positions to within 1e-6 world units. Re-entry probes show no activation jump,
with one impact, original player ownership, and conserved mass throughout. A separate
encounter 30,000 units from the player resolves before the observer approaches.

Six-second surface probes check intact asteroids, protected shards, and broken cores.
Asteroids and broken cores transfer their mass to the planet; source-protected shards
release and reach roughly 126 units of surface clearance. Contacted-field tests cover the hold, smooth return,
and independent attraction from another emitter. Warning tests cover visible surfaces
with offscreen centers, zoom/resize transitions, current-position tracking beyond the
original planet-cell window, single-ID deduplication, and consumed-source removal.
A 104-mover stress case exceeds the 64 reserved slots, keeps all movers progressing
through the background pool, and stays within explicit simulation/contact budgets.

The unattended ecology scene runs 7200 ticks (two minutes) with the player away from
the region. It absorbs all 24 contacted food bodies while preserving total mass
to 1e-11 relative tolerance on every tick, produces one fragmentation event, and
finishes without intact-body penetration. No body registers a resting tick within
four units of the source surface at less than one unit/second normal relative speed.
Peak counts are 60 simulated bodies and 32 debris; 29 merges and later collection
reduce debris to zero. The sample uses at most 1545 pair checks in a tick. These Node
checks exclude browser rendering and do not establish device frame rates.

The distant-entry scene verifies nonzero attraction and fully active field weights
before the player approaches, with the same field weights on entry. Competing
collectors transfer one shard once and may subsequently absorb the smaller rival;
their surviving mass totals exactly 3396. A separate arrival-time
test verifies an earlier NPC contact wins over a later player contact. Tests also cover
two collectors contesting newly shed material from an unattended large-body impact,
provenance-based reclaim windows, protected surface contact, bounded dense handoffs,
full fragment budgets, rejection of unsafe merges, and mass-free fading donor visuals.

The streaming stress probe samples 161 positions over 160 region widths, including
negative coordinates, and revisits the consumed body's region. It verifies no duplicate
IDs or resurrection. Observed maxima were 66 active bodies, 27 cached sources, 332
rendered bodies, and no border warnings (the relevant bodies were visible); 4404 detailed regions held 41,966 resident bodies,
including the distant planets. This probe uses settled minimum zoom/density.
The generation/query/force probe took about 3.0-3.6 seconds on the test host; it is not a
browser frame-time benchmark or a survival playthrough.

Browser visual validation for the earlier interaction-rule pass could not complete: the browser blocked the local
preview (`ERR_BLOCKED_BY_CLIENT`), and the local server could not bind a socket
(`WinError 10013`), including with an execution escalation. The browser evidence
below belongs to an earlier baseline and has not been repeated for these changes.

Earlier browser checks on the developer fixture confirmed growth before pullback, centered
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
Small moving detail fades before leaving the bounded simulation pool. Moving cores
and sources now retain reserved continuity slots outside player coverage, with other
movers competing for the background pool. Pathological counts exceeding both pools
can still defer actors/interactions. Continuity follows already generated resident
neighborhoods; it does not generate a whole distant universe around every mover.
Visited moving-body indices, like other world records, persist until a new run.
Large artificial mass jumps may briefly fill the viewport while zoom eases out;
mass is immediate and camera motion intentionally takes a short interval.
Warning timing extrapolates current relative motion and local pull; it does not solve
future curved trajectories or guarantee avoidance after arbitrary late inputs.
Crowded/tiny views intentionally omit lower-priority indicators. Colors supplement
shape/position/text for massive hazards, but relative-size rims remain color-based.
Spatial density now favors asteroid fields and local planetary systems, with sparse
travel gaps. Later growth timing and natural travel through this new arrangement
have not been replayed; available target counts and generation clearances were inspected.
This is selective gameplay gravity, not an orbital-accuracy N-body simulation: forces
are finite-range and capped, steering/drift damping and speed limits dissipate energy,
and sources do not react gravitationally to receivers. Selected non-player actors now
resolve contacts; extremely dense cells can defer some contacts under the check budget.
At the global debris cap, further shedding waits for collection/merging to free slots.
Source removal takes effect in the next force pass. Tight orbits and long-run energy
conservation are not guaranteed. There is no whole-universe offline simulation.
There is no disk persistence. Rendering has no interpolation between physical ticks,
so displays above 60 Hz may show fixed-tick stepping.
