/**
 * Unified type exports
 * Import shared types from this single entry point.
 */

export type * from "../drizzle/schema";
export * from "./_core/errors";

// ---- Annotation Pipeline Types ----

export type AspectRatio = "3:4" | "4:5" | "9:16";

export interface AspectRatioConfig {
  width: number;
  height: number;
  label: string;
}

export const ASPECT_RATIOS: Record<AspectRatio, AspectRatioConfig> = {
  "3:4": { width: 900, height: 1200, label: "3:4 (Standard)" },
  "4:5": { width: 1080, height: 1350, label: "4:5 (Instagram)" },
  "9:16": { width: 1080, height: 1920, label: "9:16 (Stories/Reels)" },
};

export interface ScrapedImage {
  url: string;
  alt?: string;
  width?: number;
  height?: number;
  type: "screenshot" | "logo" | "image" | "video_thumbnail" | "og_image";
  sourceContext?: "og_meta" | "page_image" | "logo" | "video_thumbnail";
  discoveredOrder?: number;
  publishedAt?: string;
  updatedAt?: string;
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
  pagePublishedAt?: string;
  pageUpdatedAt?: string;
}

export interface TutorialStep {
  stepNumber: number;
  title: string;
  instructions: string[];
  highlightKeywords: string[];
  imageUrl?: string;
  imageType?: "screenshot" | "logo" | "image" | "video_thumbnail";
  annotations: AnnotationElement[];
}

export interface AnnotationElement {
  type: "badge" | "arrow" | "highlight_rect" | "text_callout" | "border_frame";
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  text?: string;
  color?: string;
  direction?: "up" | "down" | "left" | "right";
}

export interface GenerationProgress {
  projectId: number;
  status: string;
  statusMessage: string;
  currentStep: number;
  totalSteps: number;
  images: Array<{
    id: number;
    stepNumber: number;
    imageUrl: string;
    width: number;
    height: number;
  }>;
}
