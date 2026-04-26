import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { handleError, ForbiddenError } from "@/src/lib/errors";
import { getLockerTimeline } from "@/src/lib/locker-config";
import { createLockerRequestSchema } from "@/src/schemas/locker-request.schema";

const LIFE_EMAIL_SUFFIX = "@life.hkbu.edu.hk";

async function requireLifeEmail(userId: string) {
  // src/lib/db.ts wraps prisma.userEmail with a custom raw-SQL delegate that
  // only exposes create/update/delete/deleteMany — no findFirst. Query via the
  // User relation instead so we go through the standard Prisma client.
  const match = await prisma.user.findFirst({
    where: {
      id: userId,
      emails: {
        some: {
          email: { endsWith: LIFE_EMAIL_SUFFIX },
          verifiedAt: { not: null },
        },
      },
    },
    select: { id: true },
  });
  if (!match) {
    throw new ForbiddenError("A verified @life.hkbu.edu.hk email is required for this feature.");
  }
}

const MAX_MODIFICATIONS = 1;

export async function POST(req: NextRequest) {
  try {
    const { user } = await getCurrentUser(req);
    await requireLifeEmail(user.id);
    const timeline = await getLockerTimeline();
    if (!timeline.featureEnabled) {
      throw new ForbiddenError("Locker feature is currently closed.");
    }
    if (Date.now() < timeline.openAtMs) {
      throw new ForbiddenError("Locker registration has not opened yet.");
    }
    if (Date.now() > timeline.closeAtMs) {
      throw new ForbiddenError("Information collection period has ended.");
    }
    const body = await req.json();
    const data = createLockerRequestSchema.parse(body);

    const fields = {
      fullName: data.fullName,
      studentId: data.studentId,
      phoneNumber: data.phoneNumber,
      residenceAddress: data.residenceAddress,
      dropOffDate: new Date(`${data.dropOffDate}T00:00:00Z`),
      boxCount: data.boxCount,
    };

    const existing = await prisma.lockerRequest.findUnique({
      where: { userId: user.id },
    });

    if (!existing) {
      // First submission.
      const created = await prisma.lockerRequest.create({
        data: { userId: user.id, ...fields, modifyCount: 0 },
      });
      return NextResponse.json({ success: true, data: created }, { status: 201 });
    }

    if (existing.modifyCount >= MAX_MODIFICATIONS) {
      throw new ForbiddenError("No modifications remaining for this submission.");
    }

    const updated = await prisma.lockerRequest.update({
      where: { id: existing.id },
      data: { ...fields, modifyCount: existing.modifyCount + 1 },
    });
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return handleError(error);
  }
}

export async function GET(req: NextRequest) {
  try {
    const { user } = await getCurrentUser(req);
    await requireLifeEmail(user.id);
    const record = await prisma.lockerRequest.findUnique({
      where: { userId: user.id },
    });
    return NextResponse.json({ success: true, data: record });
  } catch (error) {
    return handleError(error);
  }
}
