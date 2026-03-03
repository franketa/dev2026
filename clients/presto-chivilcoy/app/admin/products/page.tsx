'use client'

import { useState, useEffect, useCallback } from 'react'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { formatPrice } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Switch } from '@/components/ui/Switch'
import type { Category, Product } from '@/lib/types'

export default function AdminProductsPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)

  // Category modal
  const [catModal, setCatModal] = useState(false)
  const [editingCat, setEditingCat] = useState<Category | null>(null)
  const [catName, setCatName] = useState('')
  const [catEmoji, setCatEmoji] = useState('')

  // Product modal
  const [prodModal, setProdModal] = useState(false)
  const [editingProd, setEditingProd] = useState<Product | null>(null)
  const [prodName, setProdName] = useState('')
  const [prodPrice, setProdPrice] = useState('')
  const [prodCategory, setProdCategory] = useState('')

  const fetchData = useCallback(async () => {
    const supabase = createClient()
    const [catsRes, prodsRes] = await Promise.all([
      supabase.from('categories').select('*').order('sort_order'),
      supabase.from('products').select('*').order('sort_order'),
    ])
    if (catsRes.data) setCategories(catsRes.data)
    if (prodsRes.data) setProducts(prodsRes.data)
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // Category CRUD
  function openCatModal(cat?: Category) {
    if (cat) {
      setEditingCat(cat)
      setCatName(cat.name)
      setCatEmoji(cat.emoji)
    } else {
      setEditingCat(null)
      setCatName('')
      setCatEmoji('')
    }
    setCatModal(true)
  }

  async function saveCat() {
    if (!catName.trim()) return
    const supabase = createClient()

    if (editingCat) {
      const { error } = await supabase.from('categories').update({ name: catName.trim(), emoji: catEmoji }).eq('id', editingCat.id)
      if (error) { console.error('Error updating category:', error); alert('Error: ' + error.message); return }
    } else {
      const maxOrder = categories.length > 0 ? Math.max(...categories.map(c => c.sort_order)) + 1 : 0
      const { error } = await supabase.from('categories').insert({ name: catName.trim(), emoji: catEmoji, sort_order: maxOrder })
      if (error) { console.error('Error creating category:', error); alert('Error: ' + error.message); return }
    }
    setCatModal(false)
    fetchData()
  }

  async function deleteCat(cat: Category) {
    const hasProducts = products.some(p => p.category_id === cat.id)
    if (hasProducts) {
      alert('No se puede eliminar una categoría que tiene productos')
      return
    }
    if (!confirm(`¿Eliminar la categoría "${cat.name}"?`)) return
    const supabase = createClient()
    const { error } = await supabase.from('categories').delete().eq('id', cat.id)
    if (error) { console.error('Error deleting category:', error); alert('Error: ' + error.message); return }
    fetchData()
  }

  // Product CRUD
  function openProdModal(prod?: Product) {
    if (prod) {
      setEditingProd(prod)
      setProdName(prod.name)
      setProdPrice(String(prod.price))
      setProdCategory(prod.category_id || '')
    } else {
      setEditingProd(null)
      setProdName('')
      setProdPrice('')
      setProdCategory(categories[0]?.id || '')
    }
    setProdModal(true)
  }

  async function saveProd() {
    if (!prodName.trim() || !prodPrice || !prodCategory) return
    const supabase = createClient()
    const price = parseInt(prodPrice)
    if (isNaN(price) || price <= 0) return

    if (editingProd) {
      const { error } = await supabase.from('products').update({
        name: prodName.trim(),
        price,
        category_id: prodCategory,
      }).eq('id', editingProd.id)
      if (error) { console.error('Error updating product:', error); alert('Error: ' + error.message); return }
    } else {
      const catProducts = products.filter(p => p.category_id === prodCategory)
      const maxOrder = catProducts.length > 0 ? Math.max(...catProducts.map(p => p.sort_order)) + 1 : 0
      const { error } = await supabase.from('products').insert({
        name: prodName.trim(),
        price,
        category_id: prodCategory,
        sort_order: maxOrder,
      })
      if (error) { console.error('Error creating product:', error); alert('Error: ' + error.message); return }
    }
    setProdModal(false)
    fetchData()
  }

  async function deleteProd(prod: Product) {
    if (!confirm(`¿Eliminar "${prod.name}"?`)) return
    const supabase = createClient()
    const { error } = await supabase.from('products').delete().eq('id', prod.id)
    if (error) { console.error('Error deleting product:', error); alert('Error: ' + error.message); return }
    fetchData()
  }

  async function toggleAvailability(prod: Product) {
    const supabase = createClient()
    const { error } = await supabase.from('products').update({ is_available: !prod.is_available }).eq('id', prod.id)
    if (error) {
      console.error('Error toggling availability:', error)
      alert('Error: ' + error.message)
      return
    }
    setProducts(prev => prev.map(p => p.id === prod.id ? { ...p, is_available: !p.is_available } : p))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6">
      <h1 className="text-xl font-bold text-text mb-6">Productos</h1>

      {/* Categories section */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">Categorías</h2>
          <Button size="sm" variant="secondary" onClick={() => openCatModal()}>
            <Plus className="w-3 h-3" /> Categoría
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {categories.map(cat => (
            <div
              key={cat.id}
              className="inline-flex items-center gap-1.5 bg-card border border-border rounded-full pl-3 pr-1.5 py-1.5"
            >
              <span className="text-sm">{cat.emoji} {cat.name}</span>
              <button
                onClick={() => openCatModal(cat)}
                className="p-1 rounded-full hover:bg-gray-100 text-text-muted hover:text-text transition-colors cursor-pointer"
                aria-label="Editar categoría"
              >
                <Pencil className="w-3 h-3" />
              </button>
              <button
                onClick={() => deleteCat(cat)}
                className="p-1 rounded-full hover:bg-red-50 text-text-muted hover:text-danger transition-colors cursor-pointer"
                aria-label="Eliminar categoría"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Products section */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">Productos</h2>
          <Button size="sm" onClick={() => openProdModal()}>
            <Plus className="w-3 h-3" /> Producto
          </Button>
        </div>

        <div className="space-y-6">
          {categories.map(cat => {
            const catProducts = products.filter(p => p.category_id === cat.id)
            if (catProducts.length === 0) return null
            return (
              <div key={cat.id}>
                <h3 className="text-sm font-semibold text-text mb-2">{cat.emoji} {cat.name}</h3>
                <div className="bg-card rounded-xl border border-border divide-y divide-border">
                  {catProducts.map(prod => (
                    <div key={prod.id} className="flex items-center gap-3 p-3">
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium ${prod.is_available ? 'text-text' : 'text-text-muted line-through'}`}>
                          {prod.name}
                        </p>
                        <p className="text-sm text-primary font-semibold">{formatPrice(prod.price)}</p>
                      </div>
                      <Switch
                        checked={prod.is_available}
                        onChange={() => toggleAvailability(prod)}
                      />
                      <button
                        onClick={() => openProdModal(prod)}
                        className="p-1.5 rounded-lg hover:bg-gray-100 text-text-muted hover:text-text transition-colors cursor-pointer"
                        aria-label="Editar producto"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => deleteProd(prod)}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-text-muted hover:text-danger transition-colors cursor-pointer"
                        aria-label="Eliminar producto"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Category Modal */}
      <Modal isOpen={catModal} onClose={() => setCatModal(false)} title={editingCat ? 'Editar categoría' : 'Nueva categoría'}>
        <div className="space-y-4">
          <Input label="Nombre" value={catName} onChange={(e) => setCatName(e.target.value)} placeholder="Ej: Empanadas" />
          <Input label="Emoji" value={catEmoji} onChange={(e) => setCatEmoji(e.target.value)} placeholder="Ej: 🥟" />
          <Button onClick={saveCat} className="w-full">Guardar</Button>
        </div>
      </Modal>

      {/* Product Modal */}
      <Modal isOpen={prodModal} onClose={() => setProdModal(false)} title={editingProd ? 'Editar producto' : 'Nuevo producto'}>
        <div className="space-y-4">
          <Input label="Nombre" value={prodName} onChange={(e) => setProdName(e.target.value)} placeholder="Ej: Empanada de Carne" />
          <Input label="Precio (en pesos)" type="number" value={prodPrice} onChange={(e) => setProdPrice(e.target.value)} placeholder="Ej: 1500" />
          <div>
            <label className="block text-sm font-medium text-text mb-1.5">Categoría</label>
            <select
              value={prodCategory}
              onChange={(e) => setProdCategory(e.target.value)}
              className="w-full rounded-xl border border-border bg-card px-4 py-2.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            >
              <option value="">Seleccioná una categoría</option>
              {categories.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.emoji} {cat.name}</option>
              ))}
            </select>
          </div>
          <Button onClick={saveProd} className="w-full">Guardar</Button>
        </div>
      </Modal>
    </div>
  )
}
