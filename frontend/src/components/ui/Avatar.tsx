interface AvatarProps {
  name: string
  avatarDataUrl?: string | null
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const sizes = {
  sm: 'h-7 w-7 text-xs',
  md: 'h-9 w-9 text-sm',
  lg: 'h-20 w-20 text-2xl',
}

/** Displays a profile photo if available, otherwise shows initials on a green background. */
export default function Avatar({ name, avatarDataUrl, size = 'md', className = '' }: AvatarProps) {
  const sizeClass = sizes[size]

  if (avatarDataUrl) {
    return (
      <img
        src={avatarDataUrl}
        alt={name}
        className={`${sizeClass} rounded-full object-cover flex-shrink-0 ${className}`}
      />
    )
  }

  // Build initials: up to 2 chars from first + last name
  const parts = name.trim().split(/\s+/)
  const initials = parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : (parts[0]?.slice(0, 2) ?? '?').toUpperCase()

  return (
    <div
      className={`${sizeClass} rounded-full bg-brand-700 dark:bg-brand-600 text-white flex items-center justify-center font-semibold flex-shrink-0 select-none ${className}`}
      aria-label={name}
    >
      {initials}
    </div>
  )
}
