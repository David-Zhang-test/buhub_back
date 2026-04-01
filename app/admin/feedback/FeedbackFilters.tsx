'use client'

import { useRouter, useSearchParams } from 'next/navigation'

const STATUS_OPTIONS = ['All', 'PENDING', 'REPLIED', 'RESOLVED'] as const
const CATEGORY_OPTIONS = ['All', 'BUG', 'SUGGESTION', 'OTHER'] as const

interface FeedbackFiltersProps {
  statusCounts: Record<string, number>
}

export default function FeedbackFilters({ statusCounts }: FeedbackFiltersProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const currentStatus = searchParams.get('status') || 'All'
  const currentCategory = searchParams.get('category') || 'All'

  function handleStatusChange(status: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (status === 'All') {
      params.delete('status')
    } else {
      params.set('status', status)
    }
    params.delete('page')
    router.push('/admin/feedback?' + params.toString())
  }

  function handleCategoryChange(category: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (category === 'All') {
      params.delete('category')
    } else {
      params.set('category', category)
    }
    params.delete('page')
    router.push('/admin/feedback?' + params.toString())
  }

  return (
    <div>
      {/* Status count cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {(['PENDING', 'REPLIED', 'RESOLVED'] as const).map((status) => (
          <div
            key={status}
            className="bg-white rounded-lg border border-gray-200 px-4 py-3"
          >
            <p className="text-sm text-gray-500">{status}</p>
            <p className="text-2xl font-semibold text-gray-900">
              {statusCounts[status] || 0}
            </p>
          </div>
        ))}
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-1 mb-4">
        {STATUS_OPTIONS.map((status) => (
          <button
            key={status}
            onClick={() => handleStatusChange(status)}
            className={
              currentStatus === status
                ? 'px-4 py-2 text-sm font-medium rounded-md bg-blue-600 text-white'
                : 'px-4 py-2 text-sm font-medium rounded-md text-gray-600 hover:bg-gray-100'
            }
          >
            {status === 'All'
              ? 'All'
              : `${status} (${statusCounts[status] || 0})`}
          </button>
        ))}
      </div>

      {/* Category filter tabs */}
      <div className="flex gap-1 mb-6">
        {CATEGORY_OPTIONS.map((category) => (
          <button
            key={category}
            onClick={() => handleCategoryChange(category)}
            className={
              currentCategory === category
                ? 'px-4 py-2 text-sm font-medium rounded-md bg-gray-800 text-white'
                : 'px-4 py-2 text-sm font-medium rounded-md text-gray-600 hover:bg-gray-100'
            }
          >
            {category}
          </button>
        ))}
      </div>
    </div>
  )
}
