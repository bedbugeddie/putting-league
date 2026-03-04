interface Props {
  children: React.ReactNode
  sortKey: string
  currentKey: string | null
  currentDir: 'asc' | 'desc'
  onSort: (key: string) => void
  className?: string
  rowSpan?: number
}

export default function SortableHeader({ children, sortKey, currentKey, currentDir, onSort, className = '', rowSpan }: Props) {
  const active = currentKey === sortKey
  return (
    <th
      className={`cursor-pointer select-none ${className}`}
      onClick={() => onSort(sortKey)}
      rowSpan={rowSpan}
    >
      {children}{' '}
      <span className={`text-[10px] leading-none ${active ? 'text-brand-500' : 'text-gray-300 dark:text-gray-600'}`}>
        {active ? (currentDir === 'asc' ? '▲' : '▼') : '⇅'}
      </span>
    </th>
  )
}
