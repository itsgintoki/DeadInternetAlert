import { Router } from "express";
import { checkSubreddit, checkUrl, checkMeme } from "../controllers/check.controllers.js";
import { authenticate } from "../middlewares/auth.middlewares.js";

const router = Router();
router.use(authenticate); 

router.get("/subreddit", checkSubreddit);
router.get("/url", checkUrl);
router.get("/meme", checkMeme);

export default router;