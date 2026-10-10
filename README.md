# Forest Field

A procedurally generated three.js toybox: a forest field with clap-triggered fireworks, a model
train running around a diorama table, and a concrete launch pad where a rocket counts down and
bursts. TypeScript, Vite, no framework.

```bash
npm install
npm run dev        # http://localhost:5173
npm run typecheck
npm test           # node:test via tsx, no browser needed
npm run build
npm run test:e2e   # browser tests, needs Chrome; slow, see AGENTS.md
```

Use `localhost` (or https) for the microphone. It will not work inside a sandboxed iframe.

## Scenes

Three worlds, chosen from the panel. They share the camera rig, the fireworks simulation and the
control panel; each owns its own models and geometry.

- **Forest** — terrain from a seed, with discrete trees scattered by dart-throwing. The original
  scene, and where the firework and clap controls apply.
- **Toy train** — a diorama table carrying the two models from the model table, with a toy train
  running a loop around the rim. Speed is adjustable, down to stopped.
- **Concrete** — a flat pad cast as a grid of panels, with a service tower and ground buildings.
  A rocket stands on the pad and can be launched on demand.

Controls that do not apply are hidden per scene rather than greyed out.

## Architecture

Data flows one way: **input / UI -> store -> models -> views**. Each layer only knows the ones to
its left.

```
src/
  core/      seeded rng, noise, color, typed Emitter, Store. No domain knowledge.
  models/    pure logic and data. No DOM, no three.js.
    forest/    terrain.ts (heights, density, ground mix), trees.ts (dart-throwing scatter)
    sky/       tableModels.ts (models on the table), track.ts (the train loop)
    concrete/  slab.ts (the pad), site.ts (tower and buildings), launch.ts (hold/climb/burst),
               countdown.ts (timing), countdownPhrases.ts (spoken words, 8 languages)
    fireworks.ts  particles into typed arrays     fireworkPalettes.ts  burst colours
    timeOfDay.ts   atmosphere presets             appState.ts        everything the user can change
    cameraModes.ts labels and fov                 cameraFraming.ts   how big each scene is
    ground.ts      the Ground interface the scenes share
    modelKinds.ts  the model types the table and the forest share
  input/     things that produce events
    pointerInput.ts     drag, pinch, wheel -> gestures
    audio/              microphone.ts (Web Audio), features.ts (pure DSP),
                        clapDetector.ts (decision logic), yamnet.ts (optional model),
                        clapInput.ts (facade the app talks to)
  scenes/    one module per scene, behind a single Scene interface
  render/    three.js only. Views take models and draw them.
    camera/rig.ts   the five camera modes, plus launch tracking
    sceneRenderer.ts  atmosphere.ts  terrainView.ts  treeView.ts  fireworksView.ts
    concreteView.ts  concreteMaterial.ts  siteView.ts  rocketView.ts  rocketLaunchView.ts
    trainView.ts  modelTableView.ts  modelGeometry.ts
  ui/        controlPanel.ts builds the DOM from the store; speech.ts; styles.css
  app.ts     composition root: wires everything, owns the frame loop
  main.ts    entry point
tests/       models, DSP, detector and shader logic, using synthetic data
tests/e2e/   Playwright, driving the real Chrome against a real dev server
```

Seams worth knowing about:

- `FireworkSim` and `scatterTrees` are deterministic given a seeded rng, which is what makes them testable.
- `ClapDetector.update(frame, now)` takes an `AudioFrame` and a clock, so tests feed it synthetic audio.
- `MicrophoneSource.start(deviceId?)` is where a device picker would plug in.
- Swapping the classifier means implementing `ClipClassifier` (`classify(samples16k) -> score`).
- Scenes get at the app only through `SceneHooks` (`speak`, `track`), so they never touch browser
  APIs or the camera rig directly.

## Cameras

Five modes — orbit, sitting in the field, plane flyover, overhead, ridge — each with its own
framing and field of view. Framing is per scene (`CameraFraming`): each scene declares how big its
subject is, and the rig scales to it rather than reusing the last scene's numbers.

During a rocket launch the camera **tracks**: it keeps the position its mode chose and overrides
where it looks, so the pad does not slide away as the rocket climbs and the rocket stays centred at
any burst height. Clearing the track restores the chosen mode exactly.

## Clap detection

Every mode starts with an energy onset (loudness jump over a running background, sharp waveform).
Then: **Level** fires immediately. **Spectral** also requires broadband, mid/high-frequency, noise-like
energy measured against a learned noise profile (use "Calibrate noise" in a quiet room). **Classifier**
asks YAMNet whether the last second was clapping, at the cost of about half a second of delay. The
YAMNet model is fetched at runtime from a URL you can override.

## Launch countdown

The concrete scene counts the launch aloud, from three to ten, in eight languages, using the
browser's speech synthesis. No audio files are bundled — the phrases live in
`countdownPhrases.ts`, one entry per language. Each language needs a word for every number the
countdown can reach: several change form as the count rises, so a language with only one to three
cannot be counted to ten.

The burst height is adjustable (40 to 150) because the camera tracks the rocket, so there is no
height that would otherwise fall out of frame.

## Known gaps

- Spectral thresholds are educated guesses and have not been tuned against a real microphone.
- Rendering was written against three r170 conventions (physical light units, sRGB output). Light
  intensities in `atmosphere.ts` and `fireworksView.ts` are the first things to tune.
- Speech quality varies by platform and installed voice; there is no bundled audio to fall back on.
- At the top of the burst range the overhead camera tilts almost straight up and the pad leaves the
  frame. Capping `LAUNCH_BURST_MAX` near 120 would keep ground reference from the low cameras.
- `ScriptProcessorNode` is deprecated; an `AudioWorklet` is the proper replacement.
- `test:e2e` exists but covers layout and interaction, not how anything looks.
