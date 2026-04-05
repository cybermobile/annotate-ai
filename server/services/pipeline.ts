import { scrapeUrl, type ScrapedData } from "./scraper";
import { captureScreenshot, fetchImageBuffer, preprocessScreenshot } from "./screenshot";
import { analyzeScreenshot, planCarousel, verifyAnnotations, type SlideSpec, type CarouselPlan } from "./analyzer";
import { compositeSlide, compositeHookSlide, compositeCTASlide, compositeYouTubeSlide, CANVAS_PRESETS, type BrandOverrides } from "./compositor";
import { scoreImages, type ScoredImage } from "./scorer";
import { resolveYouTubeVideos, type YouTubeVideo } from "./youtube";
import { storagePut } from "../storage";
import { nanoid } from "nanoid";
import sharp from "sharp";

export interface PipelineProgress {
  phase: "scraping" | "scoring" | "analyzing" | "generating" | "completed" | "failed";
  message: string;
  currentStep: number;
  totalSteps: number;
}

export type ProgressCallback = (progress: PipelineProgress) => void;

export interface PipelineResult {
  images: Array<{
    buffer: Buffer;
    stepNumber: number;
    key: string;
    url: string;
    width: number;
    height: number;
  }>;
  scrapedData: ScrapedData;
  plan: CarouselPlan;
  tutorialSteps: SlideSpec[];
}

/**
 * Full auto pipeline:
 * URL → Scrape → Score images → Plan carousel → Capture screenshots (source URL only)
 * → Analyze with vision → Composite annotated images (hook + content + CTA)
 */
export async function runAutoPipeline(opts: {
  url: string;
  description?: string;
  ratio?: string;
  brand?: BrandOverrides;
  onProgress?: ProgressCallback;
}): Promise<PipelineResult> {
  const { url, description, ratio = "4:5", brand, onProgress } = opts;

  const report = (p: Partial<PipelineProgress>) =>
    onProgress?.({
      phase: "scraping",
      message: "",
      currentStep: 0,
      totalSteps: 0,
      ...p,
    });

  // ── Step 1: Scrape the URL ───────────────────────────────────
  report({ phase: "scraping", message: "Scraping URL for content and images...", currentStep: 0, totalSteps: 8 });

  let scrapedData: ScrapedData;
  try {
    scrapedData = await scrapeUrl(url);
  } catch (err) {
    console.error("[pipeline] Scraping failed:", err);
    scrapedData = {
      title: "Website",
      description: description || "",
      url,
      images: [],
      headings: [],
      bodyText: "",
      youtubeVideoIds: [],
    };
  }

  // ── Step 2: Score discovered images ──────────────────────────
  report({ phase: "scoring", message: "Scoring discovered images for relevance...", currentStep: 1, totalSteps: 8 });

  const tutorialDescription = description || `How to use ${scrapedData.title}`;

  const scoredImages: ScoredImage[] = scrapedData.images.length > 0
    ? scoreImages(scrapedData.images, {
        sourceUrl: url,
        topic: tutorialDescription,
        targetRatio: ratio,
      })
    : [];

  console.log(`[pipeline] Scored ${scoredImages.length} images. Top 3:`,
    scoredImages.slice(0, 3).map(i => ({ url: i.url.slice(0, 60), score: i.score.toFixed(2), type: i.type }))
  );

  // ── Step 3: Plan the carousel ────────────────────────────────
  report({ phase: "analyzing", message: "Planning tutorial carousel structure...", currentStep: 2, totalSteps: 8 });

  const plan = await planCarousel({
    url,
    description: tutorialDescription,
    pageTitle: scrapedData.title,
    pageHeadings: scrapedData.headings,
    bodyText: scrapedData.bodyText,
  });

  // 3 focused content slides
  const contentSlides = plan.slides.slice(0, 3);
  const totalContentSlides = contentSlides.length;
  // Total = 1 hook + N content + 1 CTA
  const totalOutputSlides = totalContentSlides + 2;

  // ── Step 4: Capture ONE screenshot of the source URL ─────────
  // We capture a single high-quality screenshot of the source URL
  // and reuse it across all content slides. Each slide will crop/focus
  // on different regions based on the LLM analysis.
  report({ phase: "generating", message: `Capturing screenshot of source page...`, currentStep: 3, totalSteps: 3 + totalOutputSlides });

  let mainScreenshot: Buffer;
  try {
    mainScreenshot = await captureScreenshot({
      url,
      fullPage: true, // Capture full page to allow cropping different sections
      delay: 3000,
    });
    console.log(`[pipeline] Main screenshot captured: ${mainScreenshot.length} bytes`);
  } catch (err) {
    console.error("[pipeline] Main screenshot capture failed:", err);
    // Try with non-full-page as fallback
    try {
      mainScreenshot = await captureScreenshot({
        url,
        fullPage: false,
        delay: 3000,
      });
    } catch (err2) {
      console.error("[pipeline] Viewport screenshot also failed:", err2);
      // Generate a dark placeholder
      const canvas = CANVAS_PRESETS[ratio] || CANVAS_PRESETS["4:5"];
      mainScreenshot = await sharp({
        create: {
          width: canvas.width,
          height: Math.round(canvas.height * 0.5),
          channels: 4,
          background: { r: 26, g: 26, b: 26, alpha: 255 },
        },
      }).png().toBuffer();
    }
  }

  // Also capture viewport-only screenshot for slides that need it
  let viewportScreenshot: Buffer | null = null;
  try {
    viewportScreenshot = await captureScreenshot({
      url,
      fullPage: false,
      delay: 2000,
    });
  } catch {
    viewportScreenshot = mainScreenshot;
  }

  // ── Step 5: Generate hook frame ──────────────────────────────
  report({ phase: "generating", message: "Creating hook/title frame...", currentStep: 4, totalSteps: 3 + totalOutputSlides });

  const canvasSize = CANVAS_PRESETS[ratio] || CANVAS_PRESETS["4:5"];
  const images: PipelineResult["images"] = [];
  const tutorialSteps: SlideSpec[] = [];

  // Hook frame (slide 0) — uses best scored image or the viewport screenshot as background
  const hookBgImage = scoredImages.length > 0
    ? await fetchImageBufferSafe(scoredImages[0].url)
    : null;

  const hookBuffer = await compositeHookSlide({
    backgroundImage: hookBgImage || viewportScreenshot || mainScreenshot,
    title: plan.carouselTitle || tutorialDescription,
    subtitle: scrapedData.description || `A step-by-step guide`,
    ratio,
    brand,
  });

  const hookKey = `annotated/${nanoid()}-hook.png`;
  const { url: hookUrl, key: hookKeyFinal } = await storagePut(hookKey, hookBuffer, "image/png");
  images.push({
    buffer: hookBuffer,
    stepNumber: 0,
    key: hookKeyFinal,
    url: hookUrl,
    width: canvasSize.width,
    height: canvasSize.height,
  });

  // ── Step 6: Analyze and composite content slides ─────────────
  // Each slide uses the SAME source screenshot but the LLM analyzes it
  // with different descriptions to highlight different areas
  for (let i = 0; i < contentSlides.length; i++) {
    report({
      phase: "generating",
      message: `Analyzing & compositing slide ${i + 1}/${totalContentSlides}: ${contentSlides[i]?.title || ""}`,
      currentStep: 5 + i,
      totalSteps: 3 + totalOutputSlides,
    });

    // Use viewport screenshot — more predictable for annotation placement
    const screenshotToUse = viewportScreenshot || mainScreenshot;

    const processed = await preprocessScreenshot(screenshotToUse, {
      roundCorners: true,
      cornerRadius: 12,
    });

    // Ask LLM to analyze the screenshot with this slide's specific description
    let slide: SlideSpec;
    try {
      const analysis = await analyzeScreenshot({
        screenshot: processed,
        description: contentSlides[i]?.description || tutorialDescription,
        totalSlides: 1,
      });
      slide = analysis.slides[0];
      slide.stepNumber = i + 1;

      // Use planned title if analysis title is too short
      if (contentSlides[i]?.title && (slide.title || "").length < 5) {
        slide.title = contentSlides[i].title;
      }

      // Merge instructions from the plan if the analysis didn't produce good ones
      if (!slide.instructions || slide.instructions.length === 0) {
        slide.instructions = [contentSlides[i]?.description || "Follow the instructions"];
      }

      // Normalize coordinates — if LLM returned pixel values instead of 0-1 relative
      if (slide.annotations) {
        const needsNormalize = slide.annotations.some(a =>
          a.x > 1 || a.y > 1 || (a.w && a.w > 1) || (a.h && a.h > 1)
        );
        if (needsNormalize) {
          console.log(`[pipeline] Slide ${i + 1}: normalizing pixel coordinates to relative`);
          // Assume viewport is ~1440x900 based on screenshot config
          const vw = 1440, vh = 900;
          for (const ann of slide.annotations) {
            if (ann.x > 1) ann.x = Math.min(ann.x / vw, 0.95);
            if (ann.y > 1) ann.y = Math.min(ann.y / vh, 0.95);
            if (ann.w && ann.w > 1) ann.w = Math.min(ann.w / vw, 0.9);
            if (ann.h && ann.h > 1) ann.h = Math.min(ann.h / vh, 0.9);
            if (ann.toX && ann.toX > 1) ann.toX = Math.min(ann.toX / vw, 0.95);
            if (ann.toY && ann.toY > 1) ann.toY = Math.min(ann.toY / vh, 0.95);
          }
        }

        // Clamp all coordinates to valid range
        for (const ann of slide.annotations) {
          ann.x = Math.max(0.02, Math.min(ann.x, 0.98));
          ann.y = Math.max(0.02, Math.min(ann.y, 0.98));
          if (ann.w) ann.w = Math.max(0.05, Math.min(ann.w, 0.95));
          if (ann.h) ann.h = Math.max(0.05, Math.min(ann.h, 0.95));
        }
      }

      // Ensure every slide has at least a badge + highlight
      if (!slide.annotations || slide.annotations.length === 0) {
        slide.annotations = [
          { type: "highlight", x: 0.1, y: 0.3, w: 0.8, h: 0.4 },
          { type: "badge", number: 1, x: 0.1, y: 0.3 },
        ];
      } else if (!slide.annotations.some(a => a.type === "highlight")) {
        slide.annotations.push({ type: "highlight", x: 0.1, y: 0.3, w: 0.8, h: 0.4 });
      } else if (!slide.annotations.some(a => a.type === "badge")) {
        slide.annotations.unshift({ type: "badge", number: 1, x: 0.5, y: 0.5 });
      }
    } catch (err) {
      console.error(`[pipeline] Analysis ${i + 1} failed:`, err);
      slide = {
        stepNumber: i + 1,
        title: contentSlides[i]?.title || `Step ${i + 1}`,
        instructions: [contentSlides[i]?.description || "Follow the instructions"],
        annotations: [{ type: "badge", number: 1, x: 0.5, y: 0.5 }],
      };
    }

    // Renumber badges sequentially across all slides
    let badgeCount = 0;
    for (const prev of tutorialSteps) {
      badgeCount += prev.annotations.filter(a => a.type === "badge").length;
    }
    for (const ann of slide.annotations) {
      if (ann.type === "badge") {
        badgeCount++;
        ann.number = badgeCount;
      }
    }

    console.log(`[pipeline] Slide ${i + 1} annotations:`, JSON.stringify(slide.annotations));
    tutorialSteps.push(slide);

    let composited = await compositeSlide({
      screenshot: processed,
      slide,
      ratio,
      brand,
    });

    // Verification pass — disabled for now, first pass annotations are more reliable
    if (false) try {
      const corrected = await verifyAnnotations({
        compositedImage: composited,
        originalScreenshot: processed,
        slide,
        description: contentSlides[i]?.description || tutorialDescription,
      });

      if (corrected && corrected.length > 0) {
        // Validate corrected coordinates are within bounds (0-1)
        const valid = corrected.every(a =>
          a.x >= 0 && a.x <= 1 && a.y >= 0 && a.y <= 1 &&
          (!a.w || (a.w > 0 && a.w <= 1)) &&
          (!a.h || (a.h > 0 && a.h <= 1))
        );

        if (valid) {
          console.log(`[pipeline] Slide ${i + 1}: re-compositing with ${corrected.length} corrected annotations`);
          slide.annotations = corrected;
          if (!slide.annotations.some(a => a.type === "highlight")) {
            slide.annotations.push({ type: "highlight", x: 0.1, y: 0.3, w: 0.8, h: 0.4 });
          }
          if (!slide.annotations.some(a => a.type === "badge")) {
            slide.annotations.unshift({ type: "badge", number: 1, x: 0.5, y: 0.5 });
          }
          composited = await compositeSlide({
            screenshot: processed,
            slide,
            ratio,
            brand,
          });
        } else {
          console.warn(`[pipeline] Slide ${i + 1}: corrected annotations out of bounds, keeping original`);
        }
      }
    } catch (err) {
      console.warn(`[pipeline] Verification failed for slide ${i + 1}, keeping original:`, err instanceof Error ? err.message : err);
    }

    const fileKey = `annotated/${nanoid()}-slide-${i + 1}.png`;
    const { url: imageUrl, key } = await storagePut(fileKey, composited, "image/png");

    images.push({
      buffer: composited,
      stepNumber: i + 1,
      key,
      url: imageUrl,
      width: canvasSize.width,
      height: canvasSize.height,
    });
  }

  // ── Step 7: Skip YouTube slides — keep carousel focused ──────
  let youtubeVideos: YouTubeVideo[] = [];
  if (false && scrapedData.youtubeVideoIds.length > 0) {
    report({
      phase: "generating",
      message: `Fetching ${scrapedData.youtubeVideoIds.length} YouTube video(s)...`,
      currentStep: 5 + totalContentSlides,
      totalSteps: 3 + totalOutputSlides + scrapedData.youtubeVideoIds.length,
    });

    youtubeVideos = await resolveYouTubeVideos(scrapedData.youtubeVideoIds, 1);
    console.log(`[pipeline] Resolved ${youtubeVideos.length} YouTube videos`);

    for (let i = 0; i < youtubeVideos.length; i++) {
      const video = youtubeVideos[i];
      report({
        phase: "generating",
        message: `Creating YouTube slide: "${video.title.slice(0, 40)}..."`,
        currentStep: 6 + totalContentSlides + i,
        totalSteps: 3 + totalOutputSlides + youtubeVideos.length,
      });

      try {
        const ytSlide = await compositeYouTubeSlide({
          thumbnailBuffer: video.thumbnailBuffer!,
          videoTitle: video.title,
          channelName: video.channelName,
          videoUrl: video.url,
          slideNumber: totalContentSlides + i + 1,
          ratio,
          brand,
        });

        const ytKey = `annotated/${nanoid()}-youtube-${i + 1}.png`;
        const { url: ytUrl, key: ytKeyFinal } = await storagePut(ytKey, ytSlide, "image/png");
        images.push({
          buffer: ytSlide,
          stepNumber: totalContentSlides + i + 1,
          key: ytKeyFinal,
          url: ytUrl,
          width: canvasSize.width,
          height: canvasSize.height,
        });
      } catch (err) {
        console.error(`[pipeline] YouTube slide ${i + 1} failed:`, err);
      }
    }
  }

  // ── Step 8: Generate CTA frame ───────────────────────────────
  const ctaStep = 6 + totalContentSlides + youtubeVideos.length;
  report({ phase: "generating", message: "Creating recap/CTA frame...", currentStep: ctaStep, totalSteps: ctaStep + 1 });

  const ctaBuffer = await compositeCTASlide({
    title: plan.carouselTitle || tutorialDescription,
    steps: tutorialSteps.map((s) => s.title),
    sourceUrl: url,
    ratio,
    brand,
  });

  const ctaKey = `annotated/${nanoid()}-cta.png`;
  const { url: ctaUrl, key: ctaKeyFinal } = await storagePut(ctaKey, ctaBuffer, "image/png");
  images.push({
    buffer: ctaBuffer,
    stepNumber: totalContentSlides + 1,
    key: ctaKeyFinal,
    url: ctaUrl,
    width: canvasSize.width,
    height: canvasSize.height,
  });

  report({
    phase: "completed",
    message: `Generated ${images.length} annotated slides (hook + ${totalContentSlides} steps + CTA)!`,
    currentStep: 3 + totalOutputSlides,
    totalSteps: 3 + totalOutputSlides,
  });

  return { images, scrapedData, plan, tutorialSteps };
}

async function fetchImageBufferSafe(url: string): Promise<Buffer | null> {
  try {
    return await fetchImageBuffer(url);
  } catch {
    return null;
  }
}
