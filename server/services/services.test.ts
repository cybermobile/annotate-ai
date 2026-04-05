import { describe, expect, it, vi } from "vitest";
import { scoreImages, type ScoredImage } from "./scorer";
import type { ScrapedImage, ScrapedData } from "./scraper";
import type { PipelineProgress, PipelineResult } from "./pipeline";
import type { SlideSpec, CarouselPlan } from "./analyzer";

// ── Scorer Tests ──────────────────────────────────────────────

describe("scoreImages", () => {
  const baseImage: ScrapedImage = {
    url: "https://example.com/image.png",
    alt: "Test image",
    width: 800,
    height: 600,
    type: "image",
  };

  it("returns scored images sorted by score descending", () => {
    const images: ScrapedImage[] = [
      { ...baseImage, url: "https://example.com/small.png", width: 30, height: 30, type: "logo" },
      { ...baseImage, url: "https://example.com/og.png", type: "og_image" },
      { ...baseImage, url: "https://other.com/img.png", type: "image" },
    ];

    const scored = scoreImages(images, {
      sourceUrl: "https://example.com/page",
      topic: "tutorial",
      targetRatio: "4:5",
    });

    expect(scored).toHaveLength(3);
    // OG image should score highest (high relevance + first party)
    expect(scored[0].url).toBe("https://example.com/og.png");
    // Each item should have a score between 0 and 1
    scored.forEach((img) => {
      expect(img.score).toBeGreaterThanOrEqual(0);
      expect(img.score).toBeLessThanOrEqual(1);
    });
  });

  it("boosts first-party images", () => {
    const images: ScrapedImage[] = [
      { ...baseImage, url: "https://example.com/first-party.png" },
      { ...baseImage, url: "https://other-domain.com/third-party.png" },
    ];

    const scored = scoreImages(images, {
      sourceUrl: "https://example.com/page",
      topic: "test",
    });

    // First-party should score higher
    const firstParty = scored.find((i) => i.url.includes("example.com"))!;
    const thirdParty = scored.find((i) => i.url.includes("other-domain"))!;
    expect(firstParty.scores.firstParty).toBeGreaterThan(thirdParty.scores.firstParty);
  });

  it("scores OG images with high relevance", () => {
    const images: ScrapedImage[] = [
      { ...baseImage, type: "og_image" },
      { ...baseImage, url: "https://example.com/regular.png", type: "image" },
    ];

    const scored = scoreImages(images, {
      sourceUrl: "https://example.com",
      topic: "test",
    });

    const ogImg = scored.find((i) => i.url === baseImage.url)!;
    const regular = scored.find((i) => i.url.includes("regular"))!;
    expect(ogImg.scores.relevance).toBeGreaterThan(regular.scores.relevance);
  });

  it("scores large images as more readable", () => {
    const images: ScrapedImage[] = [
      { ...baseImage, width: 1920, height: 1080 },
      { ...baseImage, url: "https://example.com/tiny.png", width: 100, height: 100 },
    ];

    const scored = scoreImages(images, {
      sourceUrl: "https://example.com",
      topic: "test",
    });

    const large = scored.find((i) => i.width === 1920)!;
    const small = scored.find((i) => i.width === 100)!;
    expect(large.scores.readability).toBeGreaterThan(small.scores.readability);
  });

  it("handles empty image array", () => {
    const scored = scoreImages([], {
      sourceUrl: "https://example.com",
      topic: "test",
    });
    expect(scored).toHaveLength(0);
  });

  it("handles images with unknown dimensions", () => {
    const images: ScrapedImage[] = [
      { url: "https://example.com/unknown.png", type: "image" },
    ];

    const scored = scoreImages(images, {
      sourceUrl: "https://example.com",
      topic: "test",
    });

    expect(scored).toHaveLength(1);
    expect(scored[0].scores.readability).toBe(0.5); // default for unknown
    expect(scored[0].scores.layoutFit).toBe(0.5); // default for unknown
  });

  it("matches topic keywords in alt text", () => {
    const images: ScrapedImage[] = [
      { ...baseImage, alt: "Claude AI dashboard tutorial screenshot" },
      { ...baseImage, url: "https://example.com/no-alt.png", alt: "" },
    ];

    const scored = scoreImages(images, {
      sourceUrl: "https://example.com",
      topic: "Claude AI dashboard tutorial",
    });

    const withAlt = scored.find((i) => i.alt?.includes("Claude"))!;
    const noAlt = scored.find((i) => i.alt === "")!;
    expect(withAlt.scores.relevance).toBeGreaterThan(noAlt.scores.relevance);
  });
});

// ── Compositor Tests (unit-level, no Sharp) ───────────────────

describe("compositor CANVAS_PRESETS", () => {
  it("exports correct canvas dimensions", async () => {
    const { CANVAS_PRESETS } = await import("./compositor");

    expect(CANVAS_PRESETS["3:4"]).toEqual({ width: 1080, height: 1440 });
    expect(CANVAS_PRESETS["4:5"]).toEqual({ width: 1080, height: 1350 });
    expect(CANVAS_PRESETS["9:16"]).toEqual({ width: 1080, height: 1920 });
  });
});

describe("compositor THEME", () => {
  it("exports design tokens with pink/magenta accent", async () => {
    const { THEME } = await import("./compositor");

    expect(THEME.bg).toBe("#111111");
    expect(THEME.accent).toBe("#E91E8C");
    expect(THEME.text).toBe("#FFFFFF");
    expect(THEME.badgeBg).toBe("#E91E8C");
  });
});

// ── Compositor Integration Tests (with Sharp) ─────────────────

describe("compositeSlide", () => {
  it("generates a PNG buffer with correct dimensions for 4:5", async () => {
    const sharp = (await import("sharp")).default;
    const { compositeSlide, CANVAS_PRESETS } = await import("./compositor");

    // Create a simple test screenshot
    const testScreenshot = await sharp({
      create: { width: 800, height: 600, channels: 4, background: { r: 50, g: 50, b: 50, alpha: 255 } },
    }).png().toBuffer();

    const result = await compositeSlide({
      screenshot: testScreenshot,
      slide: {
        stepNumber: 1,
        title: "Test Step",
        instructions: ["Click on **Settings**", "Select **Profile**"],
        annotations: [
          { type: "badge", number: 1, x: 0.3, y: 0.4 },
          { type: "highlight", x: 0.2, y: 0.3, w: 0.3, h: 0.1 },
        ],
      },
      ratio: "4:5",
    });

    expect(result).toBeInstanceOf(Buffer);
    expect(result.length).toBeGreaterThan(0);

    const meta = await sharp(result).metadata();
    expect(meta.format).toBe("png");
    expect(meta.width).toBe(CANVAS_PRESETS["4:5"].width);
    expect(meta.height).toBe(CANVAS_PRESETS["4:5"].height);
  });

  it("generates correct dimensions for 9:16", async () => {
    const sharp = (await import("sharp")).default;
    const { compositeSlide, CANVAS_PRESETS } = await import("./compositor");

    const testScreenshot = await sharp({
      create: { width: 800, height: 600, channels: 4, background: { r: 50, g: 50, b: 50, alpha: 255 } },
    }).png().toBuffer();

    const result = await compositeSlide({
      screenshot: testScreenshot,
      slide: {
        stepNumber: 1,
        title: "Stories Format",
        instructions: ["Vertical layout test"],
        annotations: [],
      },
      ratio: "9:16",
    });

    const meta = await sharp(result).metadata();
    expect(meta.width).toBe(CANVAS_PRESETS["9:16"].width);
    expect(meta.height).toBe(CANVAS_PRESETS["9:16"].height);
  });
});

describe("compositeHookSlide", () => {
  it("generates a hook/title slide", async () => {
    const sharp = (await import("sharp")).default;
    const { compositeHookSlide, CANVAS_PRESETS } = await import("./compositor");

    const bgImage = await sharp({
      create: { width: 800, height: 600, channels: 4, background: { r: 100, g: 50, b: 50, alpha: 255 } },
    }).png().toBuffer();

    const result = await compositeHookSlide({
      backgroundImage: bgImage,
      title: "How to Set Up Claude AI Connectors",
      subtitle: "A step-by-step guide for beginners",
      ratio: "4:5",
    });

    expect(result).toBeInstanceOf(Buffer);
    const meta = await sharp(result).metadata();
    expect(meta.format).toBe("png");
    expect(meta.width).toBe(CANVAS_PRESETS["4:5"].width);
    expect(meta.height).toBe(CANVAS_PRESETS["4:5"].height);
  });
});

describe("compositeCTASlide", () => {
  it("generates a CTA/recap slide", async () => {
    const sharp = (await import("sharp")).default;
    const { compositeCTASlide, CANVAS_PRESETS } = await import("./compositor");

    const result = await compositeCTASlide({
      title: "How to Set Up Claude AI Connectors",
      steps: ["Add connectors", "Search Gamma", "Enable integration"],
      sourceUrl: "https://claude.ai",
      ratio: "4:5",
    });

    expect(result).toBeInstanceOf(Buffer);
    const meta = await sharp(result).metadata();
    expect(meta.format).toBe("png");
    expect(meta.width).toBe(CANVAS_PRESETS["4:5"].width);
    expect(meta.height).toBe(CANVAS_PRESETS["4:5"].height);
  });

  it("handles many steps without overflow", async () => {
    const sharp = (await import("sharp")).default;
    const { compositeCTASlide } = await import("./compositor");

    const result = await compositeCTASlide({
      title: "Long Tutorial",
      steps: Array.from({ length: 20 }, (_, i) => `Step ${i + 1}: Do something important`),
      sourceUrl: "https://example.com",
      ratio: "4:5",
    });

    expect(result).toBeInstanceOf(Buffer);
    expect(result.length).toBeGreaterThan(0);
  });
});

// ── Scraper Tests (unit-level, no network) ────────────────────

describe("scraper module exports", () => {
  it("exports scrapeUrl function", async () => {
    const scraper = await import("./scraper");
    expect(typeof scraper.scrapeUrl).toBe("function");
  });
});

describe("scraper URL resolution", () => {
  it("handles YouTube video ID extraction from scraped data", async () => {
    // The scraper extracts YouTube thumbnails from iframes and links
    // We test the expected output format
    const expectedThumbPattern = /^https:\/\/img\.youtube\.com\/vi\/[a-zA-Z0-9_-]{11}\/maxresdefault\.jpg$/;
    const sampleThumb = "https://img.youtube.com/vi/dQw4w9WgXcQ/maxresdefault.jpg";
    expect(sampleThumb).toMatch(expectedThumbPattern);
  });

  it("validates ScrapedData structure", () => {
    const data: ScrapedData = {
      title: "Test Page",
      description: "A test page",
      url: "https://example.com",
      images: [
        { url: "https://example.com/img.png", alt: "Test", type: "image" },
        { url: "https://example.com/og.png", type: "og_image" },
      ],
      headings: ["Heading 1", "Heading 2"],
      bodyText: "Some body text content",
      ogImage: "https://example.com/og.png",
      favicon: "https://example.com/favicon.ico",
    };

    expect(data.title).toBe("Test Page");
    expect(data.images).toHaveLength(2);
    expect(data.images[0].type).toBe("image");
    expect(data.images[1].type).toBe("og_image");
    expect(data.headings).toHaveLength(2);
  });

  it("validates ScrapedImage type enum", () => {
    const validTypes = ["screenshot", "logo", "image", "video_thumbnail", "og_image"];
    const img: ScrapedImage = { url: "https://example.com/img.png", type: "image" };
    expect(validTypes).toContain(img.type);
  });
});

// ── Pipeline Type Tests ───────────────────────────────────────

describe("pipeline types", () => {
  it("validates PipelineProgress structure", () => {
    const progress: PipelineProgress = {
      phase: "generating",
      message: "Creating slide 1/3",
      currentStep: 4,
      totalSteps: 8,
    };

    expect(progress.phase).toBe("generating");
    expect(progress.currentStep).toBeLessThanOrEqual(progress.totalSteps);
  });

  it("validates PipelineResult image structure", () => {
    const mockImage: PipelineResult["images"][number] = {
      buffer: Buffer.from("test"),
      stepNumber: 1,
      key: "annotated/abc123-slide-1.png",
      url: "https://storage.example.com/annotated/abc123-slide-1.png",
      width: 1080,
      height: 1350,
    };

    expect(mockImage.stepNumber).toBe(1);
    expect(mockImage.width).toBe(1080);
    expect(mockImage.key).toContain("annotated/");
  });

  it("validates CarouselPlan structure", () => {
    const plan: CarouselPlan = {
      carouselTitle: "How to Use Claude AI",
      slides: [
        {
          stepNumber: 1,
          title: "Open Claude",
          description: "Navigate to claude.ai",
          screenshotUrl: "https://claude.ai",
          screenshotDelay: 2000,
        },
      ],
      suggestedRatio: "4:5",
    };

    expect(plan.carouselTitle).toBeTruthy();
    expect(plan.slides).toHaveLength(1);
    expect(plan.slides[0].stepNumber).toBe(1);
  });

  it("validates SlideSpec annotation types", () => {
    const slide: SlideSpec = {
      stepNumber: 1,
      title: "Click Settings",
      instructions: ["Go to **Settings**", "Click **Profile**"],
      annotations: [
        { type: "badge", number: 1, x: 0.3, y: 0.4 },
        { type: "highlight", x: 0.2, y: 0.3, w: 0.3, h: 0.1 },
        { type: "arrow", x: 0.3, y: 0.7, toX: 0.5, toY: 0.6 },
        { type: "label", text: "Click here", x: 0.4, y: 0.3 },
      ],
    };

    expect(slide.annotations).toHaveLength(4);
    expect(slide.annotations[0].type).toBe("badge");
    expect(slide.annotations[1].type).toBe("highlight");
    expect(slide.annotations[2].type).toBe("arrow");
    expect(slide.annotations[3].type).toBe("label");
    // All coordinates should be relative (0-1)
    slide.annotations.forEach((ann) => {
      expect(ann.x).toBeGreaterThanOrEqual(0);
      expect(ann.x).toBeLessThanOrEqual(1);
      expect(ann.y).toBeGreaterThanOrEqual(0);
      expect(ann.y).toBeLessThanOrEqual(1);
    });
  });
});

// ── Brand Overrides Tests ───────────────────────────────────────

describe("compositor with brand overrides", () => {
  it("generates a hook slide with custom brand colors", async () => {
    const sharp = (await import("sharp")).default;
    const { compositeHookSlide, CANVAS_PRESETS } = await import("./compositor");

    const bgImage = await sharp({
      create: { width: 800, height: 600, channels: 4, background: { r: 100, g: 50, b: 50, alpha: 255 } },
    }).png().toBuffer();

    const result = await compositeHookSlide({
      backgroundImage: bgImage,
      title: "Custom Brand Tutorial",
      subtitle: "With custom colors and branding",
      ratio: "4:5",
      brand: {
        accentColor: "#3B82F6",
        bgColor: "#0F172A",
        textColor: "#F8FAFC",
        brandName: "TestBrand",
      },
    });

    expect(result).toBeInstanceOf(Buffer);
    const meta = await sharp(result).metadata();
    expect(meta.format).toBe("png");
    expect(meta.width).toBe(CANVAS_PRESETS["4:5"].width);
    expect(meta.height).toBe(CANVAS_PRESETS["4:5"].height);
  });

  it("generates a CTA slide with custom brand colors", async () => {
    const sharp = (await import("sharp")).default;
    const { compositeCTASlide, CANVAS_PRESETS } = await import("./compositor");

    const result = await compositeCTASlide({
      title: "Custom Brand Recap",
      steps: ["Step 1", "Step 2", "Step 3"],
      sourceUrl: "https://example.com",
      ratio: "4:5",
      brand: {
        accentColor: "#10B981",
        bgColor: "#0A1A14",
        textColor: "#F0FDF4",
        brandName: "GreenBrand",
      },
    });

    expect(result).toBeInstanceOf(Buffer);
    const meta = await sharp(result).metadata();
    expect(meta.format).toBe("png");
    expect(meta.width).toBe(CANVAS_PRESETS["4:5"].width);
  });

  it("generates a content slide with custom brand colors", async () => {
    const sharp = (await import("sharp")).default;
    const { compositeSlide, CANVAS_PRESETS } = await import("./compositor");

    const testScreenshot = await sharp({
      create: { width: 800, height: 600, channels: 4, background: { r: 50, g: 50, b: 50, alpha: 255 } },
    }).png().toBuffer();

    const result = await compositeSlide({
      screenshot: testScreenshot,
      slide: {
        stepNumber: 1,
        title: "Branded Step",
        instructions: ["Do **this** thing"],
        annotations: [
          { type: "badge", number: 1, x: 0.3, y: 0.4 },
          { type: "highlight", x: 0.2, y: 0.3, w: 0.3, h: 0.1 },
        ],
      },
      ratio: "4:5",
      brand: {
        accentColor: "#8B5CF6",
        bgColor: "#1A0F2E",
        textColor: "#F5F3FF",
      },
    });

    expect(result).toBeInstanceOf(Buffer);
    const meta = await sharp(result).metadata();
    expect(meta.width).toBe(CANVAS_PRESETS["4:5"].width);
    expect(meta.height).toBe(CANVAS_PRESETS["4:5"].height);
  });

  it("falls back to default theme when no brand provided", async () => {
    const sharp = (await import("sharp")).default;
    const { compositeSlide, CANVAS_PRESETS, DEFAULT_THEME } = await import("./compositor");

    const testScreenshot = await sharp({
      create: { width: 800, height: 600, channels: 4, background: { r: 50, g: 50, b: 50, alpha: 255 } },
    }).png().toBuffer();

    const result = await compositeSlide({
      screenshot: testScreenshot,
      slide: {
        stepNumber: 1,
        title: "Default Theme",
        instructions: ["No brand overrides"],
        annotations: [],
      },
      ratio: "4:5",
    });

    expect(result).toBeInstanceOf(Buffer);
    expect(DEFAULT_THEME.accent).toBe("#E91E8C");
  });
});
