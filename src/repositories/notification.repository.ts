import type { NotificationType, Prisma } from "../generated/prisma/client";
import { prisma } from "../lib/prisma";

export interface CreateNotificationData {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  entityType?: string;
  entityId?: string;
}

export class NotificationRepository {
  async findManyByUser(userId: string, options?: { isRead?: boolean; take?: number }) {
    const { isRead, take = 50 } = options || {};

    return prisma.notification.findMany({
      where: {
        userId,
        ...(isRead !== undefined && { isRead }),
      },
      orderBy: { createdAt: "desc" },
      take,
    });
  }

  async findById(id: string, userId: string) {
    return prisma.notification.findFirst({ where: { id, userId } });
  }

  async countUnread(userId: string) {
    return prisma.notification.count({ where: { userId, isRead: false } });
  }

  async create(data: CreateNotificationData) {
    return prisma.notification.create({ data });
  }

  async createMany(data: CreateNotificationData[]) {
    return prisma.notification.createMany({ data });
  }

  async markRead(id: string, userId: string) {
    return prisma.notification.update({
      where: { id, userId },
      data: { isRead: true, readAt: new Date() },
    });
  }

  async markAllRead(userId: string) {
    return prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
  }

  async delete(id: string, userId: string) {
    return prisma.notification.delete({ where: { id, userId } });
  }

  async deleteAll(userId: string) {
    return prisma.notification.deleteMany({ where: { userId } });
  }

  async findDeviceToken(userId: string) {
    return prisma.user.findUnique({
      where: { id: userId },
      select: { deviceToken: true, settings: { select: { notifications: true } } },
    });
  }

  async updateDevice(userId: string, data: { deviceToken: string; deviceType?: string }) {
    return prisma.user.update({
      where: { id: userId },
      data,
      select: { id: true, deviceToken: true, deviceType: true },
    });
  }
}

export type NotificationWhere = Prisma.NotificationWhereInput;
