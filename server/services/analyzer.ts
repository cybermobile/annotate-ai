import { invokeLLM } from "../_core/llm";

const ANALYSIS_SYSTEM_PROMPT = `You are an expert UI/UX analyst. You examine a screenshot and place annotations on it for a tutorial slide.

COORDINATE SYSTEM:
- All coordinates are RELATIVE (0.0 to 1.0) within the screenshot
- x=0 left edge, x=1 right edge, y=0 top edge, y=1 bottom edge
- LOOK at the screenshot carefully before choosing coordinates

ANNOTATION TYPES:
- "badge": Numbered circle placed ON the center of a clickable element. { type: "badge", number: N, x, y }
- "highlight": Border rectangle around an element or section. x,y is top-left corner, w,h is size. Make highlights LARGE ENOUGH to cover the ENTIRE element or section — include padding around it. Don't make them too small. { type: "highlight", x, y, w, h }
- "arrow": Directional arrow between elements. { type: "arrow", x, y, toX, toY }
- "label": Short text callout near an element. { type: "label", text: "Click here", x, y }

GUIDELINES:
- Every slide MUST have ALL THREE: 1 badge, 1 highlight, and 1 label (callout text)
- The label is a short callout (2-5 words) like "Click here", "Sign up", "Main dashboard", "Select this option"
- Place badges directly on buttons, links, or input fields
- Highlight boxes should cover the ENTIRE relevant section generously
- Use arrows when showing flow between two separate elements
- Only annotate elements you can actually SEE in the screenshot

DO NOT use screenshotCrop.

OUTPUT — respond with ONLY this JSON, no markdown:
{
  "slides": [
    {
      "stepNumber": 1,
      "title": "Short title (3-5 words)",
      "instructions": ["Step instruction with **bold** element names"],
      "annotations": [
        { "type": "badge", "number": 1, "x": 0.5, "y": 0.3 },
        { "type": "highlight", "x": 0.35, "y": 0.25, "w": 0.3, "h": 0.1 },
        { "type": "label", "text": "Start here", "x": 0.6, "y": 0.2 }
      ]
    }
  ]
}`;

export interface SlideSpec {
  stepNumber: number;
  title: string;
  instructions: string[];
  screenshotCrop?: {
    left: number;
    top: number;
    width: number;
    height: number;
  };
  annotations: Array<{
    type: "badge" | "highlight" | "arrow" | "label";
    number?: number;
    text?: string;
    x: number;
    y: number;
    w?: number;
    h?: number;
    toX?: number;
    toY?: number;
    curve?: "left" | "right";
  }>;
}

export interface CarouselPlan {
  carouselTitle: string;
  slides: Array<{
    stepNumber: number;
    title: string;
    description: string;
    screenshotUrl?: string;
    screenshotSelector?: string;
    screenshotDelay?: number;
  }>;
  suggestedRatio?: string;
}

/**
 * Convert a screenshot buffer to a base64 data URL for LLM vision.
 */
function bufferToDataUrl(buffer: Buffer): string {
  const base64 = buffer.toString("base64");
  return `data:image/png;base64,${base64}`;
}

/**
 * Analyze a screenshot using LLM Vision to determine annotation placement.
 */
export async function analyzeScreenshot(opts: {
  screenshot: Buffer;
  description: string;
  totalSlides?: number;
}): Promise<{ slides: SlideSpec[] }> {
  const { screenshot, description, totalSlides = 1 } = opts;

  // Convert screenshot to base64 data URL for LLM vision
  const imageUrl = bufferToDataUrl(screenshot);

  const userPrompt = `Look at this screenshot and create ${totalSlides} tutorial slide(s).

GOAL: ${description}

For each slide you MUST include all three annotation types:
1. A "badge" — numbered circle placed on the key interactive element
2. A "highlight" — rectangle covering the relevant section generously
3. A "label" — short callout text (2-5 words) describing what the user should do, like "Click here" or "Enter your email"

Be precise with coordinates — look at where elements actually are in the image.`;

  const response = await invokeLLM({
    messages: [
      { role: "system", content: ANALYSIS_SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: { url: imageUrl, detail: "high" },
          },
          {
            type: "text",
            text: userPrompt,
          },
        ],
      },
    ],
  });

  const textContent =
    typeof response.choices[0]?.message?.content === "string"
      ? response.choices[0].message.content
      : Array.isArray(response.choices[0]?.message?.content)
        ? response.choices[0].message.content
            .filter((c): c is { type: "text"; text: string } => c.type === "text")
            .map((c) => c.text)
            .join("")
        : "";

  const cleaned = textContent.replace(/```json|```/g, "").trim();

  try {
    return JSON.parse(cleaned);
  } catch (e) {
    console.error("[analyzer] Failed to parse LLM response:", cleaned.slice(0, 500));
    // Return a fallback single slide
    return {
      slides: [
        {
          stepNumber: 1,
          title: "Tutorial Step",
          instructions: ["Follow the highlighted areas"],
          annotations: [{ type: "badge", number: 1, x: 0.5, y: 0.5 }],
        },
      ],
    };
  }
}

/**
 * Generate a high-level carousel plan from a URL description.
 *
 * IMPORTANT: The planner is constrained to ONLY use the provided source URL
 * for all screenshots. It must NOT invent or fabricate sub-URLs, as those
 * will 404 and produce broken screenshots.
 */
export async function planCarousel(opts: {
  url: string;
  description: string;
  pageTitle?: string;
  pageHeadings?: string[];
  bodyText?: string;
}): Promise<CarouselPlan> {
  const { url, description, pageTitle, pageHeadings, bodyText } = opts;

  const contextInfo = [
    pageTitle ? `Page title: ${pageTitle}` : "",
    pageHeadings?.length ? `Main headings: ${pageHeadings.slice(0, 8).join(", ")}` : "",
    bodyText ? `Page content excerpt: ${bodyText.slice(0, 1500)}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are a tutorial content planner. Given a URL, page content, and description, plan a focused social media carousel.

YOUR JOB:
Read the page content carefully. Identify the 3 KEY STEPS that form the main workflow or process described on the page. Each step should represent a meaningful action — not just a section heading.

RULES:
1. Create EXACTLY 3 content slides. No more, no less. Focus on the essential workflow.
2. Each slide = one clear action or concept the user needs to understand.
3. The "description" field is critical — it tells the annotation engine EXACTLY what UI element or area to highlight. Be very specific: "The blue 'Create Workspace' button in the top navigation bar" not just "Create a workspace".
4. The "screenshotUrl" for EVERY slide MUST be EXACTLY "${url}".
5. Think about what would make a compelling Instagram carousel — each slide should tell part of a story.

OUTPUT FORMAT — respond with ONLY this JSON, no markdown fences:
{
  "carouselTitle": "Short catchy title (max 8 words)",
  "slides": [
    {
      "stepNumber": 1,
      "title": "Short action title (3-5 words)",
      "description": "Specific description of what UI element to highlight and where it is on the page. Be precise about the element's visual appearance and position.",
      "screenshotUrl": "${url}"
    }
  ],
  "suggestedRatio": "4:5"
}`,
      },
      {
        role: "user",
        content: `Plan a tutorial carousel for:\nURL: ${url}\nDescription: ${description}\n\n${contextInfo}`,
      },
    ],
  });

  const text =
    typeof response.choices[0]?.message?.content === "string"
      ? response.choices[0].message.content
      : "";

  const cleaned = text.replace(/```json|```/g, "").trim();

  try {
    const parsed: CarouselPlan = JSON.parse(cleaned);

    // SAFETY: Force all screenshotUrls to be the source URL
    // This prevents the LLM from hallucinating URLs that will 404
    parsed.slides = parsed.slides.map((slide) => ({
      ...slide,
      screenshotUrl: url, // Always use the source URL
    }));

    return parsed;
  } catch {
    // Fallback plan — all slides use the source URL
    return {
      carouselTitle: description || "Tutorial",
      slides: [
        {
          stepNumber: 1,
          title: "Getting Started",
          description: `Overview of the main page — highlight the navigation and key entry points`,
          screenshotUrl: url,
          screenshotDelay: 3000,
        },
        {
          stepNumber: 2,
          title: "Key Features",
          description: `Highlight the main content area and key features visible on the page`,
          screenshotUrl: url,
          screenshotDelay: 3000,
        },
        {
          stepNumber: 3,
          title: "Next Steps",
          description: `Show call-to-action buttons, links, or sign-up areas on the page`,
          screenshotUrl: url,
          screenshotDelay: 3000,
        },
      ],
      suggestedRatio: "4:5",
    };
  }
}

/**
 * Verification pass — look at the composited image and check if annotations are correct.
 * Returns corrected annotations if needed, or null if they look fine.
 */
export async function verifyAnnotations(opts: {
  compositedImage: Buffer;
  originalScreenshot: Buffer;
  slide: SlideSpec;
  description: string;
}): Promise<SlideSpec["annotations"] | null> {
  const { compositedImage, originalScreenshot, slide, description } = opts;
  const compositeUrl = bufferToDataUrl(compositedImage);
  const originalUrl = bufferToDataUrl(originalScreenshot);

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You verify annotation placement on tutorial slides. You receive two images:
1. The original screenshot (clean, no annotations)
2. The composited slide (with annotations drawn on it)

Check if the annotations (numbered badges, highlight boxes, labels) are correctly placed on the relevant UI elements.

If annotations are WRONG (badge not on the element, highlight not covering the right area, or annotations missing), return corrected coordinates.
If annotations look CORRECT, respond with just: {"correct": true}

When correcting, use the ORIGINAL screenshot coordinates (relative 0.0-1.0).

OUTPUT — respond with ONLY JSON, no markdown:
{"correct": true}
OR
{"correct": false, "annotations": [
  {"type": "badge", "number": 1, "x": 0.5, "y": 0.3},
  {"type": "highlight", "x": 0.3, "y": 0.2, "w": 0.4, "h": 0.2},
  {"type": "label", "text": "Click here", "x": 0.7, "y": 0.3}
]}`
      },
      {
        role: "user",
        content: [
          { type: "text", text: `GOAL: ${description}\nCurrent annotations should highlight: ${slide.title}` },
          { type: "text", text: "ORIGINAL SCREENSHOT:" },
          { type: "image_url", image_url: { url: originalUrl, detail: "high" } },
          { type: "text", text: "COMPOSITED SLIDE (with annotations):" },
          { type: "image_url", image_url: { url: compositeUrl, detail: "high" } },
          { type: "text", text: "Are the annotations correctly placed on the right UI elements? If not, return corrected coordinates." },
        ],
      },
    ],
  });

  const textContent =
    typeof response.choices[0]?.message?.content === "string"
      ? response.choices[0].message.content
      : "";

  const cleaned = textContent.replace(/```json|```/g, "").trim();

  try {
    const result = JSON.parse(cleaned);
    if (result.correct) {
      console.log("[verify] Annotations look correct");
      return null;
    }
    if (result.annotations && result.annotations.length > 0) {
      console.log("[verify] Correcting annotations:", result.annotations.length);
      return result.annotations;
    }
    return null;
  } catch {
    console.warn("[verify] Failed to parse verification response");
    return null;
  }
}
