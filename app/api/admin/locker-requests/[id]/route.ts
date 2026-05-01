import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/src/lib/auth";
import { prisma } from "@/src/lib/db";
import { handleError, NotFoundError } from "@/src/lib/errors";
import { updateLockerRequestStatusSchema } from "@/src/schemas/locker-request.schema";
import { sendPushOnce } from "@/src/services/expo-push.service";
import { getUserLanguage, pushT } from "@/src/lib/push-i18n";

const STATUS_PUSH_BODY_KEY: Record<string, string> = {
  DROP_OFF_PROCESSING: "locker.status.dropOffProcessing",
  DROP_OFF_COMPLETE: "locker.status.dropOffComplete",
  PICK_UP_PROCESSING: "locker.status.pickUpProcessing",
  PICK_UP_COMPLETE: "locker.status.pickUpComplete",
};

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(req, "ADMIN");
    const { id } = await params;

    const existing = await prisma.lockerRequest.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundError("Locker request not found");
    }

    await prisma.lockerRequest.delete({ where: { id } });
    return NextResponse.json({ success: true, data: { id } });
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(req, "ADMIN");
    const { id } = await params;
    const body = await req.json();
    const data = updateLockerRequestStatusSchema.parse(body);

    const existing = await prisma.lockerRequest.findUnique({
      where: { id },
      select: { id: true, userId: true, status: true },
    });
    if (!existing) {
      throw new NotFoundError("Locker request not found");
    }

    const updated = await prisma.lockerRequest.update({
      where: { id },
      data: { status: data.status },
    });

    // TICKET-012: notify the request owner when status changes. Fire-and-forget;
    // 24h dedupe per (request, status) so toggling back-and-forth doesn't spam.
    if (existing.status !== data.status) {
      const bodyKey = STATUS_PUSH_BODY_KEY[data.status];
      if (bodyKey) {
        void (async () => {
          const lang = await getUserLanguage(existing.userId);
          await sendPushOnce({
            dedupeKey: `push:locker:status:${id}:${data.status}`,
            ttlSeconds: 24 * 60 * 60,
            userId: existing.userId,
            title: pushT(lang, "locker.status.title"),
            body: pushT(lang, bodyKey),
            category: "system",
            data: {
              type: "locker_status",
              status: data.status,
              path: "lockerSFSC",
            },
          });
        })();
      }
    }

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    return handleError(error);
  }
}
