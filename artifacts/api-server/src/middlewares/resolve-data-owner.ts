import type { NextFunction, Request, Response } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      dataOwnerId?: number;
    }
  }
}

// If this user has been linked to another user's meal plan (Manage Users on
// the platform -> per-user page -> "Recipes: view data as"), route planner
// calendar reads/writes to that user's plan instead of their own -- so a
// household can share one plan. Must run after requireAuth. Falls back to
// their own id when unset.
export async function resolveDataOwner(req: Request, res: Response, next: NextFunction): Promise<void> {
  const [row] = await db
    .select({ linkedUserId: usersTable.linkedUserId })
    .from(usersTable)
    .where(eq(usersTable.id, req.user!.id));
  req.dataOwnerId = row?.linkedUserId ?? req.user!.id;
  next();
}
