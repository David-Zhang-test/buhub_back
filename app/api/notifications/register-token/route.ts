import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { handleError } from "@/src/lib/errors";
import { z } from "zod";

const registerTokenSchema = z.object({
  token: z.string().min(1),
  platform: z.enum(["ios", "android", "web"]),
  provider: z.enum(["expo", "fcm", "jpush"]),
});

const unregisterTokenSchema = z.object({
  token: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const { user } = await getCurrentUser(req);
    const body = await req.json();
    const data = registerTokenSchema.parse(body);

    await prisma.pushToken.upsert({
      where: { token: data.token },
      create: {
        userId: user.id,
        token: data.token,
        platform: data.platform,
        provider: data.provider,
      },
      update: {
        userId: user.id,
        platform: data.platform,
        provider: data.provider,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { user } = await getCurrentUser(req);
    const body = await req.json();
    const { token } = unregisterTokenSchema.parse(body);

    await prisma.pushToken.deleteMany({
      where: { userId: user.id, token },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleError(error);
  }
}
