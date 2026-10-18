import { type Response } from "express";
import type { IUserRequest } from "../interface";
import { handleErrors } from "../lib/handle-errors";
import { getNotificationsQuerySchema, registerDeviceSchema } from "../schemas/notification";
import { NotificationService } from "../services/notification.service";

export class NotificationController {
  private notificationService = new NotificationService();

  async getNotifications(req: IUserRequest, res: Response) {
    try {
      const { userId } = req;
      const { isRead } = getNotificationsQuerySchema.parse(req.query);

      const notifications = await this.notificationService.getNotifications(userId!, {
        ...(isRead !== undefined && { isRead }),
      });

      res.status(200).json({ message: "Notifications fetched successfully!", data: notifications });
    } catch (error) {
      handleErrors({ res, error });
    }
  }

  async getUnreadCount(req: IUserRequest, res: Response) {
    try {
      const { userId } = req;
      const data = await this.notificationService.getUnreadCount(userId!);
      res.status(200).json({ message: "Unread count fetched successfully!", data });
    } catch (error) {
      handleErrors({ res, error });
    }
  }

  async markRead(req: IUserRequest, res: Response) {
    try {
      const { userId } = req;
      const { id } = req.params;

      const notification = await this.notificationService.markRead(id as string, userId!);
      res.status(200).json({ message: "Notification marked as read", data: notification });
    } catch (error) {
      handleErrors({ res, error });
    }
  }

  async markAllRead(req: IUserRequest, res: Response) {
    try {
      const { userId } = req;
      const data = await this.notificationService.markAllRead(userId!);
      res.status(200).json({ message: "All notifications marked as read", data });
    } catch (error) {
      handleErrors({ res, error });
    }
  }

  async deleteNotification(req: IUserRequest, res: Response) {
    try {
      const { userId } = req;
      const { id } = req.params;

      await this.notificationService.deleteNotification(id as string, userId!);
      res.status(204).json({ message: "Notification deleted successfully!" });
    } catch (error) {
      handleErrors({ res, error });
    }
  }

  async clearAll(req: IUserRequest, res: Response) {
    try {
      const { userId } = req;
      const data = await this.notificationService.clearAll(userId!);
      res.status(200).json({ message: "Notifications cleared", data });
    } catch (error) {
      handleErrors({ res, error });
    }
  }

  async registerDevice(req: IUserRequest, res: Response) {
    try {
      const { userId } = req;
      const { deviceToken, deviceType } = registerDeviceSchema.parse(req.body);

      const data = await this.notificationService.registerDevice(userId!, deviceToken, deviceType);
      res.status(200).json({ message: "Device registered successfully", data });
    } catch (error) {
      handleErrors({ res, error });
    }
  }
}
