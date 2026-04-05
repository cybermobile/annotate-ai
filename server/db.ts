import { eq, desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, projects, generatedImages, brandSettings, InsertBrandSettings } from "../drizzle/schema";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.email, email)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// ── Project helpers ────────────────────────────────────────────

export async function createProject(data: {
  userId: number;
  url: string;
  aspectRatio: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db.insert(projects).values({
    userId: data.userId,
    url: data.url,
    aspectRatio: data.aspectRatio,
    status: "pending",
  });

  return { id: result[0].insertId };
}

export async function updateProjectStatus(
  projectId: number,
  status: "pending" | "scraping" | "analyzing" | "generating" | "completed" | "failed",
  statusMessage?: string,
  extra?: { scrapedData?: unknown; tutorialSteps?: unknown; title?: string }
) {
  const db = await getDb();
  if (!db) return;

  const updateData: Record<string, unknown> = { status };
  if (statusMessage !== undefined) updateData.statusMessage = statusMessage;
  if (extra?.scrapedData !== undefined) updateData.scrapedData = extra.scrapedData;
  if (extra?.tutorialSteps !== undefined) updateData.tutorialSteps = extra.tutorialSteps;
  if (extra?.title !== undefined) updateData.title = extra.title;

  await db.update(projects).set(updateData).where(eq(projects.id, projectId));
}

export async function getProject(projectId: number) {
  const db = await getDb();
  if (!db) return null;

  const result = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function getUserProjects(userId: number) {
  const db = await getDb();
  if (!db) return [];

  return db.select().from(projects).where(eq(projects.userId, userId)).orderBy(desc(projects.createdAt));
}

// ── Generated Image helpers ────────────────────────────────────

export async function saveGeneratedImage(data: {
  projectId: number;
  stepNumber: number;
  imageUrl: string;
  imageKey: string;
  width: number;
  height: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.insert(generatedImages).values(data);
}

export async function getProjectImages(projectId: number) {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(generatedImages)
    .where(eq(generatedImages.projectId, projectId))
    .orderBy(generatedImages.stepNumber);
}

// ── Brand Settings helpers ────────────────────────────────────

export async function getBrandSettings(userId: number) {
  const db = await getDb();
  if (!db) return null;

  const result = await db.select().from(brandSettings).where(eq(brandSettings.userId, userId)).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function upsertBrandSettings(data: {
  userId: number;
  brandName?: string | null;
  accentColor?: string;
  bgColor?: string;
  textColor?: string;
  logoUrl?: string | null;
  logoKey?: string | null;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const existing = await getBrandSettings(data.userId);

  if (existing) {
    const updateData: Record<string, unknown> = {};
    if (data.brandName !== undefined) updateData.brandName = data.brandName;
    if (data.accentColor !== undefined) updateData.accentColor = data.accentColor;
    if (data.bgColor !== undefined) updateData.bgColor = data.bgColor;
    if (data.textColor !== undefined) updateData.textColor = data.textColor;
    if (data.logoUrl !== undefined) updateData.logoUrl = data.logoUrl;
    if (data.logoKey !== undefined) updateData.logoKey = data.logoKey;

    await db.update(brandSettings).set(updateData).where(eq(brandSettings.userId, data.userId));
    return { ...existing, ...updateData };
  } else {
    const values: InsertBrandSettings = {
      userId: data.userId,
      brandName: data.brandName ?? null,
      accentColor: data.accentColor ?? "#EC4899",
      bgColor: data.bgColor ?? "#1A1A2E",
      textColor: data.textColor ?? "#FFFFFF",
      logoUrl: data.logoUrl ?? null,
      logoKey: data.logoKey ?? null,
    };
    await db.insert(brandSettings).values(values);
    return values;
  }
}
