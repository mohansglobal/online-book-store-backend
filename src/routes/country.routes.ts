import { Router } from "express";
import { getCountries } from "../controllers/country.controller.js";

const router = Router();

router.get("/", getCountries);

export default router;
