import type { $Enums, Prisma } from "../generated/prisma/client";
import { prisma } from "../lib/prisma";

export class UserRepository {
  async findByEmail(email: string) {
    return prisma.user.findUnique({
      where: { email },
    });
  }

  async findById(id: string, select?: Prisma.UserSelect) {
    return prisma.user.findUnique({
      where: { id },
      ...(select && { select }),
    });
  }

  async createUser(data: Prisma.UserCreateInput) {
    return prisma.user.create({ data });
  }

  async updateUser(id: string, data: Prisma.UserUpdateInput) {
    return prisma.user.update({
      where: { id },
      data,
    });
  }

  async upsertUserSettings(
    userId: string,
    data: Partial<{ theme: $Enums.Theme; notifications: boolean; reportTime: string; timezone: string }>,
  ) {
    return prisma.userSettings.upsert({
      where: { userId },
      update: data,
      create: { userId, ...data },
    });
  }

  async incrementFailedLogin(id: string, attempts: number) {
    return prisma.user.update({
      where: { id },
      data: {
        failedLoginAttempts: {
          increment: 1,
        },
        ...(attempts >= 5 && { isLocked: true }),
      },
    });
  }

  async resetLoginAttempts(id: string) {
    return prisma.user.update({
      where: { id },
      data: {
        failedLoginAttempts: 0,
      },
    });
  }

  async findUniqueUser(where: Prisma.UserWhereUniqueInput, select?: Prisma.UserSelect) {
    return prisma.user.findUnique({ where, ...(select && { select }) });
  }

  async deleteUser(id: string) {
    return prisma.user.delete({ where: { id } });
  }
}
