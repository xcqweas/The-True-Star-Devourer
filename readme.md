# The True Star Devourer

Welcome to this Minigame!

## How to run the game

### p5.js

You can use this sharelink, <https://editor.p5js.org/xcqweas/full/AJmh_awJp>, or copy and paste all files there in the exact structure to play it!

### Clone and Run

You can clone this repo to your local computer and run it through any local webpage tools, for example I am using Live Server extension in VSC

## Project structure

The game is now split into stage-oriented and responsibility-oriented files:

- `js/constants.js`: balancing values, difficulty presets, stage list
- `js/game-state.js`: mutable game state
- `js/bodies.js`: shared body/shape rendering
- `js/stage-visuals.js`: stage-specific colors and shape rules
- `js/spawn-and-init.js`: spawn rules and game initialization
- `js/screens.js`: menu, game-over, progress, ending screens
- `js/gameplay.js`: active gameplay loop and stage progression handler
- `js/p5-entry.js`: p5 entry points (`setup`, `draw`, `keyPressed`)

`index.html` loads these scripts in dependency order.

## What to do

You can move your asteroid with your mouse (it will try to follow it, but at a speed limit), and you can collide with smaller asteroids to eat them! But colliding with larger asteroids will... well, make yourself eaten.

Currently the only goal is to eat smaller asteroids and avoid larger asteroids, and by eating, you will also grow larger!
