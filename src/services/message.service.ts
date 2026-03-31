import { prisma } from "@/src/lib/db";
import { redis } from "@/src/lib/redis";
import { AppError, ForbiddenError } from "@/src/lib/errors";
import { hasVerifiedHkbuEmail } from "@/src/lib/user-emails";

const MESSAGE_REACTION_PREFIX = "[BUHUB_REACTION]";
const INITIAL_MESSAGE_LIMIT = 3;

export type MessagePermissionReason =
  | "SELF"
  | "BLOCKED"
  | "WAITING_FOR_REPLY"
  | "HKBU_BIND_REQUIRED";

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
  async checkCanSendMessage(
    senderId: string,
    receiverId: string
  ): Promise<{ canSendMessage: boolean; reason?: MessagePermissionReason }> {
    if (senderId === receiverId) {
      return { canSendMessage: false, reason: "SELF" };
    }

    const sender = await prisma.user.findUnique({
      where: { id: senderId },
      select: { role: true },
    });

    if (sender?.role === "USER" && !(await hasVerifiedHkbuEmail(senderId))) {
      return { canSendMessage: false, reason: "HKBU_BIND_REQUIRED" };
    }

    const blocked = await prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: senderId, blockedId: receiverId },
          { blockerId: receiverId, blockedId: senderId },
        ],
      },
    });
    if (blocked) {
      return { canSendMessage: false, reason: "BLOCKED" };
    }

    const receiverHasReplied = await prisma.directMessage.findFirst({
      where: {
        senderId: receiverId,
        receiverId: senderId,
      },
    });
    if (receiverHasReplied) {
      return { canSendMessage: true };
    }

    const messageCount = await prisma.directMessage.count({
      where: {
        senderId,
        receiverId,
      },
    });
    if (messageCount < INITIAL_MESSAGE_LIMIT) {
      return { canSendMessage: true };
    }

    return { canSendMessage: false, reason: "WAITING_FOR_REPLY" };
  }

  async canSendMessage(senderId: string, receiverId: string): Promise<boolean> {
    const result = await this.checkCanSendMessage(senderId, receiverId);
    return result.canSendMessage;
  }

  async sendMessage(params: {
    senderId: string;
    receiverId: string;
    content: string;
    images?: string[];
  }) {
    const { senderId, receiverId, content, images = [] } = params;

    const receiver = await prisma.user.findUnique({
      where: { id: receiverId },
    });
    if (!receiver || !receiver.isActive || receiver.isBanned) {
      throw new ForbiddenError("Cannot message this user");
    }

    const permission = await this.checkCanSendMessage(senderId, receiverId);
    if (!permission.canSendMessage) {
      if (permission.reason === "SELF") {
        throw new ForbiddenError("Cannot message yourself");
      }
      if (permission.reason === "HKBU_BIND_REQUIRED") {
        throw new AppError(
          "Please bind an HKBU email before sending messages",
          403,
          "HKBU_EMAIL_REQUIRED_FOR_MESSAGES"
        );
      }
      if (permission.reason === "BLOCKED") {
        throw new ForbiddenError("Cannot message this user");
      }
      throw new ForbiddenError(
        `You can only send ${INITIAL_MESSAGE_LIMIT} messages until they reply`
      );
    }

    // Atomic cold-start limit enforcement via Redis to prevent TOCTOU races.
    // Only checked when receiver hasn't replied yet (cold-start scenario).
    if (permission.reason === undefined) {
      // Check if receiver has replied — if not, enforce atomic counter
      const receiverHasReplied = await prisma.directMessage.findFirst({
        where: { senderId: receiverId, receiverId: senderId },
        select: { id: true },
      });
      if (!receiverHasReplied) {
        const counterKey = `msg:coldstart:${senderId}:${receiverId}`;
        const count = await redis.incr(counterKey);
        // Set TTL on first increment (24h, auto-cleanup)
        if (count === 1) {
          await redis.expire(counterKey, 86400);
        }
        if (count > INITIAL_MESSAGE_LIMIT) {
          throw new ForbiddenError(
            `You can only send ${INITIAL_MESSAGE_LIMIT} messages until they reply`
          );
        }
      }
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
    const skip = Math.max((page - 1) * limit, 0);

    // Step 1: DB-level pagination — get partner IDs ordered by latest message time
    const partnerRows = await prisma.$queryRaw<
      Array<{ partner_id: string; latest_at: Date }>
    >`
      SELECT
        CASE WHEN "senderId" = ${userId} THEN "receiverId" ELSE "senderId" END AS partner_id,
        MAX("createdAt") AS latest_at
      FROM "DirectMessage"
      WHERE "senderId" = ${userId} OR "receiverId" = ${userId}
      GROUP BY partner_id
      ORDER BY latest_at DESC
      LIMIT ${limit} OFFSET ${skip}
    `;

    if (partnerRows.length === 0) return [];

    const pagedPartnerIds = partnerRows.map((r) => r.partner_id);

    // Step 2+3 combined: latest message per partner + unread counts in parallel
    const [latestMessages, unreadRows, partners] = await Promise.all([
      // Latest non-reaction message per partner via window function
      prisma.$queryRaw<
        Array<{
          partner_id: string;
          content: string;
          images: string[];
          createdAt: Date;
          isRead: boolean;
          isDeleted: boolean;
          senderId: string;
        }>
      >`
        SELECT partner_id, content, images, "createdAt", "isRead", "isDeleted", "senderId"
        FROM (
          SELECT
            CASE WHEN "senderId" = ${userId} THEN "receiverId" ELSE "senderId" END AS partner_id,
            content, images, "createdAt", "isRead", "isDeleted", "senderId",
            ROW_NUMBER() OVER (
              PARTITION BY CASE WHEN "senderId" = ${userId} THEN "receiverId" ELSE "senderId" END
              ORDER BY "createdAt" DESC
            ) AS rn
          FROM "DirectMessage"
          WHERE ("senderId" = ${userId} OR "receiverId" = ${userId})
            AND "isDeleted" = false
            AND NOT (content LIKE '[BUHUB_REACTION]%')
        ) ranked
        WHERE rn = 1
          AND partner_id = ANY(${pagedPartnerIds})
      `,
      // Unread counts per partner
      prisma.directMessage.groupBy({
        by: ["senderId"],
        where: {
          senderId: { in: pagedPartnerIds },
          receiverId: userId,
          isRead: false,
          isDeleted: false,
        },
        _count: { _all: true },
      }),
      // Partner user info in one batch
      prisma.user.findMany({
        where: { id: { in: pagedPartnerIds } },
        select: { id: true, userName: true, nickname: true, avatar: true, gender: true, grade: true, major: true },
      }),
    ]);

    const messageMap = new Map(latestMessages.map((m) => [m.partner_id, m]));
    const unreadCountMap = new Map(unreadRows.map((row) => [row.senderId, row._count._all]));
    const partnerMap = new Map(partners.map((p) => [p.id, p]));

    return pagedPartnerIds
      .map((partnerId) => {
        const msg = messageMap.get(partnerId);
        const partner = partnerMap.get(partnerId);
        if (!msg || !partner) return null;
        return buildConversationPayload(
          partnerId,
          partner,
          {
            content: msg.content,
            images: msg.images,
            createdAt: msg.createdAt,
            isRead: msg.isRead,
            isDeleted: msg.isDeleted,
            senderId: msg.senderId,
          },
          unreadCountMap.get(partnerId) ?? 0
        );
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
  }

  async getConversationSummary(userId: string, partnerId: string) {
    const [partner, unreadCount, recentMessages] = await Promise.all([
      prisma.user.findUnique({
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
      }),
      prisma.directMessage.count({
        where: {
          senderId: partnerId,
          receiverId: userId,
          isRead: false,
          isDeleted: false,
        },
      }),
      prisma.directMessage.findMany({
        where: {
          OR: [
            { senderId: userId, receiverId: partnerId },
            { senderId: partnerId, receiverId: userId },
          ],
          isDeleted: false,
        },
        orderBy: { createdAt: "desc" },
        take: 15,
      }),
    ]);

    if (!partner) return null;

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
