import { scrapeUrl, type ScrapedData, type ScrapedImage } from "./scraper";
import {
  captureScreenshot,
  fetchImageBuffer,
  preprocessScreenshot,
} from "./screenshot";
import {
  analyzeScreenshot,
  planCarousel,
  selectScreenshotCrop,
  verifyAnnotations,
  type SlideSpec,
  type CarouselPlan,
  type ScreenshotCrop,
  type VerificationResult,
} from "./analyzer";
import {
  compositeSlide,
  compositeHookSlide,
  compositeCTASlide,
  compositeYouTubeSlide,
  CANVAS_PRESETS,
  type BrandOverrides,
} from "./compositor";
import { scoreImages, type ScoredImage } from "./scorer";
import { resolveYouTubeVideos, type YouTubeVideo } from "./youtube";
import { storagePut } from "../storage";
import { nanoid } from "nanoid";
import sharp from "sharp";

export interface PipelineProgress {
  phase:
    | "scraping"
    | "scoring"
    | "analyzing"
    | "generating"
    | "completed"
    | "failed";
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

export type SlideVisualIntent =
  | "ui_step"
  | "supporting_visual"
  | "brand_asset"
  | "video_reference";

export interface SlideVisualCandidateMeta {
  id: string;
  source: "crop" | "viewport" | "page_asset";
  image: ScrapedImage;
}

interface SlideVisualCandidate extends SlideVisualCandidateMeta {
  buffer: Buffer;
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
  report({
    phase: "scraping",
    message: "Scraping URL for content and images...",
    currentStep: 0,
    totalSteps: 8,
  });

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
  report({
    phase: "scoring",
    message: "Scoring discovered images for relevance...",
    currentStep: 1,
    totalSteps: 8,
  });

  const tutorialDescription = description || `How to use ${scrapedData.title}`;

  const scoredImages: ScoredImage[] =
    scrapedData.images.length > 0
      ? scoreImages(scrapedData.images, {
          sourceUrl: url,
          topic: tutorialDescription,
          targetRatio: ratio,
          pagePublishedAt: scrapedData.pagePublishedAt,
          pageUpdatedAt: scrapedData.pageUpdatedAt,
        })
      : [];

  console.log(
    `[pipeline] Scored ${scoredImages.length} images. Top 3:`,
    scoredImages.slice(0, 3).map(i => ({
      url: i.url.slice(0, 60),
      score: i.score.toFixed(2),
      type: i.type,
    }))
  );

  // ── Step 3: Plan the carousel ────────────────────────────────
  report({
    phase: "analyzing",
    message: "Planning tutorial carousel structure...",
    currentStep: 2,
    totalSteps: 8,
  });

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
  report({
    phase: "generating",
    message: `Capturing screenshot of source page...`,
    currentStep: 3,
    totalSteps: 3 + totalOutputSlides,
  });

  let mainScreenshot: Buffer;
  try {
    mainScreenshot = await captureScreenshot({
      url,
      fullPage: true, // Capture full page to allow cropping different sections
      delay: 3000,
    });
    console.log(
      `[pipeline] Main screenshot captured: ${mainScreenshot.length} bytes`
    );
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
      })
        .png()
        .toBuffer();
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
  report({
    phase: "generating",
    message: "Creating hook/title frame...",
    currentStep: 4,
    totalSteps: 3 + totalOutputSlides,
  });

  const canvasSize = CANVAS_PRESETS[ratio] || CANVAS_PRESETS["4:5"];
  const images: PipelineResult["images"] = [];
  const tutorialSteps: SlideSpec[] = [];

  // Hook frame (slide 0) — uses best scored image or the viewport screenshot as background
  const hookBgImage =
    scoredImages.length > 0
      ? await fetchImageBufferSafe(scoredImages[0].url)
      : null;
  const reusableAssetCandidates = await buildReusableAssetCandidates({
    scoredImages,
    sourceUrl: url,
    limit: 5,
  });

  const hookBuffer = await compositeHookSlide({
    backgroundImage: hookBgImage || viewportScreenshot || mainScreenshot,
    title: plan.carouselTitle || tutorialDescription,
    subtitle: scrapedData.description || `A step-by-step guide`,
    ratio,
    brand,
  });

  const hookKey = `annotated/${nanoid()}-hook.png`;
  const { url: hookUrl, key: hookKeyFinal } = await storagePut(
    hookKey,
    hookBuffer,
    "image/png"
  );
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

    const slideGoal = contentSlides[i]?.description || tutorialDescription;
    const screenshotToUse = mainScreenshot || viewportScreenshot;
    const selectedCrop = await selectScreenshotCrop({
      screenshot: screenshotToUse,
      description: slideGoal,
      ratio,
    }).catch(() => undefined);

    const visualCandidates = await buildSlideVisualCandidates({
      sourceUrl: url,
      slideIndex: i,
      slideGoal,
      ratio,
      mainScreenshot,
      viewportScreenshot: viewportScreenshot || mainScreenshot,
      selectedCrop,
      reusableAssetCandidates,
      pagePublishedAt: scrapedData.pagePublishedAt,
      pageUpdatedAt: scrapedData.pageUpdatedAt,
    });

    const rankedCandidates = rankSlideVisualCandidates(
      visualCandidates.map(({ buffer: _buffer, ...candidate }) => candidate),
      {
        sourceUrl: url,
        title: contentSlides[i]?.title,
        description: slideGoal,
        targetRatio: ratio,
        pagePublishedAt: scrapedData.pagePublishedAt,
        pageUpdatedAt: scrapedData.pageUpdatedAt,
      }
    );

    const preferredCandidate = choosePreferredSlideVisual(rankedCandidates);
    const candidateQueue = Array.from(
      new Set(
        [
          preferredCandidate?.id,
          ...rankedCandidates.slice(0, 3).map(candidate => candidate.id),
        ].filter(Boolean)
      )
    )
      .map(id => visualCandidates.find(candidate => candidate.id === id))
      .filter((candidate): candidate is SlideVisualCandidate =>
        Boolean(candidate)
      );

    let finalizedAttempt:
      | {
          candidate: SlideVisualCandidate;
          processed: Buffer;
          slide: SlideSpec;
          composited: Buffer;
          verification: VerificationResult;
        }
      | undefined;
    let fallbackAttempt:
      | {
          candidate: SlideVisualCandidate;
          processed: Buffer;
          slide: SlideSpec;
          composited: Buffer;
          verification: VerificationResult;
        }
      | undefined;

    for (const candidate of candidateQueue) {
      console.log(
        `[pipeline] Slide ${i + 1}: trying visual source ${candidate.source}`
      );

      try {
        const attempt = await analyzeCandidateVisual({
          candidate,
          slideGoal,
          plannedTitle: contentSlides[i]?.title,
          stepNumber: i + 1,
          ratio,
          brand,
        });

        if (!fallbackAttempt) fallbackAttempt = attempt;

        if (attempt.verification.status === "missing_target") {
          console.warn(
            `[pipeline] Slide ${i + 1}: target missing from ${candidate.source}, trying next candidate`
          );
          continue;
        }

        finalizedAttempt = attempt;
        break;
      } catch (err) {
        console.warn(
          `[pipeline] Slide ${i + 1}: candidate ${candidate.source} failed:`,
          err instanceof Error ? err.message : err
        );
      }
    }

    const chosenAttempt = finalizedAttempt || fallbackAttempt;
    if (!chosenAttempt) {
      throw new Error(`No viable visual candidate found for slide ${i + 1}`);
    }

    let { slide, composited } = chosenAttempt;
    console.log(
      `[pipeline] Slide ${i + 1}: selected visual source ${chosenAttempt.candidate.source}`
    );

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

    console.log(
      `[pipeline] Slide ${i + 1} annotations:`,
      JSON.stringify(slide.annotations)
    );
    tutorialSteps.push(slide);
    composited = await compositeSlide({
      screenshot: chosenAttempt.processed,
      slide,
      ratio,
      brand,
    });

    const fileKey = `annotated/${nanoid()}-slide-${i + 1}.png`;
    const { url: imageUrl, key } = await storagePut(
      fileKey,
      composited,
      "image/png"
    );

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
        const { url: ytUrl, key: ytKeyFinal } = await storagePut(
          ytKey,
          ytSlide,
          "image/png"
        );
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
  report({
    phase: "generating",
    message: "Creating recap/CTA frame...",
    currentStep: ctaStep,
    totalSteps: ctaStep + 1,
  });

  const ctaBuffer = await compositeCTASlide({
    title: plan.carouselTitle || tutorialDescription,
    steps: tutorialSteps.map(s => s.title),
    sourceUrl: url,
    ratio,
    brand,
  });

  const ctaKey = `annotated/${nanoid()}-cta.png`;
  const { url: ctaUrl, key: ctaKeyFinal } = await storagePut(
    ctaKey,
    ctaBuffer,
    "image/png"
  );
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

async function cropScreenshotBuffer(
  buffer: Buffer,
  crop: ScreenshotCrop
): Promise<Buffer> {
  const meta = await sharp(buffer).metadata();
  const width = meta.width || 1;
  const height = meta.height || 1;

  const left = Math.max(0, Math.min(width - 1, Math.round(crop.left * width)));
  const top = Math.max(0, Math.min(height - 1, Math.round(crop.top * height)));
  const cropWidth = Math.max(
    1,
    Math.min(width - left, Math.round(crop.width * width))
  );
  const cropHeight = Math.max(
    1,
    Math.min(height - top, Math.round(crop.height * height))
  );

  return sharp(buffer)
    .extract({
      left,
      top,
      width: cropWidth,
      height: cropHeight,
    })
    .png()
    .toBuffer();
}

async function buildReusableAssetCandidates(opts: {
  scoredImages: ScoredImage[];
  sourceUrl: string;
  limit: number;
}): Promise<SlideVisualCandidate[]> {
  const { scoredImages, sourceUrl, limit } = opts;
  const candidates: SlideVisualCandidate[] = [];

  for (const img of scoredImages) {
    if (candidates.length >= limit) break;

    const buffer = await fetchImageBufferSafe(img.url);
    if (!buffer) continue;

    const normalized = await sharp(buffer).png().toBuffer();
    const meta = await sharp(normalized).metadata();
    const width = meta.width || img.width || 0;
    const height = meta.height || img.height || 0;

    if (img.type !== "logo" && (width < 200 || height < 120)) continue;

    candidates.push({
      id: `asset-${candidates.length}`,
      source: "page_asset",
      buffer: normalized,
      image: {
        ...img,
        width: img.width ?? (width || undefined),
        height: img.height ?? (height || undefined),
        url: `${img.url}#asset-${candidates.length}`,
      },
    });
  }

  return candidates;
}

async function buildSlideVisualCandidates(opts: {
  sourceUrl: string;
  slideIndex: number;
  slideGoal: string;
  ratio: string;
  mainScreenshot: Buffer;
  viewportScreenshot: Buffer;
  selectedCrop?: ScreenshotCrop;
  reusableAssetCandidates: SlideVisualCandidate[];
  pagePublishedAt?: string;
  pageUpdatedAt?: string;
}): Promise<SlideVisualCandidate[]> {
  const {
    sourceUrl,
    slideIndex,
    slideGoal,
    mainScreenshot,
    viewportScreenshot,
    selectedCrop,
    reusableAssetCandidates,
    pagePublishedAt,
    pageUpdatedAt,
  } = opts;

  const candidates: SlideVisualCandidate[] = [];
  const viewportMeta = await sharp(viewportScreenshot).metadata();
  candidates.push({
    id: `viewport-${slideIndex}`,
    source: "viewport",
    buffer: viewportScreenshot,
    image: {
      url: `${sourceUrl}#viewport-${slideIndex}`,
      alt: `Viewport screenshot for ${slideGoal}`,
      width: viewportMeta.width || undefined,
      height: viewportMeta.height || undefined,
      type: "screenshot",
      sourceContext: "page_image",
      publishedAt: pagePublishedAt,
      updatedAt: pageUpdatedAt,
    },
  });

  if (selectedCrop) {
    const croppedBuffer = await cropScreenshotBuffer(
      mainScreenshot,
      selectedCrop
    );
    const cropMeta = await sharp(croppedBuffer).metadata();
    candidates.unshift({
      id: `crop-${slideIndex}`,
      source: "crop",
      buffer: croppedBuffer,
      image: {
        url: `${sourceUrl}#crop-${slideIndex}`,
        alt: `Focused screenshot for ${slideGoal}`,
        width: cropMeta.width || undefined,
        height: cropMeta.height || undefined,
        type: "screenshot",
        sourceContext: "page_image",
        publishedAt: pagePublishedAt,
        updatedAt: pageUpdatedAt,
      },
    });
  }

  return [...candidates, ...reusableAssetCandidates];
}

async function analyzeCandidateVisual(opts: {
  candidate: SlideVisualCandidate;
  slideGoal: string;
  plannedTitle?: string;
  stepNumber: number;
  ratio: string;
  brand?: BrandOverrides;
}): Promise<{
  candidate: SlideVisualCandidate;
  processed: Buffer;
  slide: SlideSpec;
  composited: Buffer;
  verification: VerificationResult;
}> {
  const { candidate, slideGoal, plannedTitle, stepNumber, ratio, brand } = opts;
  const processed = await preprocessScreenshot(candidate.buffer, {
    roundCorners: true,
    cornerRadius: 12,
  });

  let slide: SlideSpec;
  try {
    const analysis = await analyzeScreenshot({
      screenshot: processed,
      description: slideGoal,
      totalSlides: 1,
    });
    slide = analysis.slides[0];
    slide.stepNumber = stepNumber;

    if (plannedTitle && (slide.title || "").length < 5) {
      slide.title = plannedTitle;
    }

    if (!slide.instructions || slide.instructions.length === 0) {
      slide.instructions = [slideGoal];
    }
  } catch (err) {
    console.error(`[pipeline] Analysis ${stepNumber} failed:`, err);
    slide = {
      stepNumber,
      title: plannedTitle || `Step ${stepNumber}`,
      instructions: [slideGoal],
      annotations: [{ type: "badge", number: 1, x: 0.5, y: 0.5 }],
    };
  }

  normalizeSlideAnnotations(slide);
  ensureMinimumAnnotations(slide);

  let composited = await compositeSlide({
    screenshot: processed,
    slide,
    ratio,
    brand,
  });

  const verification = await verifyAnnotations({
    compositedImage: composited,
    originalScreenshot: processed,
    slide,
    description: slideGoal,
  });

  if (
    verification.status === "corrected" &&
    verification.annotations &&
    annotationsAreValid(verification.annotations)
  ) {
    console.log(
      `[pipeline] Slide ${stepNumber}: re-compositing with ${verification.annotations.length} corrected annotations`
    );
    slide.annotations = verification.annotations;
    ensureMinimumAnnotations(slide);
    composited = await compositeSlide({
      screenshot: processed,
      slide,
      ratio,
      brand,
    });
  }

  return { candidate, processed, slide, composited, verification };
}

export function inferSlideVisualIntent(text: string): SlideVisualIntent {
  const normalized = text.toLowerCase();

  if (/\b(logo|brand|favicon|wordmark|identity)\b/.test(normalized)) {
    return "brand_asset";
  }

  if (/\b(video|youtube|thumbnail|watch|shorts?)\b/.test(normalized)) {
    return "video_reference";
  }

  if (
    /\b(click|tap|select|open|choose|enter|type|press|button|input|field|menu|nav|navigation|sidebar|header|toolbar|dropdown|dialog|modal|tab|link|cta|prompt|settings)\b/.test(
      normalized
    )
  ) {
    return "ui_step";
  }

  return "supporting_visual";
}

export function rankSlideVisualCandidates(
  candidates: SlideVisualCandidateMeta[],
  opts: {
    sourceUrl: string;
    title?: string;
    description: string;
    targetRatio: string;
    pagePublishedAt?: string;
    pageUpdatedAt?: string;
  }
): Array<
  SlideVisualCandidateMeta & { score: number; intent: SlideVisualIntent }
> {
  const topic = [opts.title, opts.description].filter(Boolean).join(" ");
  const intent = inferSlideVisualIntent(topic);
  const scored = scoreImages(
    candidates.map(candidate => candidate.image),
    {
      sourceUrl: opts.sourceUrl,
      topic,
      targetRatio: opts.targetRatio,
      pagePublishedAt: opts.pagePublishedAt,
      pageUpdatedAt: opts.pageUpdatedAt,
    }
  );
  const scoreByUrl = new Map(scored.map(image => [image.url, image.score]));

  return candidates
    .map(candidate => ({
      ...candidate,
      intent,
      score:
        (scoreByUrl.get(candidate.image.url) ?? 0) +
        getIntentAdjustment(candidate, intent),
    }))
    .sort((a, b) => b.score - a.score);
}

function choosePreferredSlideVisual(
  rankedCandidates: Array<
    SlideVisualCandidateMeta & { score: number; intent: SlideVisualIntent }
  >
) {
  if (rankedCandidates.length === 0) return undefined;

  const topCandidate = rankedCandidates[0];
  if (topCandidate.intent !== "ui_step") return topCandidate;

  const bestScreenshotCandidate = rankedCandidates.find(
    candidate => candidate.source !== "page_asset"
  );

  if (
    bestScreenshotCandidate &&
    bestScreenshotCandidate.score >= topCandidate.score - 0.08
  ) {
    return bestScreenshotCandidate;
  }

  return topCandidate;
}

function getIntentAdjustment(
  candidate: SlideVisualCandidateMeta,
  intent: SlideVisualIntent
): number {
  const isScreenshot =
    candidate.source === "crop" || candidate.source === "viewport";
  const imageType = candidate.image.type;

  if (intent === "ui_step") {
    return (
      (candidate.source === "crop" ? 0.18 : 0) +
      (candidate.source === "viewport" ? 0.1 : 0) +
      (!isScreenshot ? -0.14 : 0) +
      (imageType === "video_thumbnail" ? -0.18 : 0)
    );
  }

  if (intent === "supporting_visual") {
    return (
      (candidate.source === "page_asset" ? 0.12 : 0) +
      (imageType === "og_image" ? 0.08 : 0) +
      (candidate.source === "crop" ? -0.03 : 0)
    );
  }

  if (intent === "brand_asset") {
    return (
      (imageType === "logo" ? 0.28 : 0) +
      (imageType === "og_image" ? 0.08 : 0) +
      (isScreenshot ? -0.16 : 0)
    );
  }

  return (
    (imageType === "video_thumbnail" ? 0.24 : 0) +
    (candidate.source === "page_asset" ? 0.08 : -0.04)
  );
}

function normalizeSlideAnnotations(slide: SlideSpec) {
  if (!slide.annotations) return;

  const needsNormalize = slide.annotations.some(
    a => a.x > 1 || a.y > 1 || (a.w && a.w > 1) || (a.h && a.h > 1)
  );

  if (needsNormalize) {
    const vw = 1440;
    const vh = 900;
    for (const ann of slide.annotations) {
      if (ann.x > 1) ann.x = Math.min(ann.x / vw, 0.95);
      if (ann.y > 1) ann.y = Math.min(ann.y / vh, 0.95);
      if (ann.w && ann.w > 1) ann.w = Math.min(ann.w / vw, 0.9);
      if (ann.h && ann.h > 1) ann.h = Math.min(ann.h / vh, 0.9);
      if (ann.toX && ann.toX > 1) ann.toX = Math.min(ann.toX / vw, 0.95);
      if (ann.toY && ann.toY > 1) ann.toY = Math.min(ann.toY / vh, 0.95);
    }
  }

  for (const ann of slide.annotations) {
    ann.x = Math.max(0.02, Math.min(ann.x, 0.98));
    ann.y = Math.max(0.02, Math.min(ann.y, 0.98));
    if (ann.w) ann.w = Math.max(0.05, Math.min(ann.w, 0.95));
    if (ann.h) ann.h = Math.max(0.05, Math.min(ann.h, 0.95));
  }
}

function ensureMinimumAnnotations(slide: SlideSpec) {
  if (!slide.annotations || slide.annotations.length === 0) {
    slide.annotations = [
      { type: "highlight", x: 0.1, y: 0.3, w: 0.8, h: 0.4 },
      { type: "badge", number: 1, x: 0.1, y: 0.3 },
    ];
    return;
  }

  if (!slide.annotations.some(a => a.type === "highlight")) {
    slide.annotations.push({
      type: "highlight",
      x: 0.1,
      y: 0.3,
      w: 0.8,
      h: 0.4,
    });
  }

  if (!slide.annotations.some(a => a.type === "badge")) {
    slide.annotations.unshift({ type: "badge", number: 1, x: 0.5, y: 0.5 });
  }
}

function annotationsAreValid(annotations: SlideSpec["annotations"]) {
  return annotations.every(
    a =>
      a.x >= 0 &&
      a.x <= 1 &&
      a.y >= 0 &&
      a.y <= 1 &&
      (!a.w || (a.w > 0 && a.w <= 1)) &&
      (!a.h || (a.h > 0 && a.h <= 1))
  );
}
