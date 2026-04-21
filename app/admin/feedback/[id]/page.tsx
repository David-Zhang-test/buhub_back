import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireAdminSession } from '@/src/lib/admin-session'
import { prisma } from '@/src/lib/db'
import StatusBadge, { CategoryBadge } from '../StatusBadge'
import ImageLightbox from './ImageLightbox'
import ReplyForm from './ReplyForm'
import StatusActions from './StatusActions'
import DeleteButton from './DeleteButton'

const dateFormatter = new Intl.DateTimeFormat('en', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

export default async function FeedbackDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireAdminSession()
  const { id } = await params

  const feedback = await prisma.feedback.findUnique({
    where: { id },
    include: {
      user: {
        select: {
          id: true,
          nickname: true,
          avatar: true,
          emails: { orderBy: { createdAt: 'asc' }, take: 1, select: { email: true } },
        },
      },
      replies: {
        include: { user: { select: { id: true, nickname: true } } },
        orderBy: { createdAt: 'asc' },
      },
    },
  })

  if (!feedback) notFound()

  return (
    <div className="max-w-4xl mx-auto p-8">
      {/* Breadcrumb */}
      <nav className="mb-6 text-sm">
        <Link
          href="/admin/feedback"
          className="text-blue-600 hover:text-blue-800"
        >
          Feedback
        </Link>
        <span className="mx-2 text-gray-400">&gt;</span>
        <span className="text-gray-500">#{feedback.id.slice(0, 8)}</span>
      </nav>

      {/* Main card */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        {/* Badges */}
        <div className="flex items-center gap-2 mb-4">
          <StatusBadge status={feedback.status} />
          <CategoryBadge category={feedback.category} />
        </div>

        {/* Description */}
        <div className="mb-6">
          <h2 className="text-sm font-medium text-gray-500 mb-2">Description</h2>
          <p className="text-gray-900 whitespace-pre-wrap">{feedback.description}</p>
        </div>

        {/* Screenshots */}
        {feedback.imageUrls.length > 0 && (
          <div className="mb-6">
            <h2 className="text-sm font-medium text-gray-500 mb-2">Screenshots</h2>
            <ImageLightbox imageUrls={feedback.imageUrls} />
          </div>
        )}

        {/* Metadata */}
        <div className="border-t border-gray-100 pt-4 grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-500">User:</span>{' '}
            <span className="text-gray-900">{feedback.user.nickname}</span>
          </div>
          <div>
            <span className="text-gray-500">Email:</span>{' '}
            <span className="text-gray-900">{feedback.user.emails[0]?.email ?? '—'}</span>
          </div>
          <div>
            <span className="text-gray-500">Created:</span>{' '}
            <span className="text-gray-900">
              {dateFormatter.format(new Date(feedback.createdAt))}
            </span>
          </div>
          <div>
            <span className="text-gray-500">Updated:</span>{' '}
            <span className="text-gray-900">
              {dateFormatter.format(new Date(feedback.updatedAt))}
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 mt-6">
        <StatusActions feedbackId={feedback.id} currentStatus={feedback.status} />
        <DeleteButton feedbackId={feedback.id} />
      </div>

      {/* Reply history */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Replies ({feedback.replies.length})
        </h2>
        {feedback.replies.length === 0 ? (
          <p className="text-gray-500 text-sm">No replies yet</p>
        ) : (
          <div className="space-y-4">
            {feedback.replies.map((reply) => (
              <div
                key={reply.id}
                className="bg-white rounded-lg shadow-sm border border-gray-200 p-4"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-900">
                    {reply.user.nickname} {reply.isAdmin ? <span className="text-blue-600">(Admin)</span> : <span className="text-gray-400">(User)</span>}
                  </span>
                  <span className="text-xs text-gray-500">
                    {dateFormatter.format(new Date(reply.createdAt))}
                  </span>
                </div>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">
                  {reply.content}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      <ReplyForm feedbackId={feedback.id} />
    </div>
  )
}
