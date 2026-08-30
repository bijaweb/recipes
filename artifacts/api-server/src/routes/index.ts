import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import recipesRouter from "./recipes";
import favoritesRouter from "./favorites";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(recipesRouter);
router.use(favoritesRouter);

export default router;
