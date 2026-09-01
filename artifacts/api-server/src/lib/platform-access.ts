import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

const PLATFORM_APP_URL = process.env.PLATFORM_APP_URL;
if (!PLATFORM_APP_URL) {
  throw new Error("PLATFORM_APP_URL environment variable is required but was not provided.");
}

// This app shares its Postgres database with the platform app (see infra
// notes: one shared instance to save cost). This reads the platform's own
// users / apps / user_app_access tables directly instead of making a
// network call back to it. Deliberately NOT declared in this app's own
// Drizzle schema (schema/index.ts) so `drizzle-kit push` here never touches
// them -- see the "recipes_users" naming, chosen for the same reason.
export async function hasPlatformAccess(email: string): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT 1
    FROM users u
    JOIN user_app_access uaa ON uaa.user_id = u.id
    JOIN apps a ON a.id = uaa.app_id
    WHERE u.email = ${email} AND a.url = ${PLATFORM_APP_URL}
    LIMIT 1
  `);
  return result.rows.length > 0;
}

// Reads the platform's own admin flag for this email, used to gate
// recipe editing to the platform admin(s) rather than every signed-in user.
export async function isPlatformAdmin(email: string): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT is_admin
    FROM users
    WHERE email = ${email}
    LIMIT 1
  `);
  return (result.rows[0] as { is_admin?: boolean } | undefined)?.is_admin === true;
}

export interface AppMenuItem {
  name: string;
  url: string;
}

// Reads the platform's admin flag and the list of apps this email has been
// granted access to, for the "switch apps" burger menu shown in the header.
// BijaCorp itself isn't a row in the apps table (everyone with a platform
// account can already reach it), so the frontend adds that entry itself,
// gated on isAdmin.
export async function getPlatformAppMenu(email: string): Promise<{ isAdmin: boolean; apps: AppMenuItem[] }> {
  const userResult = await db.execute(sql`
    SELECT is_admin FROM users WHERE email = ${email} LIMIT 1
  `);
  const isAdmin = Boolean((userResult.rows[0] as { is_admin?: boolean } | undefined)?.is_admin);

  const appsResult = await db.execute(sql`
    SELECT a.name, a.url
    FROM apps a
    JOIN user_app_access uaa ON uaa.app_id = a.id
    JOIN users u ON u.id = uaa.user_id
    WHERE u.email = ${email}
    ORDER BY a.name ASC
  `);

  return {
    isAdmin,
    apps: appsResult.rows.map((r) => r as unknown as AppMenuItem),
  };
}

// Reads the platform's own preferred display name for this email, if the
// user has set one in Account Settings ("Call me by"). Returns null when
// unset so callers can fall back to this app's own Google-derived name.
export async function getPlatformPreferredName(email: string): Promise<string | null> {
  const result = await db.execute(sql`
    SELECT preferred_name
    FROM users
    WHERE email = ${email}
    LIMIT 1
  `);
  const preferredName = (result.rows[0] as { preferred_name?: string | null } | undefined)?.preferred_name;
  return typeof preferredName === "string" && preferredName.trim() ? preferredName : null;
}
