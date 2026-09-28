'use client'

import Link from 'next/link'
import type { SimulationSummary } from '../lib/blocks'

// Says which simulation the "Add item" menu is offering blocks from. Blocks are
// only readable once a simulation has been saved, so an empty list is a normal
// state worth explaining rather than hiding.
export function SimulationBlockPicker({ simulations, selectedId, onSelect, error }: {
  simulations: SimulationSummary[]
  selectedId: string | null
  onSelect: (id: string) => void
  error?: string | null
}) {
  if (simulations.length === 0) {
    return (
      <div className="space-y-1">
        <p className="text-sm text-neutral-500">
          No saved simulations yet — add blocks under Block Customization in the{' '}
          <Link href="/simulation" className="underline hover:text-neutral-300">Simulation Toolkit</Link>
          {' '}and save, and they will show up under “Add item”.
        </p>
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    )
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 text-sm text-neutral-500">
        <span>Blocks from</span>
        {simulations.length === 1 ? (
          <span className="text-neutral-300">{simulations[0].name}</span>
        ) : (
          <select
            value={selectedId ?? ''}
            onChange={e => onSelect(e.target.value)}
            className="px-2 py-1 rounded-md border border-neutral-700 bg-neutral-900 text-sm text-neutral-300 hover:border-neutral-500 transition-colors cursor-pointer"
          >
            {simulations.map(sim => (
              <option key={sim.id} value={sim.id}>{sim.name}</option>
            ))}
          </select>
        )}
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}
