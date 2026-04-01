import { requireAdminSession } from '@/src/lib/admin-session'
import { logoutAction } from '@/app/admin/actions'

export default async function FeedbackPage() {
  const session = await requireAdminSession()

  return (
    <div className="max-w-4xl mx-auto p-8">
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
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
        <p className="text-gray-500 text-lg">
          Feedback list will be implemented in Phase 21.
        </p>
        <p className="text-gray-400 text-sm mt-2">
          Logged in as admin (user: {session.userId})
        </p>
      </div>
    </div>
  )
}
