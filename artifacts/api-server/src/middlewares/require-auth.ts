import type { NextFunction, Request, Response } from "express";
import { verifyAppToken, type AppTokenPayload } from "../lib/auth";
import { hasPlatformAccess } from "../lib/platform-access";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AppTokenPayload;
    }
  }
}

// Re-checks platform access on every request (not just at sign-in), so
// revoking someone's access on the platform locks them out immediately
// instead of only once their token happens to expire.
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;

  if (!token) {
    res.status(401).json({ error: "No token provided" });
    return;
  }

  let payload: AppTokenPayload;
  try {
    payload = verifyAppToken(token);
  } catch {
    res.status(401).json({ error: "Invalid token" });
    return;
  }

  if (!(await hasPlatformAccess(payload.email))) {
    res.status(403).json({ error: "Access revoked" });
    return;
  }

  req.user = payload;
  next();
}
