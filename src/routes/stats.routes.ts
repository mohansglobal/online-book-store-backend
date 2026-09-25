import { Router } from "express";
import { getHeroStats } from "../controllers/stats.controller.js";

const router = Router();

router.get("/hero", getHeroStats);

export default router;

