# Working notes for agents

## Commands

- `npm test` — unit tests (`tests/*.test.ts`). Fast, no browser. Run these freely.
- `npm run typecheck` — `tsc --noEmit`. Cheap, run freely.
- `npm run build` — typecheck plus a production bundle.
- `npm run test:e2e` — **browser tests, do not run unless explicitly asked.**
  Playwright drives the system Chrome, and each test launches a browser and boots a Vite server,
  so the suite takes roughly 20 seconds and needs Chrome installed. Running it unprompted wastes a
  minute on every change.

Screenshots taken while checking UI go in `tmp-shots/`, which is gitignored. That directory is not
a place for committed artefacts.

## Verification expectations

- Pure logic belongs in `src/models/` with no three.js import, so it can be unit tested cheaply.
  Prefer that over testing renderer code.
- Unit tests and typecheck are the default proof. Browser tests are for the things neither can see:
  layout, WebGL output, interaction. Ask before reaching for them.
- Never claim a UI change is verified on the strength of a typecheck alone. Say plainly what has
  and has not been seen running.

## Conventions

- Commits are small and single-purpose, with an imperative subject line ("Add a model table view").
  Reference the reason in the body when the reason is not obvious from the diff.
- `Scene` implementations own their own `THREE.Scene`; `SceneRenderer.render` takes the scene as an
  argument. Scenes are built on first use and cached, never torn down.
- Anything the camera needs to know about a scene's scale goes through `CameraFraming`. Do not put
  world-sized constants back into `CameraRig`.
