import type { ScrapedImage } from "./scraper";

export interface ScoredImage extends ScrapedImage {
  score: number;
  scores: {
    relevance: number;
    firstParty: number;
    recency: number;
    readability: number;
    layoutFit: number;
  };
}

/**
 * Score images based on weighted criteria:
 * 0.35 relevance + 0.25 first-party + 0.15 recency + 0.15 readability + 0.10 layout fit
 */
export function scoreImages(
  images: ScrapedImage[],
  opts: {
    sourceUrl: string;
    topic?: string;
    targetRatio?: string;
  }
): ScoredImage[] {
  const { sourceUrl, topic = "", targetRatio = "4:5" } = opts;
  const sourceDomain = extractDomain(sourceUrl);

  return images
    .map((img) => {
      const relevance = computeRelevance(img, topic);
      const firstParty = computeFirstParty(img, sourceDomain);
      const recency = computeRecency(img);
      const readability = computeReadability(img);
      const layoutFit = computeLayoutFit(img, targetRatio);

      const score =
        0.35 * relevance +
        0.25 * firstParty +
        0.15 * recency +
        0.15 * readability +
        0.10 * layoutFit;

      return {
        ...img,
        score,
        scores: { relevance, firstParty, recency, readability, layoutFit },
      };
    })
    .sort((a, b) => b.score - a.score);
}

function computeRelevance(img: ScrapedImage, topic: string): number {
  let score = 0.5; // baseline

  // OG images and screenshots are highly relevant
  if (img.type === "og_image") score += 0.4;
  if (img.type === "screenshot") score += 0.35;
  if (img.type === "video_thumbnail") score += 0.3;

  // Check alt text for topic keywords
  if (topic && img.alt) {
    const topicWords = topic.toLowerCase().split(/\s+/);
    const altLower = img.alt.toLowerCase();
    const matches = topicWords.filter((w) => w.length > 3 && altLower.includes(w));
    score += Math.min(matches.length * 0.1, 0.3);
  }

  // Logos are less relevant for tutorial content
  if (img.type === "logo") score -= 0.2;

  return Math.max(0, Math.min(1, score));
}

function computeFirstParty(img: ScrapedImage, sourceDomain: string): number {
  try {
    const imgDomain = extractDomain(img.url);
    if (imgDomain === sourceDomain) return 1.0;
    // CDN subdomains often serve first-party content
    if (imgDomain.endsWith(`.${sourceDomain}`) || sourceDomain.endsWith(`.${imgDomain}`))
      return 0.8;
    // Common CDNs
    const cdnDomains = [
      "cloudfront.net",
      "amazonaws.com",
      "cloudinary.com",
      "imgix.net",
      "wp.com",
      "githubusercontent.com",
    ];
    if (cdnDomains.some((cdn) => imgDomain.endsWith(cdn))) return 0.6;
    return 0.2;
  } catch {
    return 0.3;
  }
}

function computeRecency(_img: ScrapedImage): number {
  // Without metadata timestamps, we use heuristics
  // Images from the page are assumed to be current
  return 0.7;
}

function computeReadability(img: ScrapedImage): number {
  // Larger images tend to be more readable
  const w = img.width || 0;
  const h = img.height || 0;

  if (w === 0 && h === 0) return 0.5; // unknown size

  const pixels = w * h;
  if (pixels > 500000) return 1.0; // large, very readable
  if (pixels > 200000) return 0.8;
  if (pixels > 50000) return 0.6;
  return 0.3; // small, likely icon
}

function computeLayoutFit(img: ScrapedImage, targetRatio: string): number {
  const w = img.width || 0;
  const h = img.height || 0;

  if (w === 0 || h === 0) return 0.5;

  const imgRatio = w / h;

  // Parse target ratio
  const [tw, th] = targetRatio.split(":").map(Number);
  const targetAspect = tw / th;

  // For vertical layouts, wider source images are better (more content to show)
  // since we'll be placing them inside a vertical frame
  if (imgRatio >= 1.0) return 0.9; // landscape → good for vertical cards
  if (imgRatio >= 0.7) return 0.7; // slightly portrait
  if (imgRatio >= targetAspect) return 0.5; // matches target
  return 0.3; // too narrow
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
