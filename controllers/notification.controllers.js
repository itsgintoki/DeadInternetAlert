import { db } from "../db/index.js";
import { notificationsTable } from "../models/notifications.models.js";
import { eq, and, desc } from "drizzle-orm";

export const getNotifications = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const list = await db
      .select()
      .from(notificationsTable)
      .where(eq(notificationsTable.userId, userId))
      .orderBy(desc(notificationsTable.createdAt));

    res.status(200).json(list);
  } catch (err) {
    next(err);
  }
};

export const markAsRead = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const [updated] = await db
      .update(notificationsTable)
      .set({ read: true })
      .where(and(eq(notificationsTable.id, id), eq(notificationsTable.userId, userId)))
      .returning();

    if (!updated) {
      return res.status(404).json({ message: "Notification not found or unauthorized" });
    }

    res.status(200).json(updated);
  } catch (err) {
    next(err);
  }
};
