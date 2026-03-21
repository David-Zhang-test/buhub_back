import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/db";
import { handleError } from "@/src/lib/errors";
import { parseFunctionRef, resolveFunctionRefPreviews } from "@/src/lib/function-ref";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const timeframe = searchParams.get("timeframe") || "7d";
    const page = parseInt(searchParams.get("page") || "1");
    const limit = Math.min(parseInt(searchParams.get("limit") || "20"), 50);
    const skip = (page - 1) * limit;

    const hoursAgo = timeframe === "24h" ? 24 : timeframe === "7d" ? 168 : 720;
    const threshold = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);

    const posts = await prisma.post.findMany({
      where: {
        isDeleted: false,
        createdAt: { gte: threshold },
      },
      include: {
        author: {
          select: {
            id: true,
            nickname: true,
            avatar: true,
            gender: true,
            grade: true,
            major: true,
            userName: true,
          },
        },
        pollOptions: true,
      },
      skip,
      take: limit,
      orderBy: [
        { likeCount: "desc" },
        { commentCount: "desc" },
        { viewCount: "desc" },
        { createdAt: "desc" },
      ],
    });

    const parsedRefsByPostId = new Map(
      posts.map((post) => [post.id, parseFunctionRef(post.content).ref]),
    );
    const previewsByEntity = await resolveFunctionRefPreviews(
      Array.from(parsedRefsByPostId.values()).filter((ref): ref is NonNullable<typeof ref> => Boolean(ref)),
    );

    return NextResponse.json({
      success: true,
      data: posts.map((post) => {
        const ref = parsedRefsByPostId.get(post.id);
        return {
          ...post,
          functionRefPreview: ref ? previewsByEntity.get(`${ref.type}:${ref.id}`) : undefined,
        };
      }),
    });
  } catch (error) {
    return handleError(error);
  }
}
