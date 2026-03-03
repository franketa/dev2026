-- Presto Chivilcoy — Database Schema
-- Run this in your Supabase SQL Editor to set up all tables

-- ============================================
-- SETTINGS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name TEXT DEFAULT 'Presto Chivilcoy',
  description TEXT DEFAULT 'Empanadas, Pizzas y Tartas artesanales',
  address TEXT DEFAULT '',
  whatsapp_number TEXT DEFAULT '',
  mp_alias TEXT DEFAULT '',
  mp_info TEXT DEFAULT '',
  min_order INTEGER DEFAULT 0,
  schedule JSONB DEFAULT '{
    "lunes": { "enabled": true, "shifts": [{ "open": "11:00", "close": "15:00" }, { "open": "19:00", "close": "23:00" }] },
    "martes": { "enabled": true, "shifts": [{ "open": "11:00", "close": "15:00" }, { "open": "19:00", "close": "23:00" }] },
    "miercoles": { "enabled": true, "shifts": [{ "open": "11:00", "close": "15:00" }, { "open": "19:00", "close": "23:00" }] },
    "jueves": { "enabled": true, "shifts": [{ "open": "11:00", "close": "15:00" }, { "open": "19:00", "close": "23:00" }] },
    "viernes": { "enabled": true, "shifts": [{ "open": "11:00", "close": "15:00" }, { "open": "19:30", "close": "23:30" }] },
    "sabado": { "enabled": true, "shifts": [{ "open": "19:00", "close": "24:00" }] },
    "domingo": { "enabled": false, "shifts": [] }
  }'::jsonb,
  is_manually_closed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- CATEGORIES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  emoji TEXT DEFAULT '',
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- PRODUCTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  price INTEGER NOT NULL,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  is_available BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- ORDERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number SERIAL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  items JSONB NOT NULL,
  total INTEGER NOT NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'mercadopago')),
  pickup_time TEXT NOT NULL,
  notes TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Start order numbers from 1001
ALTER SEQUENCE orders_order_number_seq RESTART WITH 1001;

-- ============================================
-- UPDATED_AT TRIGGER
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER settings_updated_at
  BEFORE UPDATE ON settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

-- Settings: public read, auth write
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Settings are publicly readable"
  ON settings FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Settings are editable by authenticated users"
  ON settings FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Settings are insertable by authenticated users"
  ON settings FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Categories: public read, auth write
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Categories are publicly readable"
  ON categories FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Categories are editable by authenticated users"
  ON categories FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Products: public read, auth write
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Products are publicly readable"
  ON products FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Products are editable by authenticated users"
  ON products FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Orders: public insert, auth read/update
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can create orders"
  ON orders FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Orders are readable by authenticated users"
  ON orders FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Orders are updatable by authenticated users"
  ON orders FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);
