import { prisma } from "@/src/lib/db";
import { redis } from "@/src/lib/redis";
import { AppError, ForbiddenError } from "@/src/lib/errors";
import { userHasHkbuGatedAccess } from "@/src/lib/email-domain";

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
  message: ConversationMessage | null,
  unreadCount: number,
  lastInteractedAt: Date
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
    latestMessage: message
      ? {
          content: message.content,
          images: message.images,
          createdAt: message.createdAt,
          isRead: message.isRead,
          isDeleted: message.isDeleted,
          senderId: message.senderId,
        }
      : null,
    lastInteractedAt,
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

    if (!(await userHasHkbuGatedAccess(senderId, sender?.role ?? null))) {
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

  async clearConversation(ownerId: string, partnerId: string) {
    const now = new Date();
    await prisma.directConversation.upsert({
      where: {
        ownerId_partnerId: {
          ownerId,
          partnerId,
        },
      },
      update: {
        clearedAt: now,
        deletedAt: now,
      },
      create: {
        ownerId,
        partnerId,
        lastInteractedAt: now,
        clearedAt: now,
        deletedAt: now,
      },
    });
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

    return prisma.$transaction(async (tx) => {
      const message = await tx.directMessage.create({
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

      await Promise.all([
        tx.directConversation.upsert({
          where: {
            ownerId_partnerId: {
              ownerId: senderId,
              partnerId: receiverId,
            },
          },
          update: { lastInteractedAt: message.createdAt, deletedAt: null },
          create: {
            ownerId: senderId,
            partnerId: receiverId,
            lastInteractedAt: message.createdAt,
            deletedAt: null,
          },
        }),
        tx.directConversation.upsert({
          where: {
            ownerId_partnerId: {
              ownerId: receiverId,
              partnerId: senderId,
            },
          },
          update: { lastInteractedAt: message.createdAt, deletedAt: null },
          create: {
            ownerId: receiverId,
            partnerId: senderId,
            lastInteractedAt: message.createdAt,
            deletedAt: null,
          },
        }),
      ]);

      return message;
    });
  }

  async getConversations(userId: string, page: number, limit: number) {
    const skip = Math.max((page - 1) * limit, 0);

    const conversationRows = await prisma.directConversation.findMany({
      where: { ownerId: userId, deletedAt: null },
      orderBy: [{ lastInteractedAt: "desc" }, { createdAt: "desc" }],
      skip,
      take: limit,
      select: {
        partnerId: true,
        lastInteractedAt: true,
        clearedAt: true,
      },
    });

    if (conversationRows.length === 0) return [];

    const pagedPartnerIds = conversationRows.map((row) => row.partnerId);
    const conversationMetaMap = new Map(
      conversationRows.map((row) => [
        row.partnerId,
        { lastInteractedAt: row.lastInteractedAt, clearedAt: row.clearedAt },
      ])
    );

    const [latestMessages, unreadRows, partners] = await Promise.all([
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
            CASE WHEN dm."senderId" = ${userId} THEN dm."receiverId" ELSE dm."senderId" END AS partner_id,
            dm.content, dm.images, dm."createdAt", dm."isRead", dm."isDeleted", dm."senderId",
            ROW_NUMBER() OVER (
              PARTITION BY CASE WHEN dm."senderId" = ${userId} THEN dm."receiverId" ELSE dm."senderId" END
              ORDER BY dm."createdAt" DESC
            ) AS rn
          FROM "DirectMessage" dm
          INNER JOIN "DirectConversation" dc
            ON dc."ownerId" = ${userId}
           AND dc."partnerId" = CASE WHEN dm."senderId" = ${userId} THEN dm."receiverId" ELSE dm."senderId" END
          WHERE (dm."senderId" = ${userId} OR dm."receiverId" = ${userId})
            AND dc."deletedAt" IS NULL
            AND (dc."clearedAt" IS NULL OR dm."createdAt" > dc."clearedAt")
            AND dm."isDeleted" = false
            AND NOT (dm.content LIKE '[BUHUB_REACTION]%')
        ) ranked
        WHERE rn = 1
          AND partner_id = ANY(${pagedPartnerIds})
      `,
      prisma.$queryRaw<
        Array<{ partner_id: string; unread_count: bigint | number }>
      >`
        SELECT
          dm."senderId" AS partner_id,
          COUNT(*) AS unread_count
        FROM "DirectMessage" dm
        INNER JOIN "DirectConversation" dc
          ON dc."ownerId" = ${userId}
         AND dc."partnerId" = dm."senderId"
        WHERE dm."senderId" = ANY(${pagedPartnerIds})
          AND dm."receiverId" = ${userId}
          AND dm."isRead" = false
          AND dm."isDeleted" = false
          AND dc."deletedAt" IS NULL
          AND (dc."clearedAt" IS NULL OR dm."createdAt" > dc."clearedAt")
        GROUP BY dm."senderId"
      `,
      // Partner user info in one batch
      prisma.user.findMany({
        where: { id: { in: pagedPartnerIds } },
        select: { id: true, userName: true, nickname: true, avatar: true, gender: true, grade: true, major: true },
      }),
    ]);

    const messageMap = new Map(latestMessages.map((m) => [m.partner_id, m]));
    const unreadCountMap = new Map(
      unreadRows.map((row) => [row.partner_id, Number(row.unread_count)])
    );
    const partnerMap = new Map(partners.map((p) => [p.id, p]));

    return pagedPartnerIds
      .map((partnerId) => {
        const msg = messageMap.get(partnerId);
        const partner = partnerMap.get(partnerId);
        const conversationMeta = conversationMetaMap.get(partnerId);
        if (!partner || !conversationMeta) return null;
        return buildConversationPayload(
          partnerId,
          partner,
          msg
            ? {
                content: msg.content,
                images: msg.images,
                createdAt: msg.createdAt,
                isRead: msg.isRead,
                isDeleted: msg.isDeleted,
                senderId: msg.senderId,
              }
            : null,
          unreadCountMap.get(partnerId) ?? 0,
          conversationMeta.lastInteractedAt
        );
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
  }

  async getConversationSummary(userId: string, partnerId: string) {
    const [partner, conversation] = await Promise.all([
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
      prisma.directConversation.findUnique({
        where: {
          ownerId_partnerId: {
            ownerId: userId,
            partnerId,
          },
        },
        select: {
          lastInteractedAt: true,
          clearedAt: true,
          deletedAt: true,
        },
      }),
    ]);

    if (!partner) return null;
    if (!conversation || conversation.deletedAt) return null;

    const conversationFilter = conversation.clearedAt
      ? { gt: conversation.clearedAt }
      : undefined;

    const [resolvedUnreadCount, resolvedRecentMessages] = await Promise.all([
      prisma.directMessage.count({
        where: {
          senderId: partnerId,
          receiverId: userId,
          isRead: false,
          isDeleted: false,
          ...(conversationFilter ? { createdAt: conversationFilter } : {}),
        },
      }),
      prisma.directMessage.findMany({
        where: {
          OR: [
            { senderId: userId, receiverId: partnerId },
            { senderId: partnerId, receiverId: userId },
          ],
          isDeleted: false,
          ...(conversationFilter ? { createdAt: conversationFilter } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: 15,
      }),
    ]);

    const latestMessage = resolvedRecentMessages.find((message) => !isEmptyReaction(message.content));
    const lastInteractedAt = latestMessage?.createdAt ?? conversation.lastInteractedAt;
    if (!lastInteractedAt) return null;

    return buildConversationPayload(
      partnerId,
      partner,
      latestMessage
        ? {
            content: latestMessage.content,
            images: latestMessage.images,
            createdAt: latestMessage.createdAt,
            isRead: latestMessage.isRead,
            isDeleted: latestMessage.isDeleted,
            senderId: latestMessage.senderId,
          }
        : null,
      resolvedUnreadCount,
      lastInteractedAt
    );
  }

  async searchConversations(userId: string, query: string, limit: number) {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      return [];
    }

    const visibleConversations = await prisma.directConversation.findMany({
      where: {
        ownerId: userId,
        deletedAt: null,
      },
      select: {
        partnerId: true,
        clearedAt: true,
      },
    });

    if (visibleConversations.length === 0) {
      return [];
    }

    const visibleConversationMap = new Map(
      visibleConversations.map((conversation) => [conversation.partnerId, conversation])
    );

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
      const conversationMeta = visibleConversationMap.get(partner.id);
      if (!conversationMeta) continue;
      if (conversationMeta.clearedAt && message.createdAt <= conversationMeta.clearedAt) continue;
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

    const unreadMessages = await prisma.directMessage.findMany({
      where: {
        senderId: { in: partnerIds },
        receiverId: userId,
        isRead: false,
        isDeleted: false,
      },
      select: {
        senderId: true,
        createdAt: true,
      },
    });
    const unreadCountMap = new Map<string, number>();
    unreadMessages.forEach((message) => {
      const conversationMeta = visibleConversationMap.get(message.senderId);
      if (!conversationMeta) return;
      if (conversationMeta.clearedAt && message.createdAt <= conversationMeta.clearedAt) return;
      unreadCountMap.set(message.senderId, (unreadCountMap.get(message.senderId) ?? 0) + 1);
    });

    return partnerIds
      .map((partnerId) => {
        const item = partnerMap.get(partnerId);
        if (!item) return null;
        return buildConversationPayload(
          partnerId,
          item.partner,
          item.message,
          unreadCountMap.get(partnerId) ?? 0,
          item.message.createdAt
        );
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
  }
}

export const messageService = new MessageService();
