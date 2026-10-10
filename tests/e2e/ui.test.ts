import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { COUNTDOWN_TICK, LAUNCH_CLIMB, LAUNCH_HOLD, LAUNCH_RESET } from '../../src/config';
import { SCENES } from '../../src/models/scenes';
import { frame, looksDrawn, stopServer, withPage, withSkyScene } from './harness';
import type { Page } from 'playwright';

/** Sets the launch countdown length from the concrete scene's World group. */
async function setCountFrom(page: Page, value: string): Promise<void> {
  const from = page.getByLabel(/Count down from/);
  await from.fill(value);
  await from.dispatchEvent('input');
  await page.waitForTimeout(150);
}

after(async () => {
  await stopServer();
});

test('the forest scene renders something', async () => {
  await withPage(async (page) => {
    const shot = await frame(page);
    assert.ok(looksDrawn(shot), `canvas looks blank (${shot.length} bytes)`);
  });
});

test('the sky scene renders a table with models on it', async () => {
  await withSkyScene(async (page) => {
    const shot = await frame(page);
    assert.ok(looksDrawn(shot), `canvas looks blank (${shot.length} bytes)`);
  });
});

test('the train moves when its speed is raised, and stops at zero', async () => {
  await withSkyScene(async (page) => {
    const speedSlider = page.getByLabel(/Train speed/);
    await speedSlider.fill('0');
    await page.waitForTimeout(500);
    const stoppedA = await frame(page);
    await page.waitForTimeout(700);
    const stoppedB = await frame(page);
    assert.ok(stoppedA.equals(stoppedB), 'a stopped train should leave the scene still');

    await speedSlider.fill('3');
    await page.waitForTimeout(500);
    const movingA = await frame(page);
    await page.waitForTimeout(700);
    const movingB = await frame(page);
    assert.ok(!movingA.equals(movingB), 'a moving train should change the frame');
  });
});

test('terrain-only controls are hidden in the sky scene and back in the forest', async () => {
  await withPage(async (page) => {
    const seed = page.getByLabel('Seed');
    assert.ok(await seed.isVisible(), 'seed should be visible in the forest');
    await page.getByRole('tab', { name: SCENES.sky.label }).click();
    await page.waitForTimeout(400);
    assert.ok(!(await seed.isVisible()), 'seed should be hidden in the sky');
    await page.getByRole('tab', { name: SCENES.forest.label }).click();
    await page.waitForTimeout(400);
    assert.ok(await seed.isVisible(), 'seed should come back in the forest');
  });
});

test('the train speed control only appears in the sky scene', async () => {
  await withPage(async (page) => {
    assert.ok(!(await page.getByLabel(/Train speed/).isVisible()), 'not in the forest');
    await page.getByRole('tab', { name: SCENES.sky.label }).click();
    await page.waitForTimeout(400);
    assert.ok(await page.getByLabel(/Train speed/).isVisible(), 'should appear in the sky');
  });
});

test('the control groups switch independently of the scene tabs', async () => {
  await withPage(async (page) => {
    assert.ok(await page.getByLabel('Seed').isVisible(), 'World group starts open');
    await page.getByRole('tab', { name: 'Audio' }).click();
    await page.waitForTimeout(200);
    assert.ok(!(await page.getByLabel('Seed').isVisible()), 'World should close');
    assert.ok(await page.getByLabel(/Microphone/).isVisible(), 'Audio should open');
    // The scene did not change underneath.
    assert.ok(await page.getByRole('tab', { name: SCENES.forest.label }).getAttribute('aria-selected') === 'true');
  });
});

test('the panel can be dragged by its titlebar', async () => {
  await withPage(async (page) => {
    const panel = page.locator('.panel');
    const before = await panel.boundingBox();
    assert.ok(before);
    const titlebar = page.locator('.titlebar');
    const bar = await titlebar.boundingBox();
    assert.ok(bar);
    await page.mouse.move(bar.x + 30, bar.y + bar.height / 2);
    await page.mouse.down();
    await page.mouse.move(bar.x + 30 + 220, bar.y + bar.height / 2 + 90, { steps: 12 });
    await page.mouse.up();
    await page.waitForTimeout(300);
    const after = await panel.boundingBox();
    assert.ok(after);
    assert.ok(after.x > before.x + 150, `panel should have moved right (${before.x} -> ${after.x})`);
    assert.ok(after.y > before.y + 50, `panel should have moved down (${before.y} -> ${after.y})`);
  });
});

test('the minimize button hides the panel and the restore button brings it back', async () => {
  await withPage(async (page) => {
    await page.getByRole('button', { name: 'Hide menu' }).click();
    await page.waitForTimeout(200);
    assert.ok(!(await page.locator('.panel').isVisible()), 'panel should be hidden');
    await page.getByRole('button', { name: 'Show menu' }).click();
    await page.waitForTimeout(200);
    assert.ok(await page.locator('.panel').isVisible(), 'panel should be back');
  });
});

test('the launch button only appears in the concrete scene', async () => {
  await withPage(async (page) => {
    assert.ok(!(await page.getByRole('button', { name: 'Launch rocket' }).isVisible()), 'not in the forest');
    await page.getByRole('tab', { name: SCENES.concrete.label }).click();
    await page.waitForTimeout(400);
    assert.ok(await page.getByRole('button', { name: 'Launch rocket' }).isVisible());
  });
});

test('launching the rocket takes it off the pad and puts it back', async () => {
  await withPage(async (page) => {
    await page.getByRole('tab', { name: SCENES.concrete.label }).click();
    await page.waitForTimeout(600);
    // Count from three, so this does not wait out eleven numbers. The default is ten.
    await setCountFrom(page, '3');
    const button = page.getByRole('button', { name: 'Launch rocket' });

    const onPad = await frame(page);
    await button.click();
    // Wait past the count and the hold, so the rocket is well clear of the pad. Derived from the
    // timings rather than hardcoded, which is what let this drift when the count changed.
    await page.waitForTimeout((COUNTDOWN_TICK * 3 + LAUNCH_HOLD) * 1000 + 2500);
    const inFlight = await frame(page);
    assert.notDeepEqual(inFlight, onPad, 'the frame should change while the rocket climbs');

    // Then wait out the climb and the reset, so the pad is ready again.
    await page.waitForTimeout((LAUNCH_CLIMB + LAUNCH_RESET) * 1000 + 1500);
    const reset = await frame(page);
    assert.notDeepEqual(reset, inFlight, 'the burst should have changed the frame');
  });
});

test('the launch is counted down aloud before it fires', async () => {
  await withPage(async (page) => {
    // Record what the app asks the speech API to say, without needing audio output.
    await page.evaluate(() => {
      const w = window as unknown as { __spoken: string[] };
      w.__spoken = [];
      const synth = window.speechSynthesis;
      const original = synth.speak.bind(synth);
      synth.speak = (utterance: SpeechSynthesisUtterance) => {
        w.__spoken.push(utterance.text);
        original(utterance);
      };
    });

    await page.getByRole('tab', { name: SCENES.concrete.label }).click();
    await page.waitForTimeout(500);
    // The default count is from ten, so the whole sequence has to be waited out.
    await page.getByRole('button', { name: 'Launch rocket' }).click();
    await page.waitForTimeout(COUNTDOWN_TICK * 10 * 1000 + 2000);

    const spoken = await page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken);
    assert.deepEqual(
      spoken,
      ['ten', 'nine', 'eight', 'seven', 'six', 'five', 'four', 'three', 'two', 'one', 'launch'],
      'the count should run from ten down to launch',
    );
  });
});

test('the countdown follows the chosen language', async () => {
  await withPage(async (page) => {
    await page.evaluate(() => {
      const w = window as unknown as { __spoken: string[] };
      w.__spoken = [];
      const synth = window.speechSynthesis;
      const original = synth.speak.bind(synth);
      synth.speak = (u: SpeechSynthesisUtterance) => { w.__spoken.push(u.text); original(u); };
    });
    await page.getByRole('tab', { name: SCENES.concrete.label }).click();
    await page.waitForTimeout(500);
    await page.getByLabel('Countdown language').selectOption('fr');
    // Shorten the count so the test does not wait out eleven numbers.
    await setCountFrom(page, '3');
    await page.getByRole('button', { name: 'Launch rocket' }).click();
    await page.waitForTimeout(COUNTDOWN_TICK * 3 * 1000 + 900);

    const spoken = await page.evaluate(() => (window as unknown as { __spoken: string[] }).__spoken);
    assert.deepEqual(spoken, ['trois', 'deux', 'un', 'lancement'], 'the count should be in French');
  });
});
