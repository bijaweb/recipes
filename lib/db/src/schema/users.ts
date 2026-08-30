import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

// Named "recipes_users" (not "users") because this app shares its Postgres
// database with the platform app, which already owns a "users" table with
// an incompatible schema.
export const usersTable = pgTable("recipes_users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  googleId: text("google_id").notNull().unique(),
  name: text("name"),
  picture: text("picture"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type InsertUser = typeof usersTable.$inferInsert;
export type UserRecord = typeof usersTable.$inferSelect;
