import { Router } from "express";
import { checkRepo, checkUrl, triggerCheck, getCheckStatus, getFailedChecks, retryCheck, triggerEulogyDigest, triggerPollScheduler } from "../controllers/check.controllers.js";
import { authenticate, authorize } from '../middlewares/auth.middlewares.js';

const router = Router();
router.use(authenticate); 

router.get("/repo", checkRepo);
router.get("/url", checkUrl);
router.post('/trigger', authorize('admin'), triggerCheck);
router.post('/eulogy-trigger', authorize('admin'), triggerEulogyDigest);
router.post('/poll-trigger', authorize('admin'), triggerPollScheduler);
router.get('/failed', getFailedChecks);
router.get('/:id', getCheckStatus);
router.post('/:id/retry', retryCheck);

export default router;