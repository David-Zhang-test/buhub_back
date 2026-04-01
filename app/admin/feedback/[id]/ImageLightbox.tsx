'use client'

import { useState, useEffect } from 'react'

export default function ImageLightbox({ imageUrls }: { imageUrls: string[] }) {
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedUrl(null)
    }
    if (selectedUrl) {
      document.addEventListener('keydown', handleKeyDown)
      return () => document.removeEventListener('keydown', handleKeyDown)
    }
  }, [selectedUrl])

  if (imageUrls.length === 0) return null

  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        {imageUrls.map((url, i) => (
          <button
            key={i}
            onClick={() => setSelectedUrl(url)}
            className="aspect-square rounded-lg overflow-hidden border border-gray-200 hover:border-blue-400 transition-colors"
          >
            <img src={url} alt={`Screenshot ${i + 1}`} className="w-full h-full object-cover" />
          </button>
        ))}
      </div>

      {selectedUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
          onClick={() => setSelectedUrl(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh]">
            <button
              onClick={() => setSelectedUrl(null)}
              className="absolute -top-10 right-0 text-white text-sm hover:text-gray-300"
            >
              Close (ESC)
            </button>
            <img
              src={selectedUrl}
              alt="Full size screenshot"
              className="max-w-full max-h-[85vh] object-contain rounded-lg"
            />
          </div>
        </div>
      )}
    </>
  )
}
