'use client'

import type { Category } from '@/lib/types'

interface CategoryTabsProps {
  categories: Category[]
  selected: string | null
  onSelect: (id: string | null) => void
}

export function CategoryTabs({ categories, selected, onSelect }: CategoryTabsProps) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide -mx-4 px-4">
      <button
        onClick={() => onSelect(null)}
        className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all duration-150 cursor-pointer ${
          selected === null
            ? 'bg-primary text-white shadow-sm'
            : 'bg-card text-text-secondary border border-border hover:border-primary/30'
        }`}
      >
        Todo
      </button>
      {categories.map((cat) => (
        <button
          key={cat.id}
          onClick={() => onSelect(cat.id)}
          className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all duration-150 cursor-pointer ${
            selected === cat.id
              ? 'bg-primary text-white shadow-sm'
              : 'bg-card text-text-secondary border border-border hover:border-primary/30'
          }`}
        >
          {cat.emoji} {cat.name}
        </button>
      ))}
    </div>
  )
}
