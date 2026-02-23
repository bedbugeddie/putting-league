import clsx from 'clsx'

interface ScoreInputProps {
  value: number | null
  onChange: (v: number) => void
  disabled?: boolean
}

/**
 * Compact 0/1/2/3 toggle — each click cycles through values.
 * Shows a gold star bonus indicator when value === 3.
 */
export default function ScoreInput({ value, onChange, disabled }: ScoreInputProps) {
  const buttons = [0, 1, 2, 3]

  return (
    <div className="flex items-center gap-1.5 sm:gap-1">
      {buttons.map(v => (
        <button
          key={v}
          type="button"
          disabled={disabled}
          onClick={() => onChange(v)}
          className={clsx(
            'w-11 h-11 sm:w-9 sm:h-9 rounded-lg text-base sm:text-sm font-bold transition-colors border',
            value === v
              ? v === 3
                ? 'bg-yellow-400 border-yellow-500 text-yellow-900'
                : 'bg-brand-600 border-brand-700 text-white'
              : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-600',
            disabled && 'opacity-50 cursor-not-allowed'
          )}
        >
          {v === 3 ? '3★' : v}
        </button>
      ))}
    </div>
  )
}
