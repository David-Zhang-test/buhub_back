'use client'

import { useActionState, useRef, useEffect } from 'react'
import { submitReplyAction, type ReplyState } from './actions'

interface ReplyFormProps {
  feedbackId: string
}

export default function ReplyForm({ feedbackId }: ReplyFormProps) {
  const boundAction = submitReplyAction.bind(null, feedbackId)
  const [state, formAction, pending] = useActionState<ReplyState, FormData>(
    boundAction,
    undefined
  )
  const formRef = useRef<HTMLFormElement>(null)

  // Clear textarea on successful submission
  useEffect(() => {
    if (state?.success) {
      formRef.current?.reset()
    }
  }, [state])

  return (
    <form ref={formRef} action={formAction} className="mt-4">
      {state?.error && (
        <p className="text-sm text-red-600 bg-red-50 p-3 rounded mb-3">
          {state.error}
        </p>
      )}
      <textarea
        name="content"
        required
        rows={4}
        placeholder="Type your reply..."
        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-vertical"
        disabled={pending}
      />
      <div className="mt-2 flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {pending ? 'Submitting...' : 'Send Reply'}
        </button>
      </div>
    </form>
  )
}
