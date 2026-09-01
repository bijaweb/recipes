import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { SignInWithGoogleBody, SignInWithGoogleResponse, GetCurrentUserResponse } from "@workspace/api-zod";
import { signAppToken, verifyGoogleCredential } from "../lib/auth";
import { hasPlatformAccess } from "../lib/platform-access";
import { buildUserPayload } from "../lib/user-response";
import { requireAuth } from "../middlewares/require-auth";

const router: IRouter = Router();

router.post("/auth/google", async (req, res): Promise<void> => {
  const parsed = SignInWithGoogleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  let identity;
  try {
    identity = await verifyGoogleCredential(parsed.data.credential);
  } catch {
    res.status(401).json({ error: "Invalid Google credential" });
    return;
  }

  if (!(await hasPlatformAccess(identity.email))) {
    res.status(403).json({
      error: "You don't have access to this app yet. Ask an admin to grant access on the platform.",
    });
    return;
  }

  const [user] = await db
    .insert(usersTable)
    .values({
      email: identity.email,
      googleId: identity.googleId,
      name: identity.name,
      picture: identity.picture,
    })
    .onConflictDoUpdate({
      target: usersTable.email,
      set: {
        googleId: identity.googleId,
        name: identity.name,
        picture: identity.picture,
      },
    })
    .returning();

  const token = signAppToken({ id: user.id, email: user.email });

  res.json(
    SignInWithGoogleResponse.parse({
      token,
      user: await buildUserPayload(user),
    }),
  );
});

router.get("/auth/me", requireAuth, async (req, res): Promise<void> => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.id));

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.json(GetCurrentUserResponse.parse(await buildUserPayload(user)));
});

export default router;
