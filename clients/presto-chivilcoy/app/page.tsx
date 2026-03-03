'use client'

import { useState, useEffect } from 'react'
import { Header } from '@/components/layout/Header'
import { StatusBanner } from '@/components/layout/StatusBanner'
import { Footer } from '@/components/layout/Footer'
import { SearchBar } from '@/components/menu/SearchBar'
import { CategoryTabs } from '@/components/menu/CategoryTabs'
import { ProductCard } from '@/components/menu/ProductCard'
import { FloatingCart } from '@/components/menu/FloatingCart'
import { CartDrawer } from '@/components/menu/CartDrawer'
import { useBusinessStatus } from '@/hooks/useBusinessStatus'
import { useCart } from '@/hooks/useCart'
import { createClient } from '@/lib/supabase'
import type { Settings, Category, Product } from '@/lib/types'

export default function MenuPage() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [search, setSearch] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [cartOpen, setCartOpen] = useState(false)
  const [loading, setLoading] = useState(true)

  const { totalItems } = useCart()
  const status = useBusinessStatus(settings)

  useEffect(() => {
    async function load() {
      const supabase = createClient()

      const [settingsRes, categoriesRes, productsRes] = await Promise.all([
        supabase.from('settings').select('*').limit(1).single(),
        supabase.from('categories').select('*').order('sort_order'),
        supabase.from('products').select('*').order('sort_order'),
      ])

      if (settingsRes.data) setSettings(settingsRes.data)
      if (categoriesRes.data) setCategories(categoriesRes.data.filter((c: Category) => c.is_active))
      if (productsRes.data) setProducts(productsRes.data)
      setLoading(false)
    }
    load()
  }, [])

  const activeCategories = categories.filter(cat =>
    products.some(p => p.category_id === cat.id && p.is_available)
  )

  const filteredProducts = products.filter(p => {
    if (search) {
      return p.name.toLowerCase().includes(search.toLowerCase())
    }
    if (selectedCategory) {
      return p.category_id === selectedCategory
    }
    return true
  })

  const groupedProducts = selectedCategory || search
    ? [{ category: null, items: filteredProducts }]
    : activeCategories.map(cat => ({
        category: cat,
        items: filteredProducts.filter(p => p.category_id === cat.id),
      })).filter(g => g.items.length > 0)

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <div className="text-center">
          <div className="w-10 h-10 border-3 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="mt-3 text-sm text-text-secondary">Cargando menú...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <Header address={settings?.address} />
      <StatusBanner status={status} isManuallyClosed={settings?.is_manually_closed} />

      <main className="flex-1 mx-auto w-full max-w-2xl px-4 pb-28">
        {/* Search */}
        <div className="py-4">
          <SearchBar value={search} onChange={(v) => { setSearch(v); if (v) setSelectedCategory(null); }} />
        </div>

        {/* Category tabs */}
        {!search && (
          <div className="mb-4">
            <CategoryTabs
              categories={activeCategories}
              selected={selectedCategory}
              onSelect={setSelectedCategory}
            />
          </div>
        )}

        {/* Products */}
        <div className="space-y-6 stagger-children">
          {groupedProducts.map((group, idx) => (
            <div key={group.category?.id || idx}>
              {group.category && (
                <h2 className="text-base font-bold text-text mb-1 flex items-center gap-2">
                  <span>{group.category.emoji}</span>
                  <span>{group.category.name}</span>
                </h2>
              )}
              <div className="bg-card rounded-2xl border border-border divide-y divide-border px-4">
                {group.items.map(product => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    isOpen={status.isOpen}
                  />
                ))}
              </div>
            </div>
          ))}

          {filteredProducts.length === 0 && (
            <div className="text-center py-12">
              <p className="text-text-muted text-sm">No se encontraron productos</p>
            </div>
          )}
        </div>
      </main>

      <div className={totalItems > 0 ? 'pb-24' : ''}>
        <Footer />
      </div>

      <FloatingCart onClick={() => setCartOpen(true)} />
      <CartDrawer
        isOpen={cartOpen}
        onClose={() => setCartOpen(false)}
        minOrder={settings?.min_order ?? 0}
      />
    </div>
  )
}
