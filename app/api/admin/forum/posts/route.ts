import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { handleError } from "@/src/lib/errors";
import { parseFunctionRef } from "@/src/lib/function-ref";

export async function GET(req: NextRequest) {
  try {
    await requireRole(req, "ADMIN");

    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);
    const skip = (page - 1) * limit;
    const includeDeleted = searchParams.get("includeDeleted") === "true";
    const postType = searchParams.get("postType") || undefined;
    const category = searchParams.get("category") || undefined;

    const where: {
      isDeleted?: boolean;
      postType?: string;
      category?: string;
    } = {};
    if (!includeDeleted) where.isDeleted = false;
    if (postType) where.postType = postType;
    if (category) where.category = category;

    const [posts, total] = await Promise.all([
      prisma.post.findMany({
        where,
        include: {
          author: {
            select: {
              id: true,
              nickname: true,
              userName: true,
              avatar: true,
              role: true,
            },
          },
          pollOptions: {
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            select: { id: true, text: true, voteCount: true },
          },
          originalPost: {
            select: {
              id: true,
              content: true,
              isAnonymous: true,
              isDeleted: true,
              author: {
                select: { id: true, nickname: true, userName: true },
              },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.post.count({ where }),
    ]);

    const enriched = posts.map((p) => {
      const ref = parseFunctionRef(p.content || "").ref;
      return {
        id: p.id,
        postType: p.postType,
        content: p.content,
        images: p.images,
        tags: p.tags,
        category: p.category,
        isAnonymous: p.isAnonymous,
        anonymousName: p.anonymousName,
        anonymousAvatar: p.anonymousAvatar,
        isRepost: p.isRepost,
        isDeleted: p.isDeleted,
        likeCount: p.likeCount,
        commentCount: p.commentCount,
        viewCount: p.viewCount,
        createdAt: p.createdAt,
        partnerType: p.partnerType,
        eventEndDate: p.eventEndDate,
        price: p.price,
        errandType: p.errandType,
        startAddress: p.startAddress,
        endAddress: p.endAddress,
        taskEndTime: p.taskEndTime,
        itemPrice: p.itemPrice,
        itemLocation: p.itemLocation,
        saleEndTime: p.saleEndTime,
        itemStatus: p.itemStatus,
        pollEndDate: p.pollEndDate,
        pollOptions: p.pollOptions,
        author: p.author,
        originalPost: p.originalPost,
        functionRef: ref ? { type: ref.type, id: ref.id } : null,
      };
    });

    return NextResponse.json({ success: true, data: enriched, total });
  } catch (error) {
    return handleError(error);
  }
}
