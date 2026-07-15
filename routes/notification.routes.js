import { Router } from "express";
import { getNotifications, markAsRead } from "../controllers/notification.controllers.js";
import { authenticate } from "../middlewares/auth.middlewares.js";

const router = Router();
router.use(authenticate);

router.get("/", getNotifications);
router.post("/:id/read", markAsRead);
router.patch("/:id/read", markAsRead);

export default router;
