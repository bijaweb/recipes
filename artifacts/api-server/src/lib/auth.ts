import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is required but was not provided.");
}

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
if (!GOOGLE_CLIENT_ID) {
  throw new Error("GOOGLE_CLIENT_ID environment variable is required but was not provided.");
}

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

export interface AppTokenPayload {
  id: number;
  email: string;
}

export function signAppToken(payload: AppTokenPayload): string {
  return jwt.sign(payload, JWT_SECRET!, { expiresIn: "30d" });
}

export function verifyAppToken(token: string): AppTokenPayload {
  return jwt.verify(token, JWT_SECRET!) as AppTokenPayload;
}

export interface GoogleIdentity {
  googleId: string;
  email: string;
  name?: string;
  picture?: string;
}

export async function verifyGoogleCredential(credential: string): Promise<GoogleIdentity> {
  const ticket = await googleClient.verifyIdToken({
    idToken: credential,
    audience: GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();
  if (!payload?.sub || !payload.email) {
    throw new Error("Google credential did not include the expected profile fields");
  }

  return {
    googleId: payload.sub,
    email: payload.email,
    name: payload.name,
    picture: payload.picture,
  };
}
