import { Router } from "express";
import { checkRepo, checkUrl, triggerCheck, getCheckStatus } from "../controllers/check.controllers.js";
import { authenticate, authorize } from '../middlewares/auth.middlewares.js';

const router = Router();
router.use(authenticate); 

router.get("/repo", checkRepo);
router.get("/url", checkUrl);
router.post('/trigger', authorize('admin'), triggerCheck);
router.get('/:id', getCheckStatus);

export default router;