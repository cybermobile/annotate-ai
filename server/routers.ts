import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { sdk } from "./_core/sdk";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { TRPCError } from "@trpc/server";
import {
  createProject,
  updateProjectStatus,
  getProject,
  getUserProjects,
  getProjectImages,
  saveGeneratedImage,
  getBrandSettings,
  upsertBrandSettings,
  getUserByEmail,
  getUserByOpenId,
  upsertUser,
} from "./db";
import { runAutoPipeline } from "./services/pipeline";
import { storagePut } from "./storage";
import { nanoid } from "nanoid";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
    register: publicProcedure
      .input(
        z.object({
          email: z.string().email("Invalid email address"),
          password: z.string().min(6, "Password must be at least 6 characters"),
          name: z.string().min(1, "Name is required"),
        })
      )
      .mutation(async ({ ctx, input }) => {
        // Check if user already exists with this email
        const existing = await getUserByEmail(input.email);
        if (existing) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "An account with this email already exists",
          });
        }

        const hashedPassword = await bcrypt.hash(input.password, 10);
        const openId = `email:${input.email}`;

        await upsertUser({
          openId,
          name: input.name,
          email: input.email,
          loginMethod: "email",
          lastSignedIn: new Date(),
        });

        // Update the password directly since upsertUser doesn't handle it
        const { getDb } = await import("./db");
        const db = await getDb();
        if (db) {
          const { users } = await import("../drizzle/schema");
          const { eq } = await import("drizzle-orm");
          await db.update(users).set({ password: hashedPassword }).where(eq(users.openId, openId));
        }

        const user = await getUserByOpenId(openId);
        if (!user) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to create user",
          });
        }

        // Create session token and set cookie (same pattern as OAuth callback)
        const sessionToken = await sdk.createSessionToken(openId, {
          name: input.name,
          expiresInMs: ONE_YEAR_MS,
        });

        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

        return user;
      }),
    login: publicProcedure
      .input(
        z.object({
          email: z.string().email("Invalid email address"),
          password: z.string().min(1, "Password is required"),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const user = await getUserByEmail(input.email);
        if (!user || !user.password) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Invalid email or password",
          });
        }

        const valid = await bcrypt.compare(input.password, user.password);
        if (!valid) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Invalid email or password",
          });
        }

        // Update last signed in
        await upsertUser({
          openId: user.openId,
          lastSignedIn: new Date(),
        });

        // Create session token and set cookie
        const sessionToken = await sdk.createSessionToken(user.openId, {
          name: user.name || "",
          expiresInMs: ONE_YEAR_MS,
        });

        const cookieOptions = getSessionCookieOptions(ctx.req);
        ctx.res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

        return user;
      }),
  }),

  brand: router({
    // Get current user's brand settings
    get: protectedProcedure.query(async ({ ctx }) => {
      const settings = await getBrandSettings(ctx.user.id);
      return settings ?? {
        userId: ctx.user.id,
        brandName: null,
        accentColor: "#EC4899",
        bgColor: "#1A1A2E",
        textColor: "#FFFFFF",
        logoUrl: null,
        logoKey: null,
      };
    }),

    // Update brand settings (colors, name)
    update: protectedProcedure
      .input(
        z.object({
          brandName: z.string().max(255).nullable().optional(),
          accentColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
          bgColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
          textColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const result = await upsertBrandSettings({
          userId: ctx.user.id,
          ...input,
        });
        return result;
      }),

    // Upload logo (accepts base64 encoded image)
    uploadLogo: protectedProcedure
      .input(
        z.object({
          base64: z.string(),
          mimeType: z.string().regex(/^image\/(png|jpeg|jpg|svg\+xml|webp)$/),
          fileName: z.string(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const buffer = Buffer.from(input.base64, "base64");
        const ext = input.mimeType.split("/")[1]?.replace("+xml", "") || "png";
        const key = `brand-logos/${ctx.user.id}-${nanoid(8)}.${ext}`;

        const { url } = await storagePut(key, buffer, input.mimeType);

        await upsertBrandSettings({
          userId: ctx.user.id,
          logoUrl: url,
          logoKey: key,
        });

        return { logoUrl: url };
      }),

    // Remove logo
    removeLogo: protectedProcedure.mutation(async ({ ctx }) => {
      await upsertBrandSettings({
        userId: ctx.user.id,
        logoUrl: null,
        logoKey: null,
      });
      return { success: true };
    }),
  }),

  project: router({
    // Create a new annotation project and start the pipeline
    generate: protectedProcedure
      .input(
        z.object({
          url: z.string().url(),
          description: z.string().optional(),
          aspectRatio: z.enum(["3:4", "4:5", "9:16"]).default("4:5"),
        })
      )
      .mutation(async ({ ctx, input }) => {
        // Create project in DB
        const { id: projectId } = await createProject({
          userId: ctx.user.id,
          url: input.url,
          aspectRatio: input.aspectRatio,
        });

        // Fetch brand settings for this user
        const brand = await getBrandSettings(ctx.user.id);

        // Run pipeline in background (don't await)
        runPipelineInBackground(
          projectId,
          input.url,
          input.description,
          input.aspectRatio,
          brand ? {
            accentColor: brand.accentColor,
            bgColor: brand.bgColor,
            textColor: brand.textColor,
            logoUrl: brand.logoUrl ?? undefined,
            brandName: brand.brandName ?? undefined,
          } : undefined
        );

        return { projectId };
      }),

    // Get project status and images
    status: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(async ({ ctx, input }) => {
        const project = await getProject(input.projectId);
        if (!project || project.userId !== ctx.user.id) {
          return null;
        }

        const images = await getProjectImages(input.projectId);

        return {
          id: project.id,
          url: project.url,
          title: project.title,
          aspectRatio: project.aspectRatio,
          status: project.status,
          statusMessage: project.statusMessage,
          createdAt: project.createdAt,
          images: images.map((img) => ({
            id: img.id,
            stepNumber: img.stepNumber,
            imageUrl: img.imageUrl,
            width: img.width,
            height: img.height,
          })),
        };
      }),

    // List all projects for the current user
    list: protectedProcedure.query(async ({ ctx }) => {
      const projectList = await getUserProjects(ctx.user.id);
      return projectList.map((p) => ({
        id: p.id,
        url: p.url,
        title: p.title,
        aspectRatio: p.aspectRatio,
        status: p.status,
        statusMessage: p.statusMessage,
        createdAt: p.createdAt,
      }));
    }),
  }),
});

// Background pipeline runner
async function runPipelineInBackground(
  projectId: number,
  url: string,
  description: string | undefined,
  ratio: string,
  brand?: {
    accentColor: string;
    bgColor: string;
    textColor: string;
    logoUrl?: string;
    brandName?: string;
  }
) {
  try {
    await updateProjectStatus(projectId, "scraping", "Starting pipeline...");

    const result = await runAutoPipeline({
      url,
      description,
      ratio,
      brand,
      onProgress: async (progress) => {
        const statusMap: Record<string, "scraping" | "analyzing" | "generating" | "completed" | "failed"> = {
          scraping: "scraping",
          analyzing: "analyzing",
          generating: "generating",
          completed: "completed",
          failed: "failed",
        };
        await updateProjectStatus(
          projectId,
          statusMap[progress.phase] || "generating",
          progress.message
        );
      },
    });

    // Save generated images to DB
    for (const img of result.images) {
      await saveGeneratedImage({
        projectId,
        stepNumber: img.stepNumber,
        imageUrl: img.url,
        imageKey: img.key,
        width: img.width,
        height: img.height,
      });
    }

    // Update project with final data
    await updateProjectStatus(projectId, "completed", `Generated ${result.images.length} annotated slides`, {
      scrapedData: {
        title: result.scrapedData.title,
        description: result.scrapedData.description,
        url: result.scrapedData.url,
        imageCount: result.scrapedData.images.length,
      },
      tutorialSteps: result.tutorialSteps,
      title: result.plan.carouselTitle || result.scrapedData.title,
    });
  } catch (err) {
    console.error("[pipeline] Background pipeline failed:", err);
    await updateProjectStatus(
      projectId,
      "failed",
      `Pipeline failed: ${err instanceof Error ? err.message : "Unknown error"}`
    );
  }
}

export type AppRouter = typeof appRouter;
