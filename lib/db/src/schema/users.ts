import { pgTable, serial, text, integer, timestamp, type AnyPgColumn } from "drizzle-orm/pg-core";

// Named "recipes_users" (not "users") because this app shares its Postgres
// database with the platform app, which already owns a "users" table with
// an incompatible schema.
export const usersTable = pgTable("recipes_users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  googleId: text("google_id").notNull().unique(),
  name: text("name"),
  picture: text("picture"),
  // When set, this user's meal planner reads and writes the linked user's
  // plan instead of their own -- see Manage Users (platform) -> per-user
  // page -> "Recipes: view data as". The catalog and favorites aren't affected.
  linkedUserId: integer("linked_user_id").references((): AnyPgColumn => usersTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type InsertUser = typeof usersTable.$inferInsert;
export type UserRecord = typeof usersTable.$inferSelect;
