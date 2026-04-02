export default function Loading() {
  return (
    <div className="max-w-4xl mx-auto p-8">
      {/* Breadcrumb */}
      <div className="mb-6 flex items-center gap-2">
        <div className="h-4 w-16 bg-gray-200 rounded animate-pulse" />
        <div className="h-4 w-4 bg-gray-200 rounded animate-pulse" />
        <div className="h-4 w-20 bg-gray-200 rounded animate-pulse" />
      </div>

      {/* Main card */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        {/* Badge row */}
        <div className="flex items-center gap-2 mb-4">
          <div className="h-5 w-16 bg-gray-200 rounded-full animate-pulse" />
          <div className="h-5 w-20 bg-gray-200 rounded-full animate-pulse" />
        </div>

        {/* Description section */}
        <div className="mb-6">
          <div className="h-4 w-24 bg-gray-200 rounded animate-pulse mb-2" />
          <div className="space-y-2">
            <div className="h-4 w-full bg-gray-200 rounded animate-pulse" />
            <div className="h-4 w-3/4 bg-gray-200 rounded animate-pulse" />
          </div>
        </div>

        {/* Metadata grid */}
        <div className="border-t border-gray-100 pt-4 grid grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-4 w-40 bg-gray-200 rounded animate-pulse"
            />
          ))}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-3 mt-6">
        <div className="h-9 w-28 bg-gray-200 rounded-md animate-pulse" />
        <div className="h-9 w-28 bg-gray-200 rounded-md animate-pulse" />
        <div className="h-9 w-20 bg-gray-200 rounded-md animate-pulse" />
      </div>

      {/* Replies section */}
      <div className="mt-8">
        <div className="h-6 w-32 bg-gray-200 rounded animate-pulse mb-4" />
        {Array.from({ length: 2 }).map((_, i) => (
          <div
            key={i}
            className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-4"
          >
            <div className="h-4 w-24 bg-gray-200 rounded animate-pulse mb-2" />
            <div className="h-4 w-64 bg-gray-200 rounded animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  )
}
