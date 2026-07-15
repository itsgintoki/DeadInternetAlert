import { Router } from "express";
import { register, login, refresh, logout } from "../controllers/auth.controllers.js";
import { validate } from "../middlewares/validate.middlewares.js";
import { registerSchema, loginSchema, refreshSchema } from "../validations/auth.validations.js";
import { globalRateLimiter } from '../middlewares/rateLimit.middlewares.js';

const router = Router();

const authRateLimiter = globalRateLimiter(10, 15 * 60, { failClosed: true });

router.post("/register", authRateLimiter, validate(registerSchema), register);
router.post("/login", authRateLimiter, validate(loginSchema), login);
router.post('/refresh', authRateLimiter, validate(refreshSchema), refresh);
router.post('/logout', validate(refreshSchema), logout);

export default router;
