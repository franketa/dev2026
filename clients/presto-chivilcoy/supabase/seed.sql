-- Presto Chivilcoy — Seed Data
-- Run this after schema.sql

-- Settings
INSERT INTO settings (business_name, description, address, whatsapp_number, mp_alias, mp_info, min_order)
VALUES (
  'Presto Chivilcoy',
  'Empanadas, Pizzas y Tartas artesanales',
  'Chivilcoy, Buenos Aires',
  '',
  '',
  'Enviá el comprobante de pago por WhatsApp',
  0
);

-- Categories
INSERT INTO categories (name, emoji, sort_order) VALUES
  ('Empanadas', '🥟', 0),
  ('Pizzas', '🍕', 1),
  ('Tartas', '🥧', 2),
  ('Bebidas', '🥤', 3);

-- Products — Empanadas
INSERT INTO products (name, price, category_id, sort_order) VALUES
  ('Empanada de Carne', 1500, (SELECT id FROM categories WHERE name = 'Empanadas'), 0),
  ('Empanada de Jamón y Queso', 1500, (SELECT id FROM categories WHERE name = 'Empanadas'), 1),
  ('Empanada de Humita', 1500, (SELECT id FROM categories WHERE name = 'Empanadas'), 2),
  ('Empanada de Pollo', 1500, (SELECT id FROM categories WHERE name = 'Empanadas'), 3),
  ('Empanada de Verdura', 1500, (SELECT id FROM categories WHERE name = 'Empanadas'), 4),
  ('Empanada de Carne Picante', 1500, (SELECT id FROM categories WHERE name = 'Empanadas'), 5),
  ('Empanada de Roquefort y Jamón', 1800, (SELECT id FROM categories WHERE name = 'Empanadas'), 6),
  ('Docena de Empanadas (a elección)', 15000, (SELECT id FROM categories WHERE name = 'Empanadas'), 7),
  ('Media Docena de Empanadas (a elección)', 8000, (SELECT id FROM categories WHERE name = 'Empanadas'), 8);

-- Products — Pizzas
INSERT INTO products (name, price, category_id, sort_order) VALUES
  ('Pizza Muzzarella', 8000, (SELECT id FROM categories WHERE name = 'Pizzas'), 0),
  ('Pizza Napolitana', 9500, (SELECT id FROM categories WHERE name = 'Pizzas'), 1),
  ('Pizza Fugazzeta', 9500, (SELECT id FROM categories WHERE name = 'Pizzas'), 2),
  ('Pizza Calabresa', 9500, (SELECT id FROM categories WHERE name = 'Pizzas'), 3),
  ('Pizza Especial de la Casa', 11000, (SELECT id FROM categories WHERE name = 'Pizzas'), 4);

-- Products — Tartas
INSERT INTO products (name, price, category_id, sort_order) VALUES
  ('Tarta de Jamón y Queso', 7000, (SELECT id FROM categories WHERE name = 'Tartas'), 0),
  ('Tarta de Verdura', 7000, (SELECT id FROM categories WHERE name = 'Tartas'), 1),
  ('Tarta de Zapallito', 7000, (SELECT id FROM categories WHERE name = 'Tartas'), 2),
  ('Tarta de Choclo', 7500, (SELECT id FROM categories WHERE name = 'Tartas'), 3);

-- Products — Bebidas
INSERT INTO products (name, price, category_id, sort_order) VALUES
  ('Coca-Cola 500ml', 2000, (SELECT id FROM categories WHERE name = 'Bebidas'), 0),
  ('Coca-Cola 1.5L', 3500, (SELECT id FROM categories WHERE name = 'Bebidas'), 1),
  ('Agua Mineral 500ml', 1200, (SELECT id FROM categories WHERE name = 'Bebidas'), 2),
  ('Cerveza Quilmes 1L', 3000, (SELECT id FROM categories WHERE name = 'Bebidas'), 3);
