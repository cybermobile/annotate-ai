import * as cheerio from "cheerio";

export interface ScrapedImage {
  url: string;
  alt?: string;
  width?: number;
  height?: number;
  type: "screenshot" | "logo" | "image" | "video_thumbnail" | "og_image";
}

export interface ScrapedData {
  title: string;
  description: string;
  url: string;
  images: ScrapedImage[];
  screenshotUrl?: string;
  ogImage?: string;
  favicon?: string;
  headings: string[];
  bodyText: string;
  rawHtml?: string;           // raw HTML for deeper YouTube extraction
  youtubeVideoIds: string[];  // extracted YouTube video IDs
}

export async function scrapeUrl(url: string): Promise<ScrapedData> {
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  const title =
    $("title").text().trim() ||
    $('meta[property="og:title"]').attr("content")?.trim() ||
    $("h1").first().text().trim() ||
    "Untitled Page";

  const description =
    $('meta[name="description"]').attr("content")?.trim() ||
    $('meta[property="og:description"]').attr("content")?.trim() ||
    "";

  const ogImage =
    $('meta[property="og:image"]').attr("content")?.trim() ||
    $('meta[name="twitter:image"]').attr("content")?.trim();

  const favicon =
    $('link[rel="icon"]').attr("href")?.trim() ||
    $('link[rel="shortcut icon"]').attr("href")?.trim() ||
    "/favicon.ico";

  const headings: string[] = [];
  $("h1, h2, h3").each((_, el) => {
    const text = $(el).text().trim();
    if (text && text.length < 200) headings.push(text);
  });

  const bodyText = $("body").text().replace(/\s+/g, " ").trim().slice(0, 3000);

  const images: ScrapedImage[] = [];
  const seenUrls = new Set<string>();

  if (ogImage) {
    const resolvedOg = resolveUrl(ogImage, url);
    if (resolvedOg && !seenUrls.has(resolvedOg)) {
      seenUrls.add(resolvedOg);
      images.push({ url: resolvedOg, alt: "Open Graph Image", type: "og_image" });
    }
  }

  $("img").each((_, el) => {
    const src = $(el).attr("src") || $(el).attr("data-src") || $(el).attr("data-lazy-src");
    if (!src) return;
    const resolvedSrc = resolveUrl(src, url);
    if (!resolvedSrc || seenUrls.has(resolvedSrc)) return;

    const width = parseInt($(el).attr("width") || "0", 10);
    const height = parseInt($(el).attr("height") || "0", 10);
    if ((width > 0 && width < 50) || (height > 0 && height < 50)) return;
    if (resolvedSrc.startsWith("data:") || resolvedSrc.endsWith(".svg")) return;

    seenUrls.add(resolvedSrc);
    const alt = $(el).attr("alt")?.trim() || "";
    const isLogo =
      alt.toLowerCase().includes("logo") ||
      src.toLowerCase().includes("logo") ||
      $(el).closest("header, nav").length > 0;

    images.push({
      url: resolvedSrc,
      alt,
      width: width || undefined,
      height: height || undefined,
      type: isLogo ? "logo" : "image",
    });
  });

  // YouTube video detection — collect all video IDs from the page
  const youtubeVideoIds: string[] = [];
  const seenVideoIds = new Set<string>();

  // Check if the URL itself is a YouTube video
  const sourceVideoId = extractYouTubeId(url);
  if (sourceVideoId && !seenVideoIds.has(sourceVideoId)) {
    seenVideoIds.add(sourceVideoId);
    youtubeVideoIds.push(sourceVideoId);
  }

  // Scan iframes, links, and embeds
  $(
    'iframe[src*="youtube"], iframe[src*="youtu.be"], iframe[data-src*="youtube"], ' +
    'a[href*="youtube.com/watch"], a[href*="youtu.be"], a[href*="youtube.com/embed"], ' +
    'a[href*="youtube.com/shorts"], embed[src*="youtube"], object[data*="youtube"]'
  ).each((_, el) => {
    const src = $(el).attr("src") || $(el).attr("data-src") || $(el).attr("href") || $(el).attr("data") || "";
    const videoId = extractYouTubeId(src);
    if (videoId && !seenVideoIds.has(videoId)) {
      seenVideoIds.add(videoId);
      youtubeVideoIds.push(videoId);
    }
  });

  // Also scan bare YouTube URLs in the body text
  const bareYtUrls = html.match(/https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)[a-zA-Z0-9_-]{11}/g) || [];
  for (const ytUrl of bareYtUrls) {
    const videoId = extractYouTubeId(ytUrl);
    if (videoId && !seenVideoIds.has(videoId)) {
      seenVideoIds.add(videoId);
      youtubeVideoIds.push(videoId);
    }
  }

  // Add basic thumbnails to images list for scoring
  for (const videoId of youtubeVideoIds) {
    const thumbUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
    if (!seenUrls.has(thumbUrl)) {
      seenUrls.add(thumbUrl);
      images.push({ url: thumbUrl, alt: "YouTube Video Thumbnail", type: "video_thumbnail" });
    }
  }

  return {
    title,
    description,
    url,
    images: images.slice(0, 20),
    ogImage: ogImage ? (resolveUrl(ogImage, url) ?? undefined) : undefined,
    favicon: favicon ? (resolveUrl(favicon, url) ?? undefined) : undefined,
    headings: headings.slice(0, 15),
    bodyText,
    rawHtml: html,
    youtubeVideoIds,
  };
}

function resolveUrl(src: string, baseUrl: string): string | null {
  try {
    if (src.startsWith("//")) return `https:${src}`;
    if (src.startsWith("http")) return src;
    return new URL(src, baseUrl).href;
  } catch {
    return null;
  }
}

function extractYouTubeId(url: string): string | null {
  const match = url.match(
    /(?:youtube\.com\/(?:embed\/|watch\?v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  );
  return match ? match[1] : null;
}
