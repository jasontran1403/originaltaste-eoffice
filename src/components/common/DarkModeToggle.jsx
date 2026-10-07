import React from 'react'

export default function DarkModeToggle({ dark, onToggle, className = '' }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={dark ? 'Chuyển sáng' : 'Chuyển tối'}
      aria-label="Toggle dark mode"
      className={`inline-flex items-center justify-center w-8 h-8 rounded-lg border
        border-gray-300 bg-white text-gray-600 hover:bg-gray-50
        dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700
        shadow-sm transition-colors ${className}`}
    >
      {dark ? (
        // Sun icon
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      ) : (
        // Moon icon
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
        </svg>
      )}
    </button>
  )
}