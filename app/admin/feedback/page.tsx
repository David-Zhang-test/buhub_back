import { Suspense } from 'react'
import { requireAdminSession } from '@/src/lib/admin-session'
import { logoutAction } from '@/app/admin/actions'
import { prisma } from '@/src/lib/db'
import { Prisma } from '@prisma/client'
import FeedbackFilters from './FeedbackFilters'
import FeedbackTable from './FeedbackTable'
import Pagination from './Pagination'

const PAGE_SIZE = 20
const VALID_STATUSES = ['UNRESOLVED', 'RESOLVED', 'CLOSED']
const VALID_CATEGORIES = ['BUG', 'SUGGESTION', 'OTHER']

interface FeedbackPageProps {
  searchParams: Promise<{
    page?: string
    status?: string
    category?: string
  }>
}

export default async function FeedbackPage({ searchParams }: FeedbackPageProps) {
  await requireAdminSession()

  const params = await searchParams
  const rawPage = parseInt(params.page || '1', 10)
  const page = Number.isNaN(rawPage) ? 1 : Math.max(1, rawPage)
  const statusFilter = params.status && VALID_STATUSES.includes(params.status) ? params.status : undefined
  const categoryFilter = params.category && VALID_CATEGORIES.includes(params.category) ? params.category : undefined

  // Build where clause for table query
  const where: Prisma.FeedbackWhereInput = {}
  if (statusFilter) {
    where.status = statusFilter as 'UNRESOLVED' | 'RESOLVED' | 'CLOSED'
  }
  if (categoryFilter) {
    where.category = categoryFilter as 'BUG' | 'SUGGESTION' | 'OTHER'
  }

  // Separate where clause for status counts -- excludes status filter
  // so stat cards always show global totals (scoped by category if active)
  const countWhere: Prisma.FeedbackWhereInput = {}
  if (categoryFilter) {
    countWhere.category = categoryFilter as 'BUG' | 'SUGGESTION' | 'OTHER'
  }

  const [feedbacks, total, statusCounts] = await Promise.all([
    prisma.feedback.findMany({
      where,
      select: {
        id: true,
        category: true,
        description: true,
        status: true,
        createdAt: true,
        user: { select: { id: true, nickname: true } },
        _count: { select: { replies: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.feedback.count({ where }),
    prisma.feedback.groupBy({
      by: ['status'],
      where: countWhere,
      _count: true,
    }),
  ])

  const stats: Record<string, number> = { UNRESOLVED: 0, RESOLVED: 0, CLOSED: 0 }
  statusCounts.forEach((s) => { stats[s.status] = s._count })

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="max-w-7xl mx-auto p-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">Feedback Management</h1>
        <form action={logoutAction}>
          <button
            type="submit"
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-md hover:bg-gray-100"
          >
            Log out
          </button>
        </form>
      </div>
      <Suspense fallback={null}>
        <FeedbackFilters statusCounts={stats} />
      </Suspense>
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <FeedbackTable feedbacks={feedbacks} />
      </div>
      <Suspense fallback={null}>
        <Pagination currentPage={page} totalPages={totalPages} />
      </Suspense>
    </div>
  )
}
