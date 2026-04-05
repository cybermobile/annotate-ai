import sharp from "sharp";
import type { SlideSpec } from "./analyzer";

// ── Design tokens (defaults — overridable via BrandOverrides) ──
export const DEFAULT_THEME = {
  bg: "#111111",
  cardBg: "#1a1a1a",
  accent: "#E91E8C",
  accentAlt: "#FF4DA6",
  text: "#FFFFFF",
  textMuted: "#CCCCCC",
  divider: "#E91E8C",
  badgeBg: "#E91E8C",
  badgeText: "#FFFFFF",
  highlightBorder: "#E91E8C",
  highlightFill: "rgba(233,30,140,0.08)",
  arrowColor: "#E91E8C",
  shadowColor: "rgba(0,0,0,0.5)",
};

export interface BrandOverrides {
  accentColor?: string;
  bgColor?: string;
  textColor?: string;
  logoUrl?: string;
  brandName?: string;
}

function buildTheme(brand?: BrandOverrides) {
  if (!brand) return DEFAULT_THEME;

  const accent = brand.accentColor || DEFAULT_THEME.accent;
  const bg = brand.bgColor || DEFAULT_THEME.bg;
  const text = brand.textColor || DEFAULT_THEME.text;

  // Parse accent to get rgba fill
  const r = parseInt(accent.slice(1, 3), 16);
  const g = parseInt(accent.slice(3, 5), 16);
  const b = parseInt(accent.slice(5, 7), 16);

  return {
    bg,
    cardBg: adjustBrightness(bg, 15),
    accent,
    accentAlt: adjustBrightness(accent, 30),
    text,
    textMuted: adjustBrightness(text, -60),
    divider: accent,
    badgeBg: accent,
    badgeText: "#FFFFFF",
    highlightBorder: accent,
    highlightFill: `rgba(${r},${g},${b},0.08)`,
    arrowColor: accent,
    shadowColor: "rgba(0,0,0,0.5)",
  };
}

function adjustBrightness(hex: string, amount: number): string {
  const r = Math.min(255, Math.max(0, parseInt(hex.slice(1, 3), 16) + amount));
  const g = Math.min(255, Math.max(0, parseInt(hex.slice(3, 5), 16) + amount));
  const b = Math.min(255, Math.max(0, parseInt(hex.slice(5, 7), 16) + amount));
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

function parseHexBg(hex: string): { r: number; g: number; b: number; alpha: number } {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
    alpha: 255,
  };
}

// ── Canvas presets (vertical social formats) ───────────────────
export const CANVAS_PRESETS: Record<string, { width: number; height: number }> = {
  "3:4": { width: 1080, height: 1440 },
  "4:5": { width: 1080, height: 1350 },
  "9:16": { width: 1080, height: 1920 },
};

// Keep backward compat
export const THEME = DEFAULT_THEME;

// ── Logo fetching helper ──────────────────────────────────────
async function fetchLogoBuffer(logoUrl?: string): Promise<Buffer | null> {
  if (!logoUrl) return null;
  try {
    const res = await fetch(logoUrl);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    // Resize logo to max 120px height, preserving aspect ratio
    return sharp(buf)
      .resize({ height: 48, fit: "inside" })
      .png()
      .toBuffer();
  } catch {
    return null;
  }
}

/**
 * Main compositing function.
 * Takes a screenshot buffer + annotation spec → produces annotated tutorial card.
 */
export async function compositeSlide(opts: {
  screenshot: Buffer;
  slide: SlideSpec;
  ratio?: string;
  brand?: BrandOverrides;
}): Promise<Buffer> {
  const { screenshot, slide, ratio = "4:5", brand } = opts;
  const theme = buildTheme(brand);
  const canvas = CANVAS_PRESETS[ratio] || CANVAS_PRESETS["4:5"];
  const { width: W, height: H } = canvas;

  // Fetch logo if brand has one
  const logoBuf = await fetchLogoBuffer(brand?.logoUrl);

  // ── 1. Prepare screenshot ────────────────────────────────────
  const screenshotMeta = await sharp(screenshot).metadata();
  let processedScreenshot = sharp(screenshot);

  if (slide.screenshotCrop) {
    const c = slide.screenshotCrop;
    const sw = screenshotMeta.width || 800;
    const sh = screenshotMeta.height || 600;
    const cropLeft = Math.round(c.left * sw);
    const cropTop = Math.round(c.top * sh);
    const cropW = Math.min(Math.round(c.width * sw), sw - cropLeft);
    const cropH = Math.min(Math.round(c.height * sh), sh - cropTop);

    if (cropW > 0 && cropH > 0) {
      processedScreenshot = processedScreenshot.extract({
        left: cropLeft,
        top: cropTop,
        width: cropW,
        height: cropH,
      });
    }
  }

  // ── 2. Layout calculations ───────────────────────────────────
  const PADDING = 48;
  const HEADER_Y = 48;
  const headerHeight = computeHeaderHeight(slide);
  const dividerY = HEADER_Y + headerHeight + 16;
  const instructionsY = dividerY + 24;
  const instructionsHeight = computeInstructionsHeight(slide);
  const screenshotY = instructionsY + instructionsHeight + 24;
  const screenshotAreaW = W - PADDING * 2;
  const screenshotAreaH = H - screenshotY - PADDING;

  const screenshotBuf = await processedScreenshot
    .resize({
      width: Math.max(screenshotAreaW, 1),
      height: Math.max(screenshotAreaH, 1),
      fit: "cover",
      position: "top",
    })
    .png()
    .toBuffer();

  const finalScreenshotMeta = await sharp(screenshotBuf).metadata();
  const ssW = finalScreenshotMeta.width || screenshotAreaW;
  const ssH = finalScreenshotMeta.height || screenshotAreaH;
  const ssX = Math.round((W - ssW) / 2);
  const ssY = screenshotY;

  // ── 3. Build SVG overlay ─────────────────────────────────────
  const svgParts: string[] = [];

  svgParts.push(renderHeader(slide, W, HEADER_Y, PADDING, theme));
  svgParts.push(
    `<line x1="${PADDING}" y1="${dividerY}" x2="${W - PADDING}" y2="${dividerY}" stroke="${theme.divider}" stroke-width="3"/>`
  );
  svgParts.push(renderInstructions(slide, W, instructionsY, PADDING, theme));
  svgParts.push(
    `<rect x="${ssX - 2}" y="${ssY - 2}" width="${ssW + 4}" height="${ssH + 4}" rx="12" fill="none" stroke="#333" stroke-width="1" />`
  );

  if (slide.annotations) {
    svgParts.push(renderAnnotations(slide.annotations, ssX, ssY, ssW, ssH, theme));
  }

  // Logo watermark in bottom-right corner
  // (rendered as image composite, not SVG)

  const svgOverlay = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <style>
      text { font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif; }
    </style>
    ${svgParts.join("\n")}
  </svg>`;

  // ── 4. Composite everything ──────────────────────────────────
  const composites: sharp.OverlayOptions[] = [
    { input: screenshotBuf, left: ssX, top: ssY },
    { input: Buffer.from(svgOverlay), left: 0, top: 0 },
  ];

  // Add logo watermark if available
  if (logoBuf) {
    const logoMeta = await sharp(logoBuf).metadata();
    const logoW = logoMeta.width || 48;
    composites.push({
      input: logoBuf,
      left: W - logoW - PADDING,
      top: H - (logoMeta.height || 48) - 20,
    });
  }

  const result = await sharp({
    create: {
      width: W,
      height: H,
      channels: 4,
      background: parseHexBg(theme.bg),
    },
  })
    .composite(composites)
    .png({ quality: 95 })
    .toBuffer();

  return result;
}

// ── SVG Renderers ──────────────────────────────────────────────

function computeHeaderHeight(slide: SlideSpec): number {
  const titleLen = (slide.title || "").length;
  const titleLines = Math.max(1, Math.ceil(titleLen / 24));
  return 40 + titleLines * 52;
}

function computeInstructionsHeight(slide: SlideSpec): number {
  const items = slide.instructions || [];
  return items.length * 38 + 8;
}

function wrapText(text: string, maxCharsPerLine: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (current.length + word.length + 1 > maxCharsPerLine && current.length > 0) {
      lines.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function renderHeader(slide: SlideSpec, W: number, startY: number, padding: number, theme: typeof DEFAULT_THEME): string {
  const parts: string[] = [];
  let y = startY + 44;

  if (slide.stepNumber) {
    const badgeCx = padding + 28;
    const badgeCy = y - 14;
    parts.push(`
      <circle cx="${badgeCx}" cy="${badgeCy}" r="24" fill="${theme.badgeBg}"/>
      <text x="${badgeCx}" y="${badgeCy + 8}" text-anchor="middle" font-size="22" font-weight="800" fill="${theme.badgeText}">${String(slide.stepNumber).padStart(2, "0")}</text>
    `);
  }

  const titleX = slide.stepNumber ? padding + 64 : padding;
  const maxTitleWidth = W - titleX - padding;
  const maxChars = Math.floor(maxTitleWidth / 22);
  const titleLines = wrapText(slide.title || "Step", maxChars);

  for (let i = 0; i < titleLines.length; i++) {
    parts.push(
      `<text x="${titleX}" y="${y + i * 48}" font-size="42" font-weight="800" fill="${theme.text}" letter-spacing="-0.5">${escapeXml(titleLines[i])}</text>`
    );
  }

  return parts.join("\n");
}

function renderInstructions(
  slide: SlideSpec,
  W: number,
  startY: number,
  padding: number,
  theme: typeof DEFAULT_THEME
): string {
  const items = slide.instructions || [];
  const parts: string[] = [];
  let y = startY;
  const maxChars = Math.floor((W - padding * 2 - 30) / 12);

  for (const item of items) {
    // Wrap long instruction text
    const lines = wrapText(item.replace(/\*\*/g, ""), maxChars);
    for (let i = 0; i < lines.length; i++) {
      y += 30;
      const prefix = i === 0 ? "\u2192 " : "   ";
      parts.push(
        `<text x="${padding}" y="${y}" font-size="20" font-weight="400" fill="${theme.textMuted}" xml:space="preserve">${prefix}${escapeXml(lines[i])}</text>`
      );
    }
    y += 4;
  }

  return parts.join("\n");
}

function renderAnnotations(
  annotations: SlideSpec["annotations"],
  ssX: number,
  ssY: number,
  ssW: number,
  ssH: number,
  theme: typeof DEFAULT_THEME
): string {
  const parts: string[] = [];

  // First pass: render highlights and collect their positions
  const highlightPositions: Array<{ x: number; y: number; w: number; h: number }> = [];
  for (const ann of annotations) {
    if (ann.type === "highlight") {
      const absX = ssX + Math.round(ann.x * ssW);
      const absY = ssY + Math.round(ann.y * ssH);
      let w = Math.round((ann.w || 0.2) * ssW);
      let h = Math.round((ann.h || 0.08) * ssH);
      w = Math.min(w, ssX + ssW - absX);
      h = Math.min(h, ssY + ssH - absY);
      parts.push(renderHighlight(absX, absY, w, h, theme));
      highlightPositions.push({ x: absX, y: absY, w, h });
    }
  }

  // Second pass: render badges on top-left corner of nearest highlight
  const badgePositions: Array<{ x: number; y: number }> = [];
  for (const ann of annotations) {
    if (ann.type === "badge") {
      const absX = ssX + Math.round(ann.x * ssW);
      const absY = ssY + Math.round(ann.y * ssH);

      if (highlightPositions.length > 0) {
        let nearest = highlightPositions[0];
        let minDist = Infinity;
        for (const hl of highlightPositions) {
          const hlCx = hl.x + hl.w / 2;
          const hlCy = hl.y + hl.h / 2;
          const dist = Math.hypot(absX - hlCx, absY - hlCy);
          if (dist < minDist) { minDist = dist; nearest = hl; }
        }
        const bx = nearest.x - 8;
        const by = nearest.y - 8;
        parts.push(renderBadge(ann.number || 1, bx, by, theme));
        badgePositions.push({ x: bx, y: by });
      } else {
        parts.push(renderBadge(ann.number || 1, absX, absY, theme));
        badgePositions.push({ x: absX, y: absY });
      }
    }
  }

  // Third pass: render arrows FROM badge TO highlight center, and labels near highlights
  for (const ann of annotations) {
    if (ann.type === "arrow") {
      // Snap arrow: start from first badge, end at first highlight center
      const startPos = badgePositions.length > 0
        ? badgePositions[0]
        : { x: ssX + Math.round(ann.x * ssW), y: ssY + Math.round(ann.y * ssH) };
      const endPos = highlightPositions.length > 0
        ? { x: highlightPositions[0].x + highlightPositions[0].w / 2, y: highlightPositions[0].y + highlightPositions[0].h / 2 }
        : { x: ssX + Math.round((ann.toX || 0.5) * ssW), y: ssY + Math.round((ann.toY || 0.5) * ssH) };
      parts.push(renderArrow(startPos.x, startPos.y, endPos.x, endPos.y, ann.curve, theme));
    } else if (ann.type === "label") {
      // Snap label near the highlight if one exists
      if (highlightPositions.length > 0) {
        const hl = highlightPositions[0];
        parts.push(renderLabel(ann.text || "", hl.x + hl.w + 10, hl.y + hl.h / 2, theme));
      } else {
        const absX = ssX + Math.round(ann.x * ssW);
        const absY = ssY + Math.round(ann.y * ssH);
        parts.push(renderLabel(ann.text || "", absX, absY, theme));
      }
    }
  }

  return parts.join("\n");
}

function renderBadge(number: number, cx: number, cy: number, theme: typeof DEFAULT_THEME): string {
  const r = 20;
  return `
    <circle cx="${cx}" cy="${cy}" r="${r + 3}" fill="${theme.shadowColor}" />
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="${theme.badgeBg}" stroke="${theme.text}" stroke-width="2.5"/>
    <text x="${cx}" y="${cy + 7}" text-anchor="middle" font-size="20" font-weight="800" fill="${theme.badgeText}">${number}</text>
  `;
}

function renderHighlight(x: number, y: number, w: number, h: number, theme: typeof DEFAULT_THEME): string {
  return `
    <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8"
      fill="${theme.highlightFill}" stroke="${theme.highlightBorder}" stroke-width="2.5"/>
  `;
}

function renderArrow(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  curve: "left" | "right" = "right",
  theme: typeof DEFAULT_THEME
): string {
  const midX = (fromX + toX) / 2;
  const midY = (fromY + toY) / 2;
  const offset = curve === "left" ? -60 : 60;
  const ctrlX = midX + offset;
  const ctrlY = midY - 40;

  const angle = Math.atan2(toY - ctrlY, toX - ctrlX);
  const headLen = 14;
  const a1x = toX - headLen * Math.cos(angle - 0.4);
  const a1y = toY - headLen * Math.sin(angle - 0.4);
  const a2x = toX - headLen * Math.cos(angle + 0.4);
  const a2y = toY - headLen * Math.sin(angle + 0.4);

  return `
    <path d="M${fromX},${fromY} Q${ctrlX},${ctrlY} ${toX},${toY}"
      fill="none" stroke="${theme.arrowColor}" stroke-width="3" stroke-linecap="round"/>
    <polygon points="${toX},${toY} ${a1x},${a1y} ${a2x},${a2y}" fill="${theme.arrowColor}"/>
  `;
}

function renderLabel(text: string, x: number, y: number, theme: typeof DEFAULT_THEME): string {
  const padX = 12;
  const textWidth = text.length * 10;
  return `
    <rect x="${x - padX}" y="${y - 28}" width="${textWidth + padX * 2}" height="28" rx="6"
      fill="${theme.cardBg}" stroke="${theme.accent}" stroke-width="1.5"/>
    <text x="${x}" y="${y - 8}" font-size="16" font-weight="600" fill="${theme.text}">${escapeXml(text)}</text>
  `;
}

// ── Helpers ────────────────────────────────────────────────────

function parseBoldText(text: string): Array<{ text: string; bold: boolean }> {
  const segments: Array<{ text: string; bold: boolean }> = [];
  const re = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match;
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index), bold: false });
    }
    segments.push({ text: match[1], bold: true });
    lastIndex = re.lastIndex;
  }
  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), bold: false });
  }
  return segments.length ? segments : [{ text, bold: false }];
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// ── Hook/Title Slide ──────────────────────────────────────────

export async function compositeHookSlide(opts: {
  backgroundImage: Buffer;
  title: string;
  subtitle: string;
  ratio?: string;
  brand?: BrandOverrides;
}): Promise<Buffer> {
  const { backgroundImage, title, subtitle, ratio = "4:5", brand } = opts;
  const theme = buildTheme(brand);
  const canvas = CANVAS_PRESETS[ratio] || CANVAS_PRESETS["4:5"];
  const { width: W, height: H } = canvas;

  const logoBuf = await fetchLogoBuffer(brand?.logoUrl);

  const bgBuf = await sharp(backgroundImage)
    .resize({ width: W, height: H, fit: "cover" })
    .blur(30)
    .modulate({ brightness: 0.3 })
    .png()
    .toBuffer();

  const titleLines = wrapText(title, 20);
  const subtitleLines = wrapText(subtitle, 40);

  const titleStartY = Math.round(H * 0.35);
  const PADDING = 64;

  let svgContent = "";

  // Accent line at top
  svgContent += `<rect x="${PADDING}" y="${Math.round(H * 0.25)}" width="80" height="5" rx="2.5" fill="${theme.accent}"/>`;

  // Brand name above title if set
  if (brand?.brandName) {
    svgContent += `<text x="${PADDING}" y="${Math.round(H * 0.25) - 20}" font-size="18" font-weight="600" fill="${theme.accent}" letter-spacing="2">${escapeXml(brand.brandName.toUpperCase())}</text>`;
  }

  // Title
  titleLines.forEach((line, i) => {
    svgContent += `<text x="${PADDING}" y="${titleStartY + i * 60}" font-size="52" font-weight="900" fill="${theme.text}" letter-spacing="-1">${escapeXml(line)}</text>`;
  });

  // Subtitle
  const subtitleY = titleStartY + titleLines.length * 60 + 32;
  subtitleLines.forEach((line, i) => {
    svgContent += `<text x="${PADDING}" y="${subtitleY + i * 32}" font-size="22" font-weight="400" fill="${theme.textMuted}">${escapeXml(line)}</text>`;
  });

  // Bottom accent bar
  svgContent += `<rect x="0" y="${H - 8}" width="${W}" height="8" fill="${theme.accent}"/>`;

  // Border frame
  svgContent += `<rect x="3" y="3" width="${W - 6}" height="${H - 6}" rx="4" fill="none" stroke="${theme.accent}" stroke-width="3" opacity="0.4"/>`;

  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <style>text { font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif; }</style>
    ${svgContent}
  </svg>`;

  const composites: sharp.OverlayOptions[] = [
    { input: Buffer.from(svg), left: 0, top: 0 },
  ];

  // Add logo in top-right corner of hook slide
  if (logoBuf) {
    const logoMeta = await sharp(logoBuf).metadata();
    const logoW = logoMeta.width || 48;
    composites.push({
      input: logoBuf,
      left: W - logoW - PADDING,
      top: PADDING,
    });
  }

  return sharp(bgBuf)
    .composite(composites)
    .png({ quality: 95 })
    .toBuffer();
}

// ── CTA/Recap Slide ──────────────────────────────────────────

export async function compositeCTASlide(opts: {
  title: string;
  steps: string[];
  sourceUrl: string;
  ratio?: string;
  brand?: BrandOverrides;
}): Promise<Buffer> {
  const { title, steps, sourceUrl, ratio = "4:5", brand } = opts;
  const theme = buildTheme(brand);
  const canvas = CANVAS_PRESETS[ratio] || CANVAS_PRESETS["4:5"];
  const { width: W, height: H } = canvas;
  const PADDING = 64;

  const logoBuf = await fetchLogoBuffer(brand?.logoUrl);

  let svgContent = "";

  // "Recap" label
  svgContent += `<rect x="${PADDING}" y="80" width="100" height="36" rx="18" fill="${theme.accent}"/>`;
  svgContent += `<text x="${PADDING + 50}" y="104" text-anchor="middle" font-size="16" font-weight="700" fill="${theme.badgeText}">RECAP</text>`;

  // Title
  const titleLines = wrapText(title, 24);
  const titleY = 160;
  titleLines.forEach((line, i) => {
    svgContent += `<text x="${PADDING}" y="${titleY + i * 52}" font-size="42" font-weight="800" fill="${theme.text}" letter-spacing="-0.5">${escapeXml(line)}</text>`;
  });

  // Divider
  const dividerY = titleY + titleLines.length * 52 + 20;
  svgContent += `<line x1="${PADDING}" y1="${dividerY}" x2="${W - PADDING}" y2="${dividerY}" stroke="${theme.divider}" stroke-width="3"/>`;

  // Steps list
  let stepY = dividerY + 48;
  steps.forEach((step, i) => {
    if (stepY > H - 200) return;

    const cx = PADDING + 20;
    svgContent += `<circle cx="${cx}" cy="${stepY - 6}" r="16" fill="${theme.accent}" opacity="0.15"/>`;
    svgContent += `<text x="${cx}" y="${stepY + 1}" text-anchor="middle" font-size="14" font-weight="700" fill="${theme.accent}">${i + 1}</text>`;

    const truncated = step.length > 45 ? step.slice(0, 42) + "..." : step;
    svgContent += `<text x="${PADDING + 48}" y="${stepY}" font-size="20" font-weight="500" fill="${theme.text}">${escapeXml(truncated)}</text>`;

    stepY += 48;
  });

  // CTA section at bottom
  const ctaY = H - 140;
  svgContent += `<rect x="${PADDING}" y="${ctaY}" width="${W - PADDING * 2}" height="60" rx="12" fill="${theme.accent}"/>`;
  svgContent += `<text x="${W / 2}" y="${ctaY + 38}" text-anchor="middle" font-size="20" font-weight="700" fill="${theme.badgeText}">Try it yourself \u2192</text>`;

  // Source URL
  const displayUrl = sourceUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const truncUrl = displayUrl.length > 50 ? displayUrl.slice(0, 47) + "..." : displayUrl;
  svgContent += `<text x="${W / 2}" y="${ctaY + 90}" text-anchor="middle" font-size="14" font-weight="400" fill="${theme.textMuted}">${escapeXml(truncUrl)}</text>`;

  // Bottom accent bar
  svgContent += `<rect x="0" y="${H - 8}" width="${W}" height="8" fill="${theme.accent}"/>`;

  // Border frame
  svgContent += `<rect x="3" y="3" width="${W - 6}" height="${H - 6}" rx="4" fill="none" stroke="${theme.accent}" stroke-width="3" opacity="0.4"/>`;

  // Brand name at bottom
  if (brand?.brandName) {
    svgContent += `<text x="${W / 2}" y="${H - 24}" text-anchor="middle" font-size="14" font-weight="600" fill="${theme.accent}" letter-spacing="1.5">${escapeXml(brand.brandName.toUpperCase())}</text>`;
  }

  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <style>text { font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif; }</style>
    ${svgContent}
  </svg>`;

  const composites: sharp.OverlayOptions[] = [
    { input: Buffer.from(svg), left: 0, top: 0 },
  ];

  // Add logo in top-right corner
  if (logoBuf) {
    const logoMeta = await sharp(logoBuf).metadata();
    const logoW = logoMeta.width || 48;
    composites.push({
      input: logoBuf,
      left: W - logoW - PADDING,
      top: PADDING,
    });
  }

  return sharp({
    create: {
      width: W,
      height: H,
      channels: 4,
      background: parseHexBg(theme.bg),
    },
  })
    .composite(composites)
    .png({ quality: 95 })
    .toBuffer();
}

// ── Text wrapping helper ──────────────────────────────────────

// ── YouTube Video Slide ──────────────────────────────────────

export async function compositeYouTubeSlide(opts: {
  thumbnailBuffer: Buffer;
  videoTitle: string;
  channelName: string;
  videoUrl: string;
  slideNumber?: number;
  ratio?: string;
  brand?: BrandOverrides;
}): Promise<Buffer> {
  const { thumbnailBuffer, videoTitle, channelName, videoUrl, slideNumber, ratio = "4:5", brand } = opts;
  const theme = buildTheme(brand);
  const canvas = CANVAS_PRESETS[ratio] || CANVAS_PRESETS["4:5"];
  const { width: W, height: H } = canvas;
  const PADDING = 64;

  const logoBuf = await fetchLogoBuffer(brand?.logoUrl);

  // ── 1. Prepare thumbnail ─────────────────────────────────────
  const thumbAreaW = W - PADDING * 2;
  const thumbAreaH = Math.round(thumbAreaW * 9 / 16); // 16:9 aspect ratio
  const thumbBuf = await sharp(thumbnailBuffer)
    .resize({ width: thumbAreaW, height: thumbAreaH, fit: "cover" })
    .png()
    .toBuffer();

  // ── 2. Layout calculations ───────────────────────────────────
  const headerY = 60;
  const badgeY = headerY + 10;
  const titleY = headerY + 44;
  const titleLines = wrapText(videoTitle, 26);
  const titleBlockHeight = titleLines.length * 52;
  const dividerY = titleY + titleBlockHeight + 16;
  const thumbY = dividerY + 32;

  // YouTube play button overlay position (center of thumbnail)
  const playCx = Math.round(W / 2);
  const playCy = thumbY + Math.round(thumbAreaH / 2);

  // Channel info below thumbnail
  const channelY = thumbY + thumbAreaH + 48;

  // ── 3. Build SVG overlay ─────────────────────────────────────
  let svgContent = "";

  // Step badge (if numbered)
  if (slideNumber) {
    const badgeCx = PADDING + 28;
    const badgeCy = badgeY + 14;
    svgContent += `
      <circle cx="${badgeCx}" cy="${badgeCy}" r="24" fill="${theme.badgeBg}"/>
      <text x="${badgeCx}" y="${badgeCy + 8}" text-anchor="middle" font-size="22" font-weight="800" fill="${theme.badgeText}">${String(slideNumber).padStart(2, "0")}</text>
    `;
  }

  // Video title
  const titleX = slideNumber ? PADDING + 64 : PADDING;
  titleLines.forEach((line, i) => {
    svgContent += `<text x="${titleX}" y="${titleY + i * 52}" font-size="42" font-weight="800" fill="${theme.text}" letter-spacing="-0.5">${escapeXml(line)}</text>`;
  });

  // Divider
  svgContent += `<line x1="${PADDING}" y1="${dividerY}" x2="${W - PADDING}" y2="${dividerY}" stroke="${theme.divider}" stroke-width="3"/>`;

  // Thumbnail border frame
  svgContent += `<rect x="${PADDING - 3}" y="${thumbY - 3}" width="${thumbAreaW + 6}" height="${thumbAreaH + 6}" rx="14" fill="none" stroke="${theme.accent}" stroke-width="3"/>`;

  // YouTube play button overlay
  const playR = 36;
  svgContent += `
    <circle cx="${playCx}" cy="${playCy}" r="${playR + 4}" fill="rgba(0,0,0,0.6)"/>
    <circle cx="${playCx}" cy="${playCy}" r="${playR}" fill="#FF0000"/>
    <polygon points="${playCx - 12},${playCy - 16} ${playCx - 12},${playCy + 16} ${playCx + 18},${playCy}" fill="white"/>
  `;

  // "Watch Video" label
  svgContent += `<text x="${PADDING}" y="${channelY}" font-size="18" font-weight="600" fill="${theme.accent}" letter-spacing="1.5">▶ WATCH VIDEO</text>`;

  // Channel name
  svgContent += `<text x="${PADDING}" y="${channelY + 36}" font-size="20" font-weight="500" fill="${theme.textMuted}">${escapeXml(channelName)}</text>`;

  // Description / instruction
  svgContent += `<text x="${PADDING}" y="${channelY + 72}" font-size="18" font-weight="400" fill="${theme.textMuted}">→ In-depth video guide covering this topic</text>`;

  // Video URL at bottom
  const displayUrl = videoUrl.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const truncUrl = displayUrl.length > 50 ? displayUrl.slice(0, 47) + "..." : displayUrl;
  svgContent += `<text x="${W / 2}" y="${H - 80}" text-anchor="middle" font-size="14" font-weight="400" fill="${theme.textMuted}">${escapeXml(truncUrl)}</text>`;

  // Bottom accent bar
  svgContent += `<rect x="0" y="${H - 8}" width="${W}" height="8" fill="${theme.accent}"/>`;

  // Border frame
  svgContent += `<rect x="3" y="3" width="${W - 6}" height="${H - 6}" rx="4" fill="none" stroke="${theme.accent}" stroke-width="3" opacity="0.4"/>`;

  // Brand name
  if (brand?.brandName) {
    svgContent += `<text x="${W / 2}" y="${H - 24}" text-anchor="middle" font-size="14" font-weight="600" fill="${theme.accent}" letter-spacing="1.5">${escapeXml(brand.brandName.toUpperCase())}</text>`;
  }

  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <style>text { font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif; }</style>
    ${svgContent}
  </svg>`;

  // ── 4. Composite everything ──────────────────────────────────
  const composites: sharp.OverlayOptions[] = [
    { input: thumbBuf, left: PADDING, top: thumbY },
    { input: Buffer.from(svg), left: 0, top: 0 },
  ];

  // Add logo in top-right corner
  if (logoBuf) {
    const logoMeta = await sharp(logoBuf).metadata();
    const logoW = logoMeta.width || 48;
    composites.push({
      input: logoBuf,
      left: W - logoW - PADDING,
      top: PADDING,
    });
  }

  return sharp({
    create: {
      width: W,
      height: H,
      channels: 4,
      background: parseHexBg(theme.bg),
    },
  })
    .composite(composites)
    .png({ quality: 95 })
    .toBuffer();
}
