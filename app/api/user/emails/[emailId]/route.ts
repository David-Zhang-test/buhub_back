import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/db";
import { getCurrentUser } from "@/src/lib/auth";
import { handleError, AppError, NotFoundError } from "@/src/lib/errors";
import {
  getLinkedEmailsForUser,
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
    const linkedEmails = await getLinkedEmailsForUser(user.id);

    if (linkedEmails.length !== 2) {
      throw new AppError("You can only unlink an email when two emails are linked", 400, "UNLINK_NOT_AVAILABLE");
    }

    const targetEmail = linkedEmails.find((item) => item.id === emailId);
    if (!targetEmail) {
      throw new NotFoundError("Linked email not found");
    }

    const remainingEmail = linkedEmails.find((item) => item.id !== emailId);
    if (!remainingEmail) {
      throw new AppError("At least one email must remain linked", 400, "LAST_EMAIL_REQUIRED");
    }

    const normalizedCurrentLoginEmail = normalizeEmail(session.loginEmail ?? user.email ?? "");
    const isCurrentLoginEmailUnlinked =
      normalizedCurrentLoginEmail.length > 0 &&
      normalizedCurrentLoginEmail === normalizeEmail(targetEmail.email);

    await prisma.$transaction(async (tx) => {
      await tx.userEmail.delete({
        where: { id: emailId },
      });

      await tx.account.deleteMany({
        where: {
          userId: user.id,
          provider: "email",
          providerAccountId: normalizeEmail(targetEmail.email),
        },
      });

      if (normalizeEmail(user.email ?? "") === normalizeEmail(targetEmail.email)) {
        await tx.user.update({
          where: { id: user.id },
          data: {
            email: remainingEmail.email,
            emailVerified: Boolean(remainingEmail.verifiedAt),
          },
        });
      }
    });

    await redis.del(`user:${user.id}`);
    if (isCurrentLoginEmailUnlinked) {
      await redis.del(`session:${jti}`);
    }

    const [nextLinkedEmails, hkbuEmailRecord] = await Promise.all([
      getLinkedEmailsForUser(user.id),
      getVerifiedHkbuEmailForUser(user.id),
    ]);

    const primaryEmail = normalizeEmail(user.email ?? "") === normalizeEmail(targetEmail.email)
      ? remainingEmail.email
      : user.email;
    const currentLoginEmail = isCurrentLoginEmailUnlinked
      ? remainingEmail.email
      : session.loginEmail ?? user.email;

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
