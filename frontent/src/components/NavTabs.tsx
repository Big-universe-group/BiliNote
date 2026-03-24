import { Link, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils.ts'
import { FileText, Link2 } from 'lucide-react'

const tabs = [
  { to: '/', label: 'AI笔记', icon: FileText },
  { to: '/space', label: '链接提取', icon: Link2 },
]

const NavTabs = () => {
  const { pathname } = useLocation()

  return (
    <nav className="flex items-center gap-1 rounded-lg bg-neutral-100 p-1">
      {tabs.map(({ to, label, icon: Icon }) => {
        const active = to === '/' ? pathname === '/' : pathname.startsWith(to)
        return (
          <Link
            key={to}
            to={to}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors',
              active
                ? 'bg-white font-medium text-neutral-900 shadow-sm'
                : 'text-neutral-500 hover:text-neutral-700',
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </Link>
        )
      })}
    </nav>
  )
}

export default NavTabs
