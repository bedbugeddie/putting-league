import clsx from 'clsx'
import type { LeagueStatus } from '../../api/types'

const styles: Record<LeagueStatus, string> = {
  SCHEDULED:   'bg-blue-100 text-blue-800',
  IN_PROGRESS: 'bg-green-100 text-green-800',
  COMPLETED:   'bg-gray-100 text-gray-700',
  CANCELLED:   'bg-red-100 text-red-700',
}

const labels: Record<LeagueStatus, string> = {
  SCHEDULED:   'Scheduled',
  IN_PROGRESS: '● Live',
  COMPLETED:   'Completed',
  CANCELLED:   'Cancelled',
}

export default function StatusBadge({ status }: { status: LeagueStatus }) {
  return (
    <span className={clsx('badge', styles[status])}>
      {labels[status]}
    </span>
  )
}
