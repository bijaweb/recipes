import { Router, type IRouter } from "express";
import { GetNightModeSettingsResponse } from "@workspace/api-zod";
import { getAutoNightModeEnabled } from "../lib/platform-access";

const router: IRouter = Router();

// Public (no auth): the login screen should also respect night mode, and
// this is a non-sensitive display preference shared by the whole household.
router.get("/settings/night-mode", async (_req, res) => {
  const autoNightModeEnabled = await getAutoNightModeEnabled();
  res.json(GetNightModeSettingsResponse.parse({ autoNightModeEnabled }));
});

export default router;
