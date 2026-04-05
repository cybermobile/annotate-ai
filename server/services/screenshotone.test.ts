import { describe, expect, it } from "vitest";

describe("screenshotOne API key validation", () => {
  it("should have SCREENSHOT_ONE_API_KEY configured", () => {
    const key = process.env.SCREENSHOT_ONE_API_KEY;
    expect(key).toBeTruthy();
    expect(typeof key).toBe("string");
    expect(key!.length).toBeGreaterThan(5);
  });

  it("should successfully call screenshotOne API with a simple URL", async () => {
    const key = process.env.SCREENSHOT_ONE_API_KEY;
    if (!key) {
      console.warn("Skipping: SCREENSHOT_ONE_API_KEY not set");
      return;
    }

    const params = new URLSearchParams({
      access_key: key,
      url: "https://example.com",
      viewport_width: "800",
      viewport_height: "600",
      format: "png",
      image_quality: "50",
      cache: "true",
      cache_ttl: "86400",
    });

    const response = await fetch(
      `https://api.screenshotone.com/take?${params.toString()}`,
      { signal: AbortSignal.timeout(30000) }
    );

    // A valid API key should return 200 with image data
    expect(response.ok).toBe(true);
    expect(response.status).toBe(200);

    const contentType = response.headers.get("content-type");
    expect(contentType).toContain("image");

    const buffer = await response.arrayBuffer();
    expect(buffer.byteLength).toBeGreaterThan(1000); // Real screenshot should be > 1KB
  }, 35000); // Extended timeout for API call

  it("should export captureWithScreenshotOne function", async () => {
    const { captureWithScreenshotOne } = await import("./screenshot");
    expect(typeof captureWithScreenshotOne).toBe("function");
  });

  it("should export captureScreenshot with fallback chain", async () => {
    const { captureScreenshot } = await import("./screenshot");
    expect(typeof captureScreenshot).toBe("function");
  });
});
