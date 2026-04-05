import sharp from "sharp";

let puppeteer: typeof import("puppeteer") | null = null;

async function getPuppeteer() {
  if (!puppeteer) {
    puppeteer = await import("puppeteer");
  }
  return puppeteer;
}

export interface ScreenshotOptions {
  url: string;
  viewport?: { width: number; height: number };
  fullPage?: boolean;
  delay?: number; // milliseconds
  selector?: string;
}

// ── ScreenshotOne API (primary) ──────────────────────────────

const SCREENSHOT_ONE_BASE = "https://api.screenshotone.com/take";

/**
 * Capture a screenshot using the screenshotOne API.
 * Docs: https://screenshotone.com/docs/getting-started/
 */
export async function captureWithScreenshotOne(opts: ScreenshotOptions): Promise<Buffer> {
  const apiKey = process.env.SCREENSHOT_ONE_API_KEY;
  if (!apiKey) {
    throw new Error("SCREENSHOT_ONE_API_KEY not configured");
  }

  const {
    url,
    viewport = { width: 1440, height: 900 },
    fullPage = false,
    delay = 3000,
  } = opts;

  // screenshotOne delay is in seconds, minimum 2
  const delaySec = Math.max(2, Math.min(Math.round(delay / 1000), 10));

  const params = new URLSearchParams({
    access_key: apiKey,
    url: url,
    viewport_width: String(viewport.width),
    viewport_height: String(viewport.height),
    full_page: String(fullPage),
    format: "png",
    image_quality: "95",
    block_ads: "true",
    block_cookie_banners: "true",
    block_trackers: "true",
    delay: String(delaySec),
    cache: "true",
    cache_ttl: "14400",
    timeout: "60",
    reduced_motion: "true",
    ignore_host_errors: "true", // Capture error/404 pages instead of failing
  });

  // If a selector is specified, use the screenshotOne selector option
  if (opts.selector) {
    params.set("selector", opts.selector);
  }

  const apiUrl = `${SCREENSHOT_ONE_BASE}?${params.toString()}`;

  console.log(`[screenshot] Calling screenshotOne API for: ${url} (delay=${delaySec}s)`);

  const response = await fetch(apiUrl, {
    signal: AbortSignal.timeout(90000), // 90s timeout for screenshotOne
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    throw new Error(
      `screenshotOne API error ${response.status}: ${errorText}`
    );
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("image")) {
    const body = await response.text().catch(() => "");
    throw new Error(`screenshotOne returned non-image content-type: ${contentType}. Body: ${body.slice(0, 200)}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  if (buffer.length < 5000) {
    throw new Error(`screenshotOne returned suspiciously small image (${buffer.length} bytes)`);
  }

  console.log(`[screenshot] screenshotOne success: ${buffer.length} bytes`);
  return buffer;
}

// ── Steel.dev (secondary — cloud browser) ───────────────────

/**
 * Capture a screenshot using Steel.dev cloud browser via Puppeteer WebSocket.
 * Steel provides managed cloud Chrome instances with proxy and captcha support.
 * Docs: https://docs.steel.dev/overview/guides/puppeteer
 */
export async function captureWithSteel(opts: ScreenshotOptions): Promise<Buffer> {
  const steelApiKey = process.env.STEEL_API_KEY;
  if (!steelApiKey) {
    throw new Error("STEEL_API_KEY not configured");
  }

  const {
    url,
    viewport = { width: 1440, height: 900 },
    fullPage = false,
    delay = 3000,
  } = opts;

  const pptr = await getPuppeteer();
  let browser;

  try {
    // Connect to Steel's cloud browser via WebSocket (Method #1 — one-line change)
    const wsEndpoint = `wss://connect.steel.dev?apiKey=${steelApiKey}`;
    console.log(`[screenshot] Connecting to Steel.dev cloud browser for: ${url}`);

    browser = await pptr.connect({
      browserWSEndpoint: wsEndpoint,
    });

    const page = await browser.newPage();
    await page.setViewport(viewport);

    // Set a realistic user agent
    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });

    if (delay > 0) {
      await new Promise((r) => setTimeout(r, delay));
    }

    let screenshotBuffer: Buffer;
    if (opts.selector) {
      const element = await page.$(opts.selector);
      if (element) {
        screenshotBuffer = (await element.screenshot({ type: "png" })) as Buffer;
      } else {
        screenshotBuffer = (await page.screenshot({
          type: "png",
          fullPage,
        })) as Buffer;
      }
    } else {
      screenshotBuffer = (await page.screenshot({
        type: "png",
        fullPage,
      })) as Buffer;
    }

    console.log(`[screenshot] Steel.dev success: ${screenshotBuffer.length} bytes`);
    return Buffer.from(screenshotBuffer);
  } finally {
    if (browser) {
      // Disconnecting from Steel auto-releases the session
      await browser.disconnect().catch(() => {});
    }
  }
}

// ── Puppeteer (tertiary — local headless Chrome) ────────────

/**
 * Capture a screenshot using Puppeteer (local headless Chrome).
 * Used as fallback when screenshotOne and Steel.dev are unavailable.
 */
export async function captureWithPuppeteer(opts: ScreenshotOptions): Promise<Buffer> {
  const {
    url,
    viewport = { width: 1440, height: 900 },
    fullPage = false,
    delay = 3000,
  } = opts;

  const pptr = await getPuppeteer();
  let browser;

  try {
    browser = await pptr.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-web-security",
        "--disable-features=IsolateOrigins,site-per-process",
      ],
    });

    const page = await browser.newPage();
    await page.setViewport(viewport);

    // Set a realistic user agent
    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    await page.goto(url, { waitUntil: "networkidle2", timeout: 45000 });

    if (delay > 0) {
      await new Promise((r) => setTimeout(r, delay));
    }

    let screenshotBuffer: Buffer;
    if (opts.selector) {
      const element = await page.$(opts.selector);
      if (element) {
        screenshotBuffer = (await element.screenshot({ type: "png" })) as Buffer;
      } else {
        screenshotBuffer = (await page.screenshot({
          type: "png",
          fullPage,
        })) as Buffer;
      }
    } else {
      screenshotBuffer = (await page.screenshot({
        type: "png",
        fullPage,
      })) as Buffer;
    }

    console.log(`[screenshot] Puppeteer success: ${screenshotBuffer.length} bytes`);
    return Buffer.from(screenshotBuffer);
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

// ── Main capture function (with fallback chain) ──────────────

/**
 * Capture a screenshot with automatic fallback chain:
 * 1. screenshotOne API (fast, reliable, handles SPAs)
 * 2. Steel.dev cloud browser (handles bot protection, captchas)
 * 3. Puppeteer (local headless Chrome)
 *
 * Exported as `captureScreenshot` for backward compatibility.
 */
export async function captureScreenshot(opts: ScreenshotOptions): Promise<Buffer> {
  // 1. Try screenshotOne first (if API key is configured)
  if (process.env.SCREENSHOT_ONE_API_KEY) {
    try {
      return await captureWithScreenshotOne(opts);
    } catch (err) {
      console.warn(`[screenshot] screenshotOne failed, trying Steel.dev:`, err instanceof Error ? err.message : err);
    }
  }

  // 2. Try Steel.dev cloud browser (if API key is configured)
  if (process.env.STEEL_API_KEY) {
    try {
      return await captureWithSteel(opts);
    } catch (err) {
      console.warn(`[screenshot] Steel.dev failed, falling back to Puppeteer:`, err instanceof Error ? err.message : err);
    }
  }

  // 3. Fall back to local Puppeteer
  try {
    return await captureWithPuppeteer(opts);
  } catch (err) {
    console.warn(`[screenshot] Puppeteer also failed:`, err instanceof Error ? err.message : err);
    throw err;
  }
}

// ── Utilities ────────────────────────────────────────────────

/**
 * Fetch an image from a URL and return as buffer.
 */
export async function fetchImageBuffer(url: string): Promise<Buffer> {
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Pre-process a screenshot for annotation:
 * - Ensure consistent color space
 * - Optional rounded corners via SVG mask
 */
export async function preprocessScreenshot(
  buffer: Buffer,
  opts: { roundCorners?: boolean; cornerRadius?: number; brighten?: boolean } = {}
): Promise<Buffer> {
  let pipeline = sharp(buffer);
  pipeline = pipeline.toColorspace("srgb");

  if (opts.brighten) {
    pipeline = pipeline.modulate({ brightness: 1.05 });
  }

  if (opts.roundCorners) {
    const meta = await sharp(buffer).metadata();
    const w = meta.width || 800;
    const h = meta.height || 600;
    const r = opts.cornerRadius || 16;
    const mask = Buffer.from(
      `<svg width="${w}" height="${h}"><rect width="${w}" height="${h}" rx="${r}" ry="${r}" fill="white"/></svg>`
    );
    pipeline = pipeline.composite([{ input: mask, blend: "dest-in" }]);
  }

  return pipeline.png().toBuffer();
}
