'use client'

import { useState } from 'react'
import { changeStatusAction } from './actions'

interface StatusActionsProps {
  feedbackId: string
  currentStatus: string
}

const VALID_TRANSITIONS: Record<string, string[]> = {
  PENDING: ['REPLIED', 'RESOLVED'],
  REPLIED: ['RESOLVED'],
  RESOLVED: [],
}

const BUTTON_LABELS: Record<string, string> = {
  REPLIED: 'Mark Replied',
  RESOLVED: 'Resolve',
}

const BUTTON_STYLES: Record<string, string> = {
  REPLIED: 'bg-blue-600 hover:bg-blue-700 text-white',
  RESOLVED: 'bg-green-600 hover:bg-green-700 text-white',
}

export default function StatusActions({
  feedbackId,
  currentStatus,
}: StatusActionsProps) {
  const [loadingStatus, setLoadingStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const transitions = VALID_TRANSITIONS[currentStatus] || []

  if (transitions.length === 0) {
    return null
  }

  const handleTransition = async (newStatus: string) => {
    setLoadingStatus(newStatus)
    setError(null)
    try {
      const result = await changeStatusAction(feedbackId, newStatus)
      if (result.error) {
        setError(result.error)
      }
    } catch {
      setError('Failed to change status')
    } finally {
      setLoadingStatus(null)
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        {transitions.map((status) => (
          <button
            key={status}
            onClick={() => handleTransition(status)}
            disabled={loadingStatus !== null}
            className={`px-3 py-1.5 text-sm rounded-md disabled:opacity-50 ${BUTTON_STYLES[status] || ''}`}
          >
            {loadingStatus === status
              ? 'Updating...'
              : BUTTON_LABELS[status] || status}
          </button>
        ))}
      </div>
      {error && <p className="text-sm text-red-600 mt-1">{error}</p>}
    </div>
  )
}
