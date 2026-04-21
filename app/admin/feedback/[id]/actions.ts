'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireAdminSession } from '@/src/lib/admin-session'
import { prisma } from '@/src/lib/db'
import type { FeedbackStatus } from '@prisma/client'

export type ReplyState = { error?: string; success?: boolean } | undefined

const VALID_TRANSITIONS: Record<string, string[]> = {
  UNRESOLVED: ['RESOLVED', 'CLOSED'],
  RESOLVED: ['CLOSED'],
  CLOSED: [],
}

export async function submitReplyAction(
  feedbackId: string,
  prevState: ReplyState,
  formData: FormData
): Promise<ReplyState> {
  try {
    const session = await requireAdminSession()
    const content = formData.get('content') as string

    if (!content || content.trim().length === 0) {
      return { error: 'Reply content is required' }
    }

    await prisma.$transaction([
      prisma.feedbackReply.create({
        data: {
          feedbackId,
          userId: session.userId,
          isAdmin: true,
          content: content.trim(),
        },
      }),
    ])

    revalidatePath(`/admin/feedback/${feedbackId}`)
    return { success: true }
  } catch {
    return { error: 'Failed to submit reply' }
  }
}

export async function changeStatusAction(
  feedbackId: string,
  newStatus: string
): Promise<{ error?: string }> {
  try {
    await requireAdminSession()

    const feedback = await prisma.feedback.findUnique({
      where: { id: feedbackId },
      select: { status: true },
    })

    if (!feedback) {
      return { error: 'Feedback not found' }
    }

    if (!VALID_TRANSITIONS[feedback.status]?.includes(newStatus)) {
      return { error: 'Invalid status transition' }
    }

    await prisma.feedback.update({
      where: { id: feedbackId },
      data: { status: newStatus as FeedbackStatus },
    })

    revalidatePath(`/admin/feedback/${feedbackId}`)
    return {}
  } catch {
    return { error: 'Failed to change status' }
  }
}

export async function deleteFeedbackAction(feedbackId: string): Promise<void> {
  await requireAdminSession()

  try {
    await prisma.feedback.delete({ where: { id: feedbackId } })
  } catch {
    return
  }

  redirect('/admin/feedback')
}
