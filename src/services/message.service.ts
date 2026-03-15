import { prisma } from "@/src/lib/db";
import { ForbiddenError } from "@/src/lib/errors";

const MESSAGE_REACTION_PREFIX = "[BUHUB_REACTION]";
const INITIAL_MESSAGE_LIMIT = 3;

// Helper function to check if message is an empty reaction (cancelled reaction)
function isEmptyReaction(content: string): boolean {
  if (!content.startsWith(MESSAGE_REACTION_PREFIX)) return false;
  try {
    const payload = JSON.parse(content.slice(MESSAGE_REACTION_PREFIX.length));
    return payload?.emoji === "" || !payload?.emoji;
  } catch {
    return false;
  }
}

type ConversationPartner = {
  id: string;
  userName: string | null;
  nickname: string;
  avatar: string;
  gender: string;
  grade: string | null;
  major: string | null;
};

type ConversationMessage = {
  content: string;
  images: string[];
  createdAt: Date;
  isRead: boolean;
  isDeleted: boolean;
  senderId: string;
};

function buildConversationPayload(
  partnerId: string,
  partner: ConversationPartner,
  message: ConversationMessage,
  unreadCount: number
) {
  return {
    userId: partnerId,
    user: {
      id: partner.id,
      userName: partner.userName,
      nickname: partner.nickname,
      avatar: partner.avatar,
      gender: partner.gender,
      grade: partner.grade,
      major: partner.major,
    },
    latestMessage: {
      content: message.content,
      images: message.images,
      createdAt: message.createdAt,
      isRead: message.isRead,
      isDeleted: message.isDeleted,
      senderId: message.senderId,
    },
    unreadCount,
  };
}

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

    const receiverHasReplied = await prisma.directMessage.findFirst({
      where: {
        senderId: receiverId,
        receiverId: senderId,
      },
    });
    if (receiverHasReplied) return true;

    const messageCount = await prisma.directMessage.count({
      where: {
        senderId,
        receiverId,
      },
    });
    return messageCount < INITIAL_MESSAGE_LIMIT;
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
        `You can only send ${INITIAL_MESSAGE_LIMIT} messages until they reply`
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

  async getConversations(userId: string, page: number, limit: number) {
    const messages = await prisma.directMessage.findMany({
      where: {
        OR: [{ senderId: userId }, { receiverId: userId }],
      },
      include: {
        sender: {
          select: {
            id: true,
            userName: true,
            nickname: true,
            avatar: true,
            gender: true,
            grade: true,
            major: true,
          },
        },
        receiver: {
          select: {
            id: true,
            userName: true,
            nickname: true,
            avatar: true,
            gender: true,
            grade: true,
            major: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const partnerMap = new Map<
      string,
      {
        user: {
          id: string;
          userName: string | null;
          nickname: string;
          avatar: string;
          gender: string;
          grade: string | null;
          major: string | null;
        };
        latestMessage: {
          content: string;
          images: string[];
          createdAt: Date;
          isRead: boolean;
          isDeleted: boolean;
          senderId: string;
        };
        unreadCount: number;
      }
    >();

    const skip = Math.max((page - 1) * limit, 0);
    const orderedPartnerIds: string[] = [];
    const seenPartners = new Set<string>();

    for (const m of messages) {
      const partner = m.senderId === userId ? m.receiver : m.sender;
      if (!seenPartners.has(partner.id)) {
        seenPartners.add(partner.id);
        orderedPartnerIds.push(partner.id);
      }
    }

    const pagedPartnerIds = orderedPartnerIds.slice(skip, skip + limit);
    if (pagedPartnerIds.length === 0) {
      return [];
    }
    const pagedPartnerSet = new Set(pagedPartnerIds);

    const unreadRows = await prisma.directMessage.groupBy({
      by: ["senderId"],
      where: {
        senderId: { in: pagedPartnerIds },
        receiverId: userId,
        isRead: false,
        isDeleted: false,
      },
      _count: { _all: true },
    });
    const unreadCountMap = new Map(unreadRows.map((row) => [row.senderId, row._count._all]));

    // Group messages by partner and find the first non-empty-reaction message
    const partnerMessages = new Map<string, typeof messages>();
    for (const m of messages) {
      const partner = m.senderId === userId ? m.receiver : m.sender;
      if (!pagedPartnerSet.has(partner.id)) continue;
      const existing = partnerMessages.get(partner.id);
      if (!existing) {
        partnerMessages.set(partner.id, [m]);
      } else {
        existing.push(m);
      }
    }

    // For each partner, find the first message that is not an empty reaction
    for (const [partnerId, msgs] of partnerMessages) {
      let latestMsg = null;
      for (const m of msgs) {
        if (!isEmptyReaction(m.content)) {
          latestMsg = m;
          break;
        }
      }
      if (!latestMsg) continue; // Skip if all messages are empty reactions

      const partner = latestMsg.senderId === userId ? latestMsg.receiver : latestMsg.sender;
      partnerMap.set(partnerId, {
        user: {
          id: partner.id,
          userName: partner.userName,
          nickname: partner.nickname,
          avatar: partner.avatar,
          gender: partner.gender,
          grade: partner.grade,
          major: partner.major,
        },
        latestMessage: {
          content: latestMsg.content,
          images: latestMsg.images,
          createdAt: latestMsg.createdAt,
          isRead: latestMsg.isRead,
          isDeleted: latestMsg.isDeleted,
          senderId: latestMsg.senderId,
        },
        unreadCount: unreadCountMap.get(partnerId) ?? 0,
      });
    }

    return pagedPartnerIds
      .map((partnerId) => {
        const v = partnerMap.get(partnerId);
        if (!v) return null;
        return {
          userId: partnerId,
          user: v.user,
          latestMessage: v.latestMessage,
          unreadCount: v.unreadCount,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .map(({ userId, user, latestMessage, unreadCount }) => ({
      userId,
      user,
      latestMessage,
      unreadCount,
    }));
  }

  async getConversationSummary(userId: string, partnerId: string) {
    const partner = await prisma.user.findUnique({
      where: { id: partnerId },
      select: {
        id: true,
        userName: true,
        nickname: true,
        avatar: true,
        gender: true,
        grade: true,
        major: true,
      },
    });

    if (!partner) return null;

    const unreadCount = await prisma.directMessage.count({
      where: {
        senderId: partnerId,
        receiverId: userId,
        isRead: false,
        isDeleted: false,
      },
    });

    const recentMessages = await prisma.directMessage.findMany({
      where: {
        OR: [
          { senderId: userId, receiverId: partnerId },
          { senderId: partnerId, receiverId: userId },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    const latestMessage = recentMessages.find((message) => !isEmptyReaction(message.content));
    if (!latestMessage) return null;

    return buildConversationPayload(
      partnerId,
      partner,
      {
        content: latestMessage.content,
        images: latestMessage.images,
        createdAt: latestMessage.createdAt,
        isRead: latestMessage.isRead,
        isDeleted: latestMessage.isDeleted,
        senderId: latestMessage.senderId,
      },
      unreadCount
    );
  }

  async searchConversations(userId: string, query: string, limit: number) {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      return [];
    }

    const matchedMessages = await prisma.directMessage.findMany({
      where: {
        isDeleted: false,
        content: { contains: trimmedQuery, mode: "insensitive" },
        OR: [{ senderId: userId }, { receiverId: userId }],
      },
      include: {
        sender: {
          select: {
            id: true,
            userName: true,
            nickname: true,
            avatar: true,
            gender: true,
            grade: true,
            major: true,
          },
        },
        receiver: {
          select: {
            id: true,
            userName: true,
            nickname: true,
            avatar: true,
            gender: true,
            grade: true,
            major: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: Math.max(limit * 10, 50),
    });

    const partnerMap = new Map<
      string,
      {
        partner: ConversationPartner;
        message: ConversationMessage;
      }
    >();

    for (const message of matchedMessages) {
      if (isEmptyReaction(message.content)) continue;
      const partner = message.senderId === userId ? message.receiver : message.sender;
      if (partnerMap.has(partner.id)) continue;

      partnerMap.set(partner.id, {
        partner,
        message: {
          content: message.content,
          images: message.images,
          createdAt: message.createdAt,
          isRead: message.isRead,
          isDeleted: message.isDeleted,
          senderId: message.senderId,
        },
      });

      if (partnerMap.size >= limit) {
        break;
      }
    }

    const partnerIds = Array.from(partnerMap.keys());
    if (partnerIds.length === 0) {
      return [];
    }

    const unreadRows = await prisma.directMessage.groupBy({
      by: ["senderId"],
      where: {
        senderId: { in: partnerIds },
        receiverId: userId,
        isRead: false,
        isDeleted: false,
      },
      _count: { _all: true },
    });
    const unreadCountMap = new Map(unreadRows.map((row) => [row.senderId, row._count._all]));

    return partnerIds
      .map((partnerId) => {
        const item = partnerMap.get(partnerId);
        if (!item) return null;
        return buildConversationPayload(
          partnerId,
          item.partner,
          item.message,
          unreadCountMap.get(partnerId) ?? 0
        );
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
  }
}

export const messageService = new MessageService();
