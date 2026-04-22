import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/db";
import { getCurrentUser } from "@/src/lib/auth";
import { handleError, AppError, NotFoundError, ForbiddenError } from "@/src/lib/errors";
import {
  getLinkedEmailsForUser,
  getPrimaryEmailForUser,
  getVerifiedHkbuEmailForUser,
  normalizeEmail,
  serializeLinkedEmail,
} from "@/src/lib/user-emails";
import { redis } from "@/src/lib/redis";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ emailId: string }> }
) {
  try {
    const { user, session, jti } = await getCurrentUser(req);
    const { emailId } = await params;
    const [linkedEmails, previousPrimary] = await Promise.all([
      getLinkedEmailsForUser(user.id),
      getPrimaryEmailForUser(user.id),
    ]);

    if (linkedEmails.length !== 2) {
      throw new AppError("You can only unlink an email when two emails are linked", 400, "UNLINK_NOT_AVAILABLE");
    }

    const targetEmail = linkedEmails.find((item) => item.id === emailId);
    if (!targetEmail) {
      throw new NotFoundError("Linked email not found");
    }

    if (normalizeEmail(targetEmail.email).endsWith("@life.hkbu.edu.hk")) {
      throw new ForbiddenError("HKBU life email cannot be unlinked.");
    }

    const remainingEmail = linkedEmails.find((item) => item.id !== emailId);
    if (!remainingEmail) {
      throw new AppError("At least one email must remain linked", 400, "LAST_EMAIL_REQUIRED");
    }

    const normalizedCurrentLoginEmail = normalizeEmail(session.loginEmail ?? previousPrimary ?? "");
    const isCurrentLoginEmailUnlinked =
      normalizedCurrentLoginEmail.length > 0 &&
      normalizedCurrentLoginEmail === normalizeEmail(targetEmail.email);

    await prisma.$transaction(async (tx) => {
      await tx.userEmail.delete({
        where: { id: emailId },
      });
      // Remove legacy email-provider Account row if present (no longer created on register).
      await tx.account.deleteMany({
        where: {
          userId: user.id,
          provider: "email",
          providerAccountId: normalizeEmail(targetEmail.email),
        },
      });
    });

    await redis.del(`user:${user.id}`);
    if (isCurrentLoginEmailUnlinked) {
      await redis.del(`session:${jti}`);
    }

    const [nextLinkedEmails, hkbuEmailRecord] = await Promise.all([
      getLinkedEmailsForUser(user.id),
      getVerifiedHkbuEmailForUser(user.id),
    ]);

    const primaryEmail =
      normalizeEmail(previousPrimary ?? "") === normalizeEmail(targetEmail.email)
        ? remainingEmail.email
        : previousPrimary;
    const currentLoginEmail = isCurrentLoginEmailUnlinked
      ? remainingEmail.email
      : session.loginEmail ?? previousPrimary;

    return NextResponse.json({
      success: true,
      data: {
        linkedEmails: nextLinkedEmails.map((item) => serializeLinkedEmail(item, primaryEmail)),
        isHKBUVerified: Boolean(hkbuEmailRecord),
        hkbuEmail: hkbuEmailRecord?.email,
        currentLoginEmail,
        requiresRelogin: isCurrentLoginEmailUnlinked,
      },
    });
  } catch (error) {
    return handleError(error, req);
  }
}
