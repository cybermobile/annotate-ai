import { int, json, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  password: varchar("password", { length: 255 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const projects = mysqlTable("projects", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  url: text("url").notNull(),
  title: text("title"),
  aspectRatio: varchar("aspectRatio", { length: 10 }).notNull().default("4:5"),
  status: mysqlEnum("status", ["pending", "scraping", "analyzing", "generating", "completed", "failed"]).default("pending").notNull(),
  statusMessage: text("statusMessage"),
  scrapedData: json("scrapedData"),
  tutorialSteps: json("tutorialSteps"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Project = typeof projects.$inferSelect;
export type InsertProject = typeof projects.$inferInsert;

export const generatedImages = mysqlTable("generatedImages", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  stepNumber: int("stepNumber").notNull(),
  imageUrl: text("imageUrl").notNull(),
  imageKey: text("imageKey").notNull(),
  width: int("width").notNull(),
  height: int("height").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type GeneratedImage = typeof generatedImages.$inferSelect;
export type InsertGeneratedImage = typeof generatedImages.$inferInsert;

export const brandSettings = mysqlTable("brandSettings", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  brandName: varchar("brandName", { length: 255 }),
  accentColor: varchar("accentColor", { length: 7 }).default("#EC4899").notNull(),
  bgColor: varchar("bgColor", { length: 7 }).default("#1A1A2E").notNull(),
  textColor: varchar("textColor", { length: 7 }).default("#FFFFFF").notNull(),
  logoUrl: text("logoUrl"),
  logoKey: text("logoKey"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type BrandSettings = typeof brandSettings.$inferSelect;
export type InsertBrandSettings = typeof brandSettings.$inferInsert;
