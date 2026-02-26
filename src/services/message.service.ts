import { prisma } from "@/src/lib/db";
import { ForbiddenError } from "@/src/lib/errors";

export class MessageService {
  async canSendMessage(senderId: string, receiverId: string): Promise<boolean> {
    const blocked = await prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: senderId, blockedId: receiverId },
          { blockerId: receiverId, blockedId: senderId },
        ],
      },
    });
    if (blocked) return false;

    const receiverFollowsSender = await prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: receiverId,
          followingId: senderId,
        },
      },
    });
    if (receiverFollowsSender) return true;

    const receiverHasReplied = await prisma.directMessage.findFirst({
      where: {
        senderId: receiverId,
        receiverId: senderId,
        isDeleted: false,
      },
    });
    if (receiverHasReplied) return true;

    const messageCount = await prisma.directMessage.count({
      where: {
        senderId,
        receiverId,
        isDeleted: false,
      },
    });
    return messageCount === 0;
  }

  async sendMessage(params: {
    senderId: string;
    receiverId: string;
    content: string;
    images?: string[];
  }) {
    const { senderId, receiverId, content, images = [] } = params;

    if (senderId === receiverId) {
      throw new ForbiddenError("Cannot message yourself");
    }

    const receiver = await prisma.user.findUnique({
      where: { id: receiverId },
    });
    if (!receiver || !receiver.isActive || receiver.isBanned) {
      throw new ForbiddenError("Cannot message this user");
    }

    const canSend = await this.canSendMessage(senderId, receiverId);
    if (!canSend) {
      const blocked = await prisma.block.findFirst({
        where: {
          OR: [
            { blockerId: senderId, blockedId: receiverId },
            { blockerId: receiverId, blockedId: senderId },
          ],
        },
      });
      if (blocked) {
        throw new ForbiddenError("Cannot message this user");
      }
      throw new ForbiddenError(
        "You can only send one message until they reply or follow you"
      );
    }

    return prisma.directMessage.create({
      data: {
        senderId,
        receiverId,
        content,
        images,
      },
      include: {
        sender: { select: { id: true, nickname: true, avatar: true } },
        receiver: { select: { id: true, nickname: true, avatar: true } },
      },
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async getConversations(userId: string, page: number, limit: number) {
    const messages = await prisma.directMessage.findMany({
      where: {
        OR: [{ senderId: userId }, { receiverId: userId }],
        isDeleted: false,
      },
      include: {
        sender: { select: { id: true, nickname: true, avatar: true, gender: true, grade: true, major: true } },
        receiver: { select: { id: true, nickname: true, avatar: true, gender: true, grade: true, major: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const partnerMap = new Map<
      string,
      {
        user: {
          id: string;
          nickname: string;
          avatar: string;
          gender: string;
          grade: string | null;
          major: string | null;
        };
        latestMessage: {
          content: string;
          createdAt: Date;
          isRead: boolean;
          senderId: string;
        };
        unreadCount: number;
      }
    >();

    for (const m of messages) {
      const partner = m.senderId === userId ? m.receiver : m.sender;
      const existing = partnerMap.get(partner.id);
      if (!existing) {
        const unreadCount = await prisma.directMessage.count({
          where: {
            senderId: partner.id,
            receiverId: userId,
            isRead: false,
            isDeleted: false,
          },
        });
        partnerMap.set(partner.id, {
          user: {
            id: partner.id,
            nickname: partner.nickname,
            avatar: partner.avatar,
            gender: partner.gender,
            grade: partner.grade,
            major: partner.major,
          },
          latestMessage: {
            content: m.content,
            createdAt: m.createdAt,
            isRead: m.isRead,
            senderId: m.senderId,
          },
          unreadCount,
        });
      }
    }

    return Array.from(partnerMap.entries()).map(([userId, v]) => ({
      userId,
      user: v.user,
      latestMessage: v.latestMessage,
      unreadCount: v.unreadCount,
    }));
  }
}

export const messageService = new MessageService();
