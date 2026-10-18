import { Router } from "express";
import { NotificationController } from "../controllers/notification.controller";
import { validateAccessToken } from "../lib/validate-token";

const router = Router();
const notificationController = new NotificationController();

router.use(validateAccessToken);

// Static segments must be declared before "/:id"
router.get("/unread-count", notificationController.getUnreadCount.bind(notificationController));
router.post("/read-all", notificationController.markAllRead.bind(notificationController));
router.post("/device", notificationController.registerDevice.bind(notificationController));

router.get("/", notificationController.getNotifications.bind(notificationController));
router.delete("/", notificationController.clearAll.bind(notificationController));
router.post("/:id/read", notificationController.markRead.bind(notificationController));
router.delete("/:id", notificationController.deleteNotification.bind(notificationController));

export { router as notificationRouter };
