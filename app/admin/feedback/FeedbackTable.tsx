import Link from 'next/link'
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
  if (feedbacks.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
        <p className="text-gray-500">No feedback found</p>
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
          <Link
            key={feedback.id}
            href={`/admin/feedback/${feedback.id}`}
            className="contents"
          >
            <tr className="bg-white border-b border-gray-100 hover:bg-gray-50 cursor-pointer">
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
          </Link>
        ))}
      </tbody>
    </table>
  )
}
