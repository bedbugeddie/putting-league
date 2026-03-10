import { useState, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkBreaks from 'remark-breaks'
import { api } from '../api/client'
import type { Motd } from '../api/types'

/** localStorage: remembers which MOTD was permanently dismissed.       */
const LS_KEY = 'dismissed_motd'
/** sessionStorage: prevents the modal from re-appearing within a tab.  */
const SS_KEY = 'motd_shown'

export default function MotdModal() {
  const [motd, setMotd]       = useState<Motd | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // Already shown in this browser session – skip
    if (sessionStorage.getItem(SS_KEY)) return

    api.get<Motd | null>('/motd/active')
      .then(data => {
        if (!data) return
        const dismissed = localStorage.getItem(LS_KEY)
        // Show only if the user hasn't permanently dismissed this exact MOTD
        if (dismissed !== data.id) {
          setMotd(data)
          setVisible(true)
          sessionStorage.setItem(SS_KEY, '1')
        }
      })
      .catch(() => { /* silently ignore – MOTD is non-critical */ })
  }, [])

  function dismiss(permanently: boolean) {
    if (permanently && motd) {
      localStorage.setItem(LS_KEY, motd.id)
    }
    setVisible(false)
  }

  if (!visible || !motd) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={() => dismiss(false)}
    >
      <div
        className="bg-white dark:bg-forest-surface rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col border border-gray-200 dark:border-forest-border"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between gap-3 px-6 pt-5 pb-4 border-b border-gray-100 dark:border-forest-border shrink-0">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl" aria-hidden>📣</span>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white leading-tight">
              {motd.title ?? 'League Announcement'}
            </h2>
          </div>
          <button
            onClick={() => dismiss(false)}
            aria-label="Close"
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded p-0.5 transition-colors shrink-0"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ── Scrollable body ── */}
        <div className="overflow-y-auto px-6 py-5 flex-1 min-h-0
          prose prose-sm dark:prose-invert max-w-none
          prose-headings:font-bold
          prose-headings:text-gray-900 dark:prose-headings:text-white
          prose-p:text-gray-700 dark:prose-p:text-gray-200 prose-p:leading-relaxed
          prose-strong:text-gray-900 dark:prose-strong:text-white
          prose-a:text-brand-600 dark:prose-a:text-brand-400 prose-a:underline
          prose-li:text-gray-700 dark:prose-li:text-gray-200
          prose-hr:border-gray-200 dark:prose-hr:border-forest-border
          prose-img:rounded-lg prose-img:max-h-96 prose-img:mx-auto">
          <ReactMarkdown
            remarkPlugins={[remarkBreaks]}
            urlTransform={(url) => {
              // react-markdown v8+ strips data: URLs by default.
              // Allow data:image/ so pasted images render correctly.
              if (url.startsWith('data:image/')) return url
              // Allow safe protocols and relative URLs; block everything else.
              if (/^(?:https?|mailto|#|\/|\.\.?\/)/i.test(url)) return url
              return ''
            }}
            components={{
              // Open all links in a new tab
              a: ({ href, children }) => (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-600 dark:text-brand-400 underline hover:opacity-80"
                >
                  {children}
                </a>
              ),
            }}
          >
            {motd.body}
          </ReactMarkdown>
        </div>

        {/* ── Footer ── */}
        <div className="px-6 py-4 border-t border-gray-100 dark:border-forest-border flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shrink-0">
          <button
            onClick={() => dismiss(true)}
            className="order-2 sm:order-1 text-sm text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 py-1.5 transition-colors text-left sm:text-center"
          >
            Don't show again
          </button>
          <button
            onClick={() => dismiss(false)}
            className="order-1 sm:order-2 px-6 py-2.5 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold transition-colors"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}
