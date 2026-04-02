'use client'

import { useRouter } from 'next/navigation'
import { useSearchParams } from 'next/navigation'
import StatusBadge, { CategoryBadge } from './StatusBadge'

interface FeedbackItem {
  id: string
  category: string
  description: string
  status: string
  createdAt: Date
  user: { id: string; nickname: string }
  _count: { replies: number }
}

const dateFormatter = new Intl.DateTimeFormat('en', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

export default function FeedbackTable({ feedbacks }: { feedbacks: FeedbackItem[] }) {
  const router = useRouter()
  const searchParams = useSearchParams()

  if (feedbacks.length === 0) {
    const statusFilter = searchParams.get('status')
    const categoryFilter = searchParams.get('category')
    let emptyMessage = 'No feedback yet'
    if (statusFilter && categoryFilter) {
      emptyMessage = `No ${statusFilter} ${categoryFilter} feedback`
    } else if (statusFilter) {
      emptyMessage = `No ${statusFilter} feedback`
    } else if (categoryFilter) {
      emptyMessage = `No ${categoryFilter} feedback`
    }

    return (
      <div className="p-12 text-center">
        <svg
          className="mx-auto h-12 w-12 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-2.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
          />
        </svg>
        <p className="mt-4 text-gray-500">{emptyMessage}</p>
      </div>
    )
  }

  return (
    <table className="min-w-full divide-y divide-gray-200">
      <thead className="bg-gray-50">
        <tr>
          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
            Status
          </th>
          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
            Category
          </th>
          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
            Description
          </th>
          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
            User
          </th>
          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
            Replies
          </th>
          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
            Created At
          </th>
        </tr>
      </thead>
      <tbody>
        {feedbacks.map((feedback) => (
          <tr
            key={feedback.id}
            onClick={() => router.push(`/admin/feedback/${feedback.id}`)}
            className="bg-white border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
          >
            <td className="px-6 py-4">
              <StatusBadge status={feedback.status} />
            </td>
            <td className="px-6 py-4">
              <CategoryBadge category={feedback.category} />
            </td>
            <td className="px-6 py-4 text-sm text-gray-900 max-w-xs truncate">
              {feedback.description.length > 80
                ? feedback.description.slice(0, 80) + '...'
                : feedback.description}
            </td>
            <td className="px-6 py-4 text-sm text-gray-500">
              {feedback.user.nickname}
            </td>
            <td className="px-6 py-4 text-sm text-gray-500">
              {feedback._count.replies}
            </td>
            <td className="px-6 py-4 text-sm text-gray-500 whitespace-nowrap">
              {dateFormatter.format(new Date(feedback.createdAt))}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
