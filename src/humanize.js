import { setTimeout as delay } from "node:timers/promises";

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

export async function randomPause(min = 120, max = 420) {
  await delay(randomBetween(min, max));
}

export async function moveMouseSmooth(page, targetX, targetY, steps = 20) {
  const box = await page.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight
  }));

  const startX = randomBetween(box.width * 0.2, box.width * 0.8);
  const startY = randomBetween(box.height * 0.2, box.height * 0.8);
  await page.mouse.move(startX, startY);

  for (let i = 0; i < steps; i += 1) {
    const progress = (i + 1) / steps;
    const eased = 0.5 - Math.cos(progress * Math.PI) / 2;
    const intermediateX = startX + (targetX - startX) * eased + randomBetween(-2, 2);
    const intermediateY = startY + (targetY - startY) * eased + randomBetween(-2, 2);
    await page.mouse.move(intermediateX, intermediateY);
    await randomPause(4, 12);
  }
}

export async function humanHover(page, selector, dwellMs = 600) {
  const element = await page.$(selector);
  if (!element) {
    throw new Error(`Element not found for selector: ${selector}`);
  }
  const box = await element.boundingBox();
  if (!box) {
    throw new Error(`Cannot compute bounding box for selector: ${selector}`);
  }
  const targetX = box.x + box.width / 2 + randomBetween(-3, 3);
  const targetY = box.y + box.height / 2 + randomBetween(-3, 3);
  await moveMouseSmooth(page, targetX, targetY, Math.round(randomBetween(6, 14)));
  await randomPause(dwellMs * 0.4, dwellMs);
}

export async function humanClick(page, selector, options = {}) {
  const element = await page.$(selector);
  if (!element) {
    throw new Error(`Element not found for selector: ${selector}`);
  }
  const box = await element.boundingBox();
  if (!box) {
    throw new Error(`Cannot compute bounding box for selector: ${selector}`);
  }

  const targetX = box.x + box.width / 2 + randomBetween(-5, 5);
  const targetY = box.y + box.height / 2 + randomBetween(-5, 5);

  await moveMouseSmooth(page, targetX, targetY, Math.round(randomBetween(8, 18)));
  await randomPause(30, 120);
  await page.mouse.down();
  await randomPause(40, 140);
  await page.mouse.up();
  await randomPause(60, 200);
  if (options.afterDelayMs) {
    await delay(options.afterDelayMs);
  }
}

export async function humanType(page, selector, text, { clear = false } = {}) {
  const element = await page.$(selector);
  if (!element) {
    throw new Error(`Element not found for selector: ${selector}`);
  }
  await element.focus();

  if (clear) {
    await page.keyboard.down("Control");
    await page.keyboard.press("KeyA");
    await page.keyboard.up("Control");
    await randomPause(25, 80);
    await page.keyboard.press("Backspace");
  }

  for (const char of text) {
    await page.keyboard.type(char, { delay: randomBetween(80, 180) });
  }
  await randomPause(120, 260);
}

export async function humanScroll(page, distance = 600, durationMs = 1000) {
  const steps = Math.max(10, Math.round(durationMs / 50));
  await page.evaluate(
    async ({ distance, steps }) => {
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      let scrolled = 0;
      const increment = distance / steps;
      for (let i = 0; i < steps; i += 1) {
        window.scrollBy(0, increment + Math.random() * 4);
        scrolled += increment;
        await sleep(40 + Math.random() * 60);
      }
      return scrolled;
    },
    { distance, steps }
  );
}

export async function waitMs(ms) {
  await delay(ms);
}

