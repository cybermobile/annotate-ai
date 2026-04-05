/**
 * YouTube Service
 * Extracts video IDs from URLs, embeds, and iframes.
 * Fetches high-res thumbnails and metadata via oEmbed API.
 */
import axios from "axios";

export interface YouTubeVideo {
  videoId: string;
  url: string;
  title: string;
  channelName: string;
  thumbnailUrl: string;       // best available thumbnail
  thumbnailBuffer?: Buffer;   // downloaded thumbnail bytes
}

// ── Video ID extraction ────────────────────────────────────────────

const YT_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

/**
 * Extract a YouTube video ID from various URL formats:
 *  - youtube.com/watch?v=ID
 *  - youtu.be/ID
 *  - youtube.com/embed/ID
 *  - youtube.com/v/ID
 *  - youtube.com/shorts/ID
 *  - youtube-nocookie.com/embed/ID
 */
export function extractVideoId(input: string): string | null {
  if (!input) return null;

  // Direct 11-char ID
  if (YT_ID_REGEX.test(input.trim())) return input.trim();

  try {
    const url = new URL(input.trim());
    const host = url.hostname.replace("www.", "");

    // youtu.be/ID
    if (host === "youtu.be") {
      const id = url.pathname.slice(1).split("/")[0];
      return id && YT_ID_REGEX.test(id) ? id : null;
    }

    // youtube.com or youtube-nocookie.com
    if (host === "youtube.com" || host === "youtube-nocookie.com" || host === "m.youtube.com") {
      // /watch?v=ID
      const v = url.searchParams.get("v");
      if (v && YT_ID_REGEX.test(v)) return v;

      // /embed/ID, /v/ID, /shorts/ID
      const pathMatch = url.pathname.match(/\/(embed|v|shorts)\/([a-zA-Z0-9_-]{11})/);
      if (pathMatch?.[2]) return pathMatch[2];
    }
  } catch {
    // not a valid URL, try regex fallback
  }

  // Regex fallback for embedded HTML fragments
  const fallback = input.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return fallback?.[1] ?? null;
}

/**
 * Scan HTML content for all YouTube video references.
 * Looks for:
 *  - <iframe> embeds
 *  - <a> links to YouTube
 *  - Bare YouTube URLs in text
 */
export function findYouTubeVideos(html: string): string[] {
  const ids = new Set<string>();

  // iframe src attributes
  const iframeSrcs = html.match(/(?:src|data-src)=["']([^"']*(?:youtube|youtu\.be)[^"']*)["']/gi) || [];
  for (const match of iframeSrcs) {
    const urlMatch = match.match(/["']([^"']+)["']/);
    if (urlMatch?.[1]) {
      const id = extractVideoId(urlMatch[1]);
      if (id) ids.add(id);
    }
  }

  // href links to YouTube
  const hrefLinks = html.match(/href=["']([^"']*(?:youtube\.com|youtu\.be)[^"']*)["']/gi) || [];
  for (const match of hrefLinks) {
    const urlMatch = match.match(/["']([^"']+)["']/);
    if (urlMatch?.[1]) {
      const id = extractVideoId(urlMatch[1]);
      if (id) ids.add(id);
    }
  }

  // Bare URLs in text
  const bareUrls = html.match(/https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)[a-zA-Z0-9_-]{11}/g) || [];
  for (const url of bareUrls) {
    const id = extractVideoId(url);
    if (id) ids.add(id);
  }

  return Array.from(ids);
}

// ── Metadata fetching ──────────────────────────────────────────────

/**
 * Get the best available thumbnail URL for a video.
 * Tries maxresdefault first, falls back to hqdefault.
 */
async function getBestThumbnail(videoId: string): Promise<string> {
  const candidates = [
    `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
    `https://img.youtube.com/vi/${videoId}/sddefault.jpg`,
    `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
  ];

  for (const url of candidates) {
    try {
      const res = await axios.head(url, { timeout: 5000 });
      // maxresdefault returns 200 but with a tiny placeholder if not available
      const contentLength = parseInt(res.headers["content-length"] || "0", 10);
      if (res.status === 200 && contentLength > 5000) {
        return url;
      }
    } catch {
      continue;
    }
  }

  // Fallback — hqdefault always exists
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}

/**
 * Fetch video metadata via YouTube oEmbed API (no API key required).
 */
async function fetchOEmbed(videoId: string): Promise<{ title: string; channelName: string }> {
  try {
    const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const res = await axios.get(url, { timeout: 8000 });
    return {
      title: res.data.title || "Untitled Video",
      channelName: res.data.author_name || "Unknown Channel",
    };
  } catch {
    return { title: "Untitled Video", channelName: "Unknown Channel" };
  }
}

/**
 * Download thumbnail image as a Buffer.
 */
async function downloadThumbnail(url: string): Promise<Buffer> {
  const res = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 15000,
  });
  return Buffer.from(res.data);
}

// ── Public API ─────────────────────────────────────────────────────

/**
 * Given a list of video IDs, fetch full metadata + thumbnails for each.
 * Limits to maxVideos to avoid overwhelming the pipeline.
 */
export async function resolveYouTubeVideos(
  videoIds: string[],
  maxVideos = 4
): Promise<YouTubeVideo[]> {
  const limited = videoIds.slice(0, maxVideos);
  const results: YouTubeVideo[] = [];

  for (const videoId of limited) {
    try {
      const [thumbnailUrl, meta] = await Promise.all([
        getBestThumbnail(videoId),
        fetchOEmbed(videoId),
      ]);

      const thumbnailBuffer = await downloadThumbnail(thumbnailUrl);

      results.push({
        videoId,
        url: `https://www.youtube.com/watch?v=${videoId}`,
        title: meta.title,
        channelName: meta.channelName,
        thumbnailUrl,
        thumbnailBuffer,
      });

      console.log(`[youtube] Resolved: "${meta.title}" by ${meta.channelName} (${videoId})`);
    } catch (err: any) {
      console.warn(`[youtube] Failed to resolve video ${videoId}:`, err.message);
    }
  }

  return results;
}
