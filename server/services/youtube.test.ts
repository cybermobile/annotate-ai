import { describe, expect, it } from "vitest";
import { extractVideoId, findYouTubeVideos } from "./youtube";

describe("YouTube Service", () => {
  describe("extractVideoId", () => {
    it("extracts ID from standard watch URL", () => {
      expect(extractVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    });

    it("extracts ID from short URL", () => {
      expect(extractVideoId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    });

    it("extracts ID from embed URL", () => {
      expect(extractVideoId("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    });

    it("extracts ID from shorts URL", () => {
      expect(extractVideoId("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    });

    it("extracts ID from nocookie embed", () => {
      expect(extractVideoId("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    });

    it("extracts ID from mobile URL", () => {
      expect(extractVideoId("https://m.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    });

    it("extracts ID from URL with extra params", () => {
      expect(extractVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=120&list=PLx")).toBe("dQw4w9WgXcQ");
    });

    it("extracts raw 11-char ID", () => {
      expect(extractVideoId("dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    });

    it("returns null for invalid input", () => {
      expect(extractVideoId("")).toBeNull();
      expect(extractVideoId("https://google.com")).toBeNull();
      expect(extractVideoId("not-a-url")).toBeNull();
    });

    it("returns null for too-short IDs", () => {
      expect(extractVideoId("abc")).toBeNull();
    });
  });

  describe("findYouTubeVideos", () => {
    it("finds video IDs in iframe embeds", () => {
      const html = `
        <div>
          <iframe src="https://www.youtube.com/embed/abc12345678" width="560" height="315"></iframe>
        </div>
      `;
      const ids = findYouTubeVideos(html);
      expect(ids).toContain("abc12345678");
    });

    it("finds video IDs in href links", () => {
      const html = `
        <a href="https://www.youtube.com/watch?v=xyz98765432">Watch Video</a>
        <a href="https://youtu.be/def11111111">Short link</a>
      `;
      const ids = findYouTubeVideos(html);
      expect(ids).toContain("xyz98765432");
      expect(ids).toContain("def11111111");
    });

    it("finds bare YouTube URLs in text", () => {
      const html = `
        <p>Check out this video: https://www.youtube.com/watch?v=bare1234567 for more info</p>
      `;
      const ids = findYouTubeVideos(html);
      expect(ids).toContain("bare1234567");
    });

    it("deduplicates video IDs", () => {
      const html = `
        <iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe>
        <a href="https://www.youtube.com/watch?v=dQw4w9WgXcQ">Same video</a>
        <p>Also here: https://youtu.be/dQw4w9WgXcQ</p>
      `;
      const ids = findYouTubeVideos(html);
      expect(ids).toHaveLength(1);
      expect(ids[0]).toBe("dQw4w9WgXcQ");
    });

    it("finds data-src iframes (lazy loaded)", () => {
      const html = `<iframe data-src="https://www.youtube.com/embed/lazy1234567"></iframe>`;
      const ids = findYouTubeVideos(html);
      expect(ids).toContain("lazy1234567");
    });

    it("returns empty array for HTML with no YouTube content", () => {
      const html = `<div><p>No videos here</p><a href="https://google.com">Link</a></div>`;
      const ids = findYouTubeVideos(html);
      expect(ids).toHaveLength(0);
    });

    it("finds multiple unique videos", () => {
      const html = `
        <iframe src="https://www.youtube.com/embed/video1111111"></iframe>
        <iframe src="https://www.youtube.com/embed/video2222222"></iframe>
        <a href="https://youtu.be/video3333333">Third</a>
      `;
      const ids = findYouTubeVideos(html);
      expect(ids).toHaveLength(3);
    });
  });
});
