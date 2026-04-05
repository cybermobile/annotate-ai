# AnnotateAI

**Turn any website into annotated tutorial images — automatically.**

AnnotateAI is an AI-powered tool that transforms any webpage into a polished carousel of annotated tutorial slides, ready for Instagram, LinkedIn, or Pinterest. Paste a URL, and the system scrapes the page content, captures high-quality screenshots, and uses vision AI to analyze the interface and generate precise annotations — numbered badges, highlight boxes, directional arrows, and text callouts — all positioned on the actual UI elements.

## How It Works

1. **Scrape** — The engine fetches the target URL, extracts text content, headings, images, and metadata using Cheerio for HTML parsing.
2. **Screenshot** — High-quality screenshots are captured via ScreenshotOne API (with Steel.dev and Puppeteer as fallbacks), producing clean viewport captures of the live page.
3. **Plan** — An LLM reads the page content and identifies the 3 key workflow steps that form the tutorial narrative, generating a structured carousel plan.
4. **Analyze** — Each screenshot is sent to a vision model (Google Gemini 2.5 Flash via OpenRouter) which examines the UI and outputs precise annotation coordinates — where to place badges, highlights, arrows, and labels.
5. **Composite** — The annotation engine renders the final slides using Sharp and Canvas: screenshot with overlaid SVG annotations, step titles, instructions, and optional custom branding (colors, logos).

## Output

Each generation produces a 5-slide carousel:
- **Hook slide** — Eye-catching title card with blurred background
- **3 content slides** — Annotated screenshots with numbered steps, highlights, and callouts
- **CTA slide** — Recap of all steps with source link

Images are generated in three aspect ratios: 3:4 (Pinterest), 4:5 (Instagram), and 9:16 (Stories/Reels). Users can apply custom branding with accent colors, background colors, and logo overlays. All slides are downloadable individually or as a ZIP bundle.

## Tech Stack

- **Frontend:** React 19, TypeScript, Vite, TailwindCSS, Radix UI, tRPC
- **Backend:** Node.js, Express, tRPC, Drizzle ORM, MySQL
- **AI:** Google Gemini 2.5 Flash / Nano Banana 2 (via OpenRouter)
- **Screenshots:** ScreenshotOne, Steel.dev, Puppeteer
- **Image Processing:** Sharp, @napi-rs/canvas
- **Deployment:** Hostinger VPS, Dokploy, Docker, Traefik

## Getting Started

```bash
pnpm install
pnpm db:push
pnpm dev
```

Set the required environment variables:

```
DATABASE_URL=mysql://user:pass@localhost:3306/annotateai
JWT_SECRET=your-secret
BUILT_IN_FORGE_API_URL=https://openrouter.ai/api
BUILT_IN_FORGE_API_KEY=your-openrouter-key
LLM_MODEL=google/gemini-2.5-flash
SCREENSHOT_ONE_API_KEY=your-key
```

---

Built for the Hostinger Hackathon 2026.
