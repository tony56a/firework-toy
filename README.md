# Forest Field

A procedurally generated three.js field with discrete trees, fireworks, and clap-triggered launches.
TypeScript, Vite, no framework.

```bash
npm install
npm run dev        # http://localhost:5173
npm run typecheck
npm test           # node:test via tsx, no browser needed
npm run build
```

Use `localhost` (or https) for the microphone. It will not work inside a sandboxed iframe.

## Architecture

Data flows one way: **input / UI -> store -> models -> views**. Each layer only knows the ones to its left.

```
src/
  core/      seeded rng, noise, color, typed Emitter, Store. No domain knowledge.
  models/    pure logic and data. No DOM, no three.js.
    terrain.ts      heights, forest density, ground surface mix (from a seed)
    trees.ts        dart-throwing scatter with minimum spacing
    fireworks.ts    particle simulation into typed arrays
    timeOfDay.ts    atmosphere presets     cameraModes.ts   camera labels and fov
    fireworkPalettes.ts  burst color palettes (rainbow, warm, cold, neon, pastel, gold and silver)
    appState.ts     everything the user can change
  input/     things that produce events
    pointerInput.ts     drag, pinch, wheel -> gestures
    audio/              microphone.ts (Web Audio), features.ts (pure DSP),
                        clapDetector.ts (decision logic), yamnet.ts (optional model),
                        clapInput.ts (facade the app talks to)
  render/    three.js only. Views take models and draw them.
    sceneRenderer.ts  atmosphere.ts  terrainView.ts  treeView.ts
    fireworksView.ts  rocketView.ts  camera/rig.ts
  ui/        controlPanel.ts builds the DOM from the store; styles.css
  app.ts     composition root: wires everything, owns the frame loop
  main.ts    entry point
tests/       models, DSP and detector logic, using synthetic data
```

Seams worth knowing about:

- `FireworkSim` and `scatterTrees` are deterministic given a seeded rng, which is what makes them testable.
- `ClapDetector.update(frame, now)` takes an `AudioFrame` and a clock, so tests feed it synthetic audio.
- `MicrophoneSource.start(deviceId?)` is where a device picker would plug in.
- Swapping the classifier means implementing `ClipClassifier` (`classify(samples16k) -> score`).

## Clap detection

Every mode starts with an energy onset (loudness jump over a running background, sharp waveform).
Then: **Level** fires immediately. **Spectral** also requires broadband, mid/high-frequency, noise-like
energy measured against a learned noise profile (use "Calibrate noise" in a quiet room). **Classifier**
asks YAMNet whether the last second was clapping, at the cost of about half a second of delay. The
YAMNet model is fetched at runtime from a URL you can override.

## Known gaps

- Spectral thresholds are educated guesses and have not been tuned against a real microphone.
- Rendering was written against three r170 conventions (physical light units, sRGB output) and has not
  been looked at in a browser yet. Light intensities in `atmosphere.ts` and `fireworksView.ts` are the
  first things to tune.
- `ScriptProcessorNode` is deprecated; an `AudioWorklet` is the proper replacement.
- No visual or end-to-end tests.
