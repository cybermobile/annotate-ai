import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // ZIP download endpoint for batch export
  app.get("/api/download-zip/:projectId", async (req, res) => {
    try {
      const { getProject, getProjectImages } = await import("../db");
      const projectId = parseInt(req.params.projectId);
      const project = await getProject(projectId);
      if (!project) {
        res.status(404).json({ error: "Project not found" });
        return;
      }
      const images = await getProjectImages(projectId);
      if (images.length === 0) {
        res.status(404).json({ error: "No images found" });
        return;
      }

      const archiver = (await import("archiver")).default;
      const archive = archiver("zip", { zlib: { level: 6 } });

      res.setHeader("Content-Type", "application/zip");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="annotated-${projectId}.zip"`
      );

      archive.pipe(res);

      const fs = await import("fs/promises");
      const path = await import("path");
      const storageDir = process.env.STORAGE_DIR || "/app/uploads";

      for (const img of images) {
        try {
          // Try reading from local filesystem first
          const localPath = img.imageUrl.replace(/^\/uploads\//, "");
          const filePath = path.join(storageDir, localPath);
          const buffer = await fs.readFile(filePath);
          archive.append(buffer, { name: `slide-${img.stepNumber}.png` });
        } catch (e) {
          // Fallback to fetch for absolute URLs
          try {
            const imgResponse = await fetch(img.imageUrl);
            if (imgResponse.ok) {
              const buffer = Buffer.from(await imgResponse.arrayBuffer());
              archive.append(buffer, { name: `slide-${img.stepNumber}.png` });
            }
          } catch (e2) {
            console.error(`Failed to fetch image ${img.id}:`, e2);
          }
        }
      }

      await archive.finalize();
    } catch (err) {
      console.error("ZIP download error:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: "Failed to generate ZIP" });
      }
    }
  });
  // Serve uploaded files
  const uploadsDir = process.env.STORAGE_DIR || "/app/uploads";
  app.use("/uploads", express.static(uploadsDir));

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
