import { Router } from "express";
import { checkSubreddit, checkUrl, checkMeme,triggerCheck } from "../controllers/check.controllers.js";
import { authenticate, authorize } from '../middlewares/auth.middlewares.js';


const router = Router();
router.use(authenticate); 

router.get("/subreddit", checkSubreddit);
router.get("/url", checkUrl);
router.get("/meme", checkMeme);
router.post('/trigger', authenticate, authorize('admin'), triggerCheck);


export default router;