# Forest Field

A procedurally generated three.js toybox: a forest field with clap-triggered fireworks, a model
train running around a diorama table, a concrete launch pad where a rocket counts down and bursts,
a walled basin with a boat and a jumping school of fish, and a savanna with a herd of elephants,
giraffes and rhinos. TypeScript, Vite, no framework.

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

Five worlds, chosen from the panel. They share the camera rig, the fireworks simulation and the
control panel; each owns its own models and geometry.

- **Forest** — terrain from a seed, with discrete trees scattered by dart-throwing. The original
  scene, and where the firework and clap controls apply.
- **Toy train** — a diorama table carrying the two models from the model table, with a toy train
  running a loop around the rim. Speed is adjustable, down to stopped.
- **Concrete** — a flat pad cast as a grid of panels, with a service tower and ground buildings.
  A rocket stands on the pad and can be launched on demand.
- **Sea** — a walled basin of water, bounded so it reads as a thing with edges rather than a horizon
  that goes on forever. A boat works a course around it leaving a wake, and a school of fish leaps.
- **Savanna** — a flat plain of dry grass with flat-topped acacias, and a herd of grazers wandering
  between them. Acacia count, herd size and herd speed are adjustable; at zero speed the herd stops
  where it stands rather than returning to the middle of its patch.

Controls that do not apply are hidden per scene rather than greyed out.

### Downloaded models

Four scenes draw from `.glb` files in `public/models/`, all CC-BY-4.0 and attributed beside the path
in `config.ts`. Each is fetched at run time and fitted to the size this world draws, so nothing
depends on how the file happened to be authored — the giraffe is 519 units tall because it was
exported in centimetres, and it comes out the same size as everything else anyway.

Every kind of animal is drawn in code as well, and the downloaded model replaces it when it lands.
That is what keeps a fresh clone working with no files at all, and what makes a file that fails to
load cost one animal its looks rather than the whole herd.

Three things about a file cannot be derived from it and are measured instead, then kept beside the
path: which axis is nose-to-tail (`lengthAxis` — a giraffe is taller than it is long, so the longest
axis is the wrong one), which end the head is on (`front` — the elephant's tusks and the rhino's
horns gave it away), and the material policy. The rest is measured every load.

The rhino is rigged, with 33 joints and a skin, and the export carries no animations. It is baked to
a static mesh in its rest pose, and the joint attributes are dropped: a bone texture nothing binds is
just memory. See `measureGroup` in `render/gltfAssets.ts` for why a rigged mesh is measured from its
geometry rather than with `Box3.expandByObject` — the two disagree by about 9% on a mesh whose rest
pose is smaller than its bind pose, and fitting to one while drawing the other is how an animal comes
out the wrong size.

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
    sea/       sea.ts (the swell), boat.ts (course and pose), fish.ts (leaps), waves.ts
    savanna/   ground.ts (the plain), acacias.ts (scatter), grazer.ts (the herd)
    fireworks.ts  particles into typed arrays     fireworkPalettes.ts  burst colours
    timeOfDay.ts   atmosphere presets             appState.ts        everything the user can change
    cameraModes.ts labels and fov                 cameraFraming.ts   how big each scene is
    ground.ts      the Ground interface the scenes share
    meshFit.ts     fitting a downloaded mesh to this world (no three.js, so it is unit tested)
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
    gltfAssets.ts  loading and fitting .glb files; seaView.ts  boatView.ts  fishView.ts
    savannaView.ts  acaciaView.ts  herdView.ts  splashPool.ts
  ui/        controlPanel.ts builds the DOM from the store; speech.ts; styles.css
  app.ts     composition root: wires everything, owns the frame loop
  main.ts    entry point
tests/       models, DSP, detector and shader logic, using synthetic data
tests/e2e/   Playwright, driving the real Chrome against a real dev server
```

Seams worth knowing about:

- `FireworkSim` and `scatterTrees` are deterministic given a seeded rng, which is what makes them testable.
- `fitMesh` is pure and takes a bounding box, not a mesh, so the whole loader's geometry is unit
  tested without a browser or a file.
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
- `test:e2e` exists but covers layout and interaction, not how anything looks. It is slow enough to
  be worth running only when asked; see AGENTS.md.
- Nothing asserts what a `.glb` looks like. The herd's front-ends were confirmed by rendering each
  animal both ways and looking, and a future asset could be backwards or on its side with every test
  still green.
- `ConcreteScene.setBurstHeight` is never called, so the Burst height slider does nothing and the
  rocket always bursts at 60.
