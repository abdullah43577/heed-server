import type { NotificationType } from "../generated/prisma/client";
import { NotFoundError } from "../lib/errors";
import { NotificationRepository } from "../repositories/notification.repository";
import { PushService } from "./push.service";

export interface NotifyInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  entityType?: string;
  entityId?: string;
}

export class NotificationService {
  private notificationRepo = new NotificationRepository();
  private pushService = new PushService();

  async getNotifications(userId: string, options?: { isRead?: boolean }) {
    try {
      return await this.notificationRepo.findManyByUser(userId, options || {});
    } catch (error) {
      throw error;
    }
  }

  async getUnreadCount(userId: string) {
    try {
      const count = await this.notificationRepo.countUnread(userId);
      return { count };
    } catch (error) {
      throw error;
    }
  }

  async markRead(id: string, userId: string) {
    try {
      const existing = await this.notificationRepo.findById(id, userId);
      if (!existing) throw new NotFoundError("Notification not found");

      return await this.notificationRepo.markRead(id, userId);
    } catch (error) {
      throw error;
    }
  }

  async markAllRead(userId: string) {
    try {
      const { count } = await this.notificationRepo.markAllRead(userId);
      return { updated: count };
    } catch (error) {
      throw error;
    }
  }

  async deleteNotification(id: string, userId: string) {
    try {
      const existing = await this.notificationRepo.findById(id, userId);
      if (!existing) throw new NotFoundError("Notification not found");

      return await this.notificationRepo.delete(id, userId);
    } catch (error) {
      throw error;
    }
  }

  async clearAll(userId: string) {
    try {
      const { count } = await this.notificationRepo.deleteAll(userId);
      return { deleted: count };
    } catch (error) {
      throw error;
    }
  }

  async registerDevice(userId: string, deviceToken: string, deviceType?: string) {
    try {
      return await this.notificationRepo.updateDevice(userId, {
        deviceToken,
        ...(deviceType && { deviceType }),
      });
    } catch (error) {
      throw error;
    }
  }

  // Swallows its own errors: notifying is a side effect, and the action that triggered it must not
  // fail because a device token went stale or Expo was unreachable.
  async notify(input: NotifyInput) {
    try {
      const notification = await this.notificationRepo.create({
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        ...(input.entityType && { entityType: input.entityType }),
        ...(input.entityId && { entityId: input.entityId }),
      });

      const user = await this.notificationRepo.findDeviceToken(input.userId);

      const pushEnabled = user?.settings?.notifications ?? true;

      if (pushEnabled && user?.deviceToken) {
        await this.pushService.send([
          {
            to: user.deviceToken,
            title: input.title,
            body: input.body,
            data: {
              notificationId: notification.id,
              type: input.type,
              ...(input.entityType && { entityType: input.entityType }),
              ...(input.entityId && { entityId: input.entityId }),
            },
          },
        ]);
      }

      return notification;
    } catch (error) {
      console.error("Failed to deliver notification:", error);
      return null;
    }
  }
}
