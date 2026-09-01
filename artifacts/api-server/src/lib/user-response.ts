import type { UserRecord } from "@workspace/db";
import { getPlatformAppMenu, getPlatformPreferredName } from "./platform-access";

// Builds the User payload shared by /auth/google and /auth/me -- resolves
// the platform "Call me by" override, admin flag, and the list of apps this
// email has been granted (for the "switch apps" burger menu).
export async function buildUserPayload(user: UserRecord) {
  const preferredName = await getPlatformPreferredName(user.email);
  const { isAdmin, apps } = await getPlatformAppMenu(user.email);

  return {
    id: String(user.id),
    email: user.email,
    name: preferredName ?? user.name ?? undefined,
    picture: user.picture ?? undefined,
    isAdmin,
    apps,
  };
}
