'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { runLeaveSaves } from '../lib/saveOnLeave'

const NAV_ITEMS = [
  { href: '/simulation', label: 'Simulation' },
  { href: '/mediator', label: 'Mediator' },
  { href: '/agent-participant', label: 'Agent Participant' },
  { href: '/assistant', label: 'Agent Assistant' },
] as const

export function Nav() {
  const pathname = usePathname()
  const router = useRouter()
  const [leaving, setLeaving] = useState<string | null>(null)

  // Saves whatever the current tab has unsaved before switching, so edits to
  // prompts, pairings and the like are not lost by moving between toolkits.
  async function handleClick(e: React.MouseEvent<HTMLAnchorElement>, href: string) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
    e.preventDefault()
    if (href === pathname || leaving) return
    setLeaving(href)
    try {
      const ok = await runLeaveSaves()
      if (!ok && !window.confirm('Auto-save failed. Leave this tab anyway and lose unsaved changes?')) return
      router.push(href)
    } finally {
      setLeaving(null)
    }
  }

  return (
    <nav className="flex flex-wrap items-center gap-2">
      {NAV_ITEMS.map(item => {
        const active = pathname === item.href
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={e => handleClick(e, item.href)}
            className={`px-4 py-2 rounded-md border text-sm font-medium transition-colors ${active
                ? 'border-neutral-500 bg-neutral-800 text-neutral-100'
                : 'border-neutral-800 bg-neutral-900 text-neutral-400 hover:border-neutral-600 hover:text-neutral-200'
              }`}
          >
            {leaving === item.href ? 'Saving…' : item.label}
          </Link>
        )
      })}
    </nav>
  )
}
