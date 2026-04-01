import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'BUHUB Admin',
  description: 'BUHUB Administration Panel',
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      {children}
    </div>
  )
}
