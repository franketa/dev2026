-- ============================================================================
-- Garrahan CRM — esquema
-- Postgres 16. Todo en español, como lo lee el cliente.
-- ============================================================================

-- ---------------------------------------------------------------- empresa
CREATE TABLE IF NOT EXISTS empresa (
  id            int PRIMARY KEY DEFAULT 1,
  razon_social  text NOT NULL DEFAULT 'Garrahan Automotores',
  cuit          text,
  domicilio     text,
  localidad     text DEFAULT 'Chivilcoy',
  provincia     text DEFAULT 'Buenos Aires',
  telefono      text,
  email         text,
  logo_url      text,
  CONSTRAINT empresa_unica CHECK (id = 1)
);

CREATE TABLE IF NOT EXISTS sucursales (
  id       serial PRIMARY KEY,
  nombre   text NOT NULL,
  direccion text,
  activa   boolean NOT NULL DEFAULT true
);

-- Roles: dueno ve todo; vendedor no ve costos ni margenes; taller solo
-- preparacion; administrativo caja y cobranzas.
CREATE TABLE IF NOT EXISTS usuarios (
  id            serial PRIMARY KEY,
  nombre        text NOT NULL,
  email         text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  rol           text NOT NULL DEFAULT 'vendedor'
                CHECK (rol IN ('dueno','gerente','vendedor','administrativo','taller')),
  sucursal_id   int REFERENCES sucursales(id),
  telefono      text,
  meta_unidades int DEFAULT 0,
  comision_pct  numeric(5,2) DEFAULT 0,
  activo        boolean NOT NULL DEFAULT true,
  creado_en     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sesiones (
  token      text PRIMARY KEY,
  usuario_id int NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  expira_en  timestamptz NOT NULL,
  creado_en  timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------ inversores
CREATE TABLE IF NOT EXISTS inversores (
  id      serial PRIMARY KEY,
  nombre  text NOT NULL,
  tipo    text NOT NULL DEFAULT 'externo' CHECK (tipo IN ('propio','externo')),
  contacto text,
  activo  boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS inversor_movimientos (
  id            serial PRIMARY KEY,
  inversor_id   int NOT NULL REFERENCES inversores(id),
  tipo          text NOT NULL CHECK (tipo IN ('aporte','retiro','compra','venta','prestamo','devolucion')),
  monto         numeric(16,2) NOT NULL,
  moneda        text NOT NULL DEFAULT 'ARS' CHECK (moneda IN ('ARS','USD')),
  cotizacion    numeric(12,2) DEFAULT 1,
  descripcion   text,
  fecha         date NOT NULL DEFAULT current_date,
  vehiculo_id   int,
  contraparte_id int REFERENCES inversores(id),
  devuelto      boolean NOT NULL DEFAULT false,
  creado_en     timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------ catalogo y terceros
CREATE TABLE IF NOT EXISTS catalogo_marcas (
  id     serial PRIMARY KEY,
  nombre text NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS catalogo_modelos (
  id       serial PRIMARY KEY,
  marca_id int NOT NULL REFERENCES catalogo_marcas(id) ON DELETE CASCADE,
  nombre   text NOT NULL,
  UNIQUE (marca_id, nombre)
);

CREATE TABLE IF NOT EXISTS proveedores (
  id       serial PRIMARY KEY,
  nombre   text NOT NULL,
  rubro    text,
  cuit     text,
  telefono text,
  email    text,
  activo   boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS clientes (
  id        serial PRIMARY KEY,
  nombre    text NOT NULL,
  apellido  text,
  dni_cuit  text,
  telefono  text,
  email     text,
  direccion text,
  localidad text,
  notas     text,
  creado_en timestamptz NOT NULL DEFAULT now()
);

-- -------------------------------------------------------------- vehiculos
CREATE TABLE IF NOT EXISTS vehiculos (
  id              serial PRIMARY KEY,
  dominio         text,
  marca           text NOT NULL,
  modelo          text NOT NULL,
  version         text,
  anio            int,
  km              int DEFAULT 0,
  color           text,
  combustible     text,
  transmision     text,
  nro_motor       text,
  nro_chasis      text,
  titular         text,
  dni_titular     text,
  condicion       text NOT NULL DEFAULT 'usado' CHECK (condicion IN ('0km','usado')),
  tipo_adquisicion text NOT NULL DEFAULT 'compra_directa'
                  CHECK (tipo_adquisicion IN ('compra_directa','permuta','consignacion')),
  fecha_ingreso   date NOT NULL DEFAULT current_date,
  sucursal_id     int REFERENCES sucursales(id),
  inversor_id     int REFERENCES inversores(id),
  proveedor_id    int REFERENCES proveedores(id),
  valor_compra    numeric(16,2) NOT NULL DEFAULT 0,
  precio_venta    numeric(16,2) DEFAULT 0,
  precio_minimo   numeric(16,2),
  moneda_compra   text NOT NULL DEFAULT 'ARS' CHECK (moneda_compra IN ('ARS','USD')),
  cotizacion_compra numeric(12,2) DEFAULT 1,
  estado          text NOT NULL DEFAULT 'disponible'
                  CHECK (estado IN ('disponible','reservado','en_revision','en_taller','en_detailing','vendido','baja')),
  observaciones   text,
  creado_en       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vehiculos_estado_idx   ON vehiculos(estado);
CREATE INDEX IF NOT EXISTS vehiculos_sucursal_idx ON vehiculos(sucursal_id);
CREATE INDEX IF NOT EXISTS vehiculos_dominio_idx  ON vehiculos(lower(dominio));

-- El costo se carga DESDE el auto. Esa es la puerta de entrada natural.
CREATE TABLE IF NOT EXISTS vehiculo_costos (
  id           serial PRIMARY KEY,
  vehiculo_id  int NOT NULL REFERENCES vehiculos(id) ON DELETE CASCADE,
  tipo         text NOT NULL,
  detalle      text,
  proveedor_id int REFERENCES proveedores(id),
  fecha        date NOT NULL DEFAULT current_date,
  monto        numeric(16,2) NOT NULL,
  origen       text NOT NULL DEFAULT 'manual' CHECK (origen IN ('manual','taller')),
  orden_id     int,
  creado_en    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS costos_vehiculo_idx ON vehiculo_costos(vehiculo_id);

CREATE TABLE IF NOT EXISTS vehiculo_documentos (
  id          serial PRIMARY KEY,
  vehiculo_id int NOT NULL REFERENCES vehiculos(id) ON DELETE CASCADE,
  nombre      text NOT NULL,
  tipo        text,
  archivo     text NOT NULL,
  subido_en   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vehiculo_ficha (
  vehiculo_id int PRIMARY KEY REFERENCES vehiculos(id) ON DELETE CASCADE,
  vtv         boolean DEFAULT false,
  vtv_vence   date,
  titulo      boolean DEFAULT false,
  cedula      boolean DEFAULT false,
  form_08     boolean DEFAULT false,
  informe_dominio boolean DEFAULT false,
  deuda_patentes  numeric(16,2) DEFAULT 0,
  infracciones    numeric(16,2) DEFAULT 0,
  prenda      boolean DEFAULT false,
  notas       text
);

-- ----------------------------------------------------------------- taller
CREATE TABLE IF NOT EXISTS ordenes_taller (
  id            serial PRIMARY KEY,
  vehiculo_id   int NOT NULL REFERENCES vehiculos(id) ON DELETE CASCADE,
  estado        text NOT NULL DEFAULT 'en_revision'
                CHECK (estado IN ('en_revision','en_taller','en_detailing','completado')),
  fecha_ingreso date NOT NULL DEFAULT current_date,
  fecha_salida  date,
  notas         text,
  creada_por    int REFERENCES usuarios(id),
  creado_en     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS orden_items (
  id           serial PRIMARY KEY,
  orden_id     int NOT NULL REFERENCES ordenes_taller(id) ON DELETE CASCADE,
  tarea        text NOT NULL,
  hecho        boolean NOT NULL DEFAULT false,
  costo        numeric(16,2) DEFAULT 0,
  proveedor_id int REFERENCES proveedores(id),
  posicion     int NOT NULL DEFAULT 0
);

-- ------------------------------------------------------------------ leads
CREATE TABLE IF NOT EXISTS leads (
  id             serial PRIMARY KEY,
  cliente_id     int REFERENCES clientes(id),
  nombre         text NOT NULL,
  telefono       text,
  email          text,
  origen         text NOT NULL DEFAULT 'showroom',
  etapa          text NOT NULL DEFAULT 'captacion'
                 CHECK (etapa IN ('captacion','calificacion','negociacion','cierre','cerrado')),
  estado         text NOT NULL DEFAULT 'nuevo'
                 CHECK (estado IN ('nuevo','contactado','sin_respuesta','calificado','visita_agendada',
                                   'en_negociacion','reservado','vendido','postergado','perdido')),
  asesor_id      int REFERENCES usuarios(id),
  vehiculo_id    int REFERENCES vehiculos(id),
  vehiculo_texto text,
  presupuesto    numeric(16,2),
  entrega_usado  boolean DEFAULT false,
  usado_detalle  text,
  tasacion       numeric(16,2),
  proxima_accion text,
  fecha_proxima  date,
  motivo_perdida text,
  observaciones  text,
  sucursal_id    int REFERENCES sucursales(id),
  creado_en      timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS leads_estado_idx ON leads(estado);

-- El seguimiento del lead: cada llamada, cada visita, cada mensaje.
-- Sin esto el pipeline miente, porque muestra en que etapa esta pero no que se hizo.
CREATE TABLE IF NOT EXISTS lead_interacciones (
  id         serial PRIMARY KEY,
  lead_id    int NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  tipo       text NOT NULL DEFAULT 'nota'
             CHECK (tipo IN ('nota','llamada','whatsapp','email','visita','test_drive','cotizacion','cambio_estado')),
  detalle    text,
  usuario_id int REFERENCES usuarios(id),
  fecha      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lead_inter_lead_idx ON lead_interacciones(lead_id, fecha DESC);

-- ----------------------------------------------------------------- ventas
CREATE TABLE IF NOT EXISTS ventas (
  id                 serial PRIMARY KEY,
  numero             int GENERATED ALWAYS AS IDENTITY,
  vehiculo_id        int NOT NULL REFERENCES vehiculos(id),
  cliente_id         int REFERENCES clientes(id),
  vendedor_id        int REFERENCES usuarios(id),
  inversor_id        int REFERENCES inversores(id),
  sucursal_id        int REFERENCES sucursales(id),
  lead_id            int REFERENCES leads(id),
  fecha              date NOT NULL DEFAULT current_date,
  estado             text NOT NULL DEFAULT 'reserva'
                     CHECK (estado IN ('reserva','en_proceso','completada','cancelada')),
  precio             numeric(16,2) NOT NULL DEFAULT 0,
  descuento          numeric(16,2) NOT NULL DEFAULT 0,
  sena               numeric(16,2) NOT NULL DEFAULT 0,
  comision           numeric(16,2) NOT NULL DEFAULT 0,
  permuta_vehiculo_id int REFERENCES vehiculos(id),
  permuta_valor      numeric(16,2) DEFAULT 0,
  facturado          text DEFAULT 'pendiente' CHECK (facturado IN ('si','no','pendiente','exento')),
  estado_tramite     text DEFAULT 'iniciado'
                     CHECK (estado_tramite IN ('iniciado','cert_08','presentado','inscripto','entregado')),
  fecha_entrega      date,
  observaciones      text,
  creado_en          timestamptz NOT NULL DEFAULT now()
);

-- Una venta mezcla medios de pago: efectivo + permuta + financiacion.
CREATE TABLE IF NOT EXISTS venta_pagos (
  id         serial PRIMARY KEY,
  venta_id   int NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
  medio      text NOT NULL CHECK (medio IN ('efectivo','transferencia','permuta','financiacion','cheque','tarjeta','mercadopago','otro')),
  monto      numeric(16,2) NOT NULL,
  moneda     text NOT NULL DEFAULT 'ARS' CHECK (moneda IN ('ARS','USD')),
  cotizacion numeric(12,2) DEFAULT 1,
  fecha      date NOT NULL DEFAULT current_date,
  referencia text
);

CREATE TABLE IF NOT EXISTS financiaciones (
  id            serial PRIMARY KEY,
  venta_id      int REFERENCES ventas(id) ON DELETE CASCADE,
  entidad       text NOT NULL,
  monto         numeric(16,2) NOT NULL,
  cuotas        int NOT NULL DEFAULT 1,
  tasa          numeric(6,2),
  primera_cuota date,
  estado        text NOT NULL DEFAULT 'en_tramite'
                CHECK (estado IN ('en_tramite','aprobada','acreditada','rechazada')),
  notas         text
);

-- -------------------------------------------------------------------- caja
CREATE TABLE IF NOT EXISTS caja_cuentas (
  id            serial PRIMARY KEY,
  nombre        text NOT NULL,
  tipo          text NOT NULL DEFAULT 'efectivo' CHECK (tipo IN ('efectivo','banco','billetera')),
  moneda        text NOT NULL DEFAULT 'ARS' CHECK (moneda IN ('ARS','USD')),
  saldo_inicial numeric(16,2) NOT NULL DEFAULT 0,
  activa        boolean NOT NULL DEFAULT true,
  posicion      int NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS caja_movimientos (
  id              serial PRIMARY KEY,
  fecha           date NOT NULL DEFAULT current_date,
  tipo            text NOT NULL CHECK (tipo IN ('ingreso','egreso','transferencia')),
  cuenta_id       int NOT NULL REFERENCES caja_cuentas(id),
  cuenta_destino_id int REFERENCES caja_cuentas(id),
  categoria       text,
  descripcion     text NOT NULL,
  contraparte     text,
  vehiculo_id     int REFERENCES vehiculos(id),
  venta_id        int REFERENCES ventas(id),
  costo_id        int REFERENCES vehiculo_costos(id) ON DELETE SET NULL,
  monto           numeric(16,2) NOT NULL,
  moneda          text NOT NULL DEFAULT 'ARS' CHECK (moneda IN ('ARS','USD')),
  cotizacion      numeric(12,2) NOT NULL DEFAULT 1,
  equivalente_ars numeric(16,2) NOT NULL DEFAULT 0,
  forma_pago      text,
  comprobante     text,
  usuario_id      int REFERENCES usuarios(id),
  creado_en       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mov_fecha_idx   ON caja_movimientos(fecha DESC);
CREATE INDEX IF NOT EXISTS mov_cuenta_idx  ON caja_movimientos(cuenta_id);
CREATE INDEX IF NOT EXISTS mov_vehiculo_idx ON caja_movimientos(vehiculo_id);

CREATE TABLE IF NOT EXISTS caja_cierres (
  id            serial PRIMARY KEY,
  fecha         date NOT NULL,
  cuenta_id     int NOT NULL REFERENCES caja_cuentas(id),
  saldo_inicial numeric(16,2) NOT NULL DEFAULT 0,
  saldo_teorico numeric(16,2) NOT NULL DEFAULT 0,
  arqueo        numeric(16,2),
  diferencia    numeric(16,2),
  responsable_id int REFERENCES usuarios(id),
  cerrado       boolean NOT NULL DEFAULT false,
  notas         text,
  UNIQUE (fecha, cuenta_id)
);

-- --------------------------------------------------- cobranzas y deudas
CREATE TABLE IF NOT EXISTS cobranzas (
  id          serial PRIMARY KEY,
  cliente_id  int REFERENCES clientes(id),
  venta_id    int REFERENCES ventas(id),
  concepto    text NOT NULL,
  vencimiento date NOT NULL,
  monto       numeric(16,2) NOT NULL,
  cobrado     numeric(16,2) NOT NULL DEFAULT 0,
  cuota       text,
  estado      text NOT NULL DEFAULT 'pendiente'
              CHECK (estado IN ('pendiente','cobrado','vencido','en_gestion','incobrable')),
  forma_cobro text,
  fecha_cobro date,
  observaciones text
);

CREATE TABLE IF NOT EXISTS deudas (
  id            serial PRIMARY KEY,
  acreedor      text NOT NULL,
  concepto      text,
  tipo          text DEFAULT 'proveedor',
  monto         numeric(16,2) NOT NULL,
  pagado        numeric(16,2) NOT NULL DEFAULT 0,
  vencimiento   date,
  cuotas_restantes int DEFAULT 1,
  estado        text NOT NULL DEFAULT 'pendiente'
                CHECK (estado IN ('pendiente','pagado','vencido','en_curso')),
  observaciones text
);

-- ---------------------------------------------------- postventa y gestion
CREATE TABLE IF NOT EXISTS postventa (
  id            serial PRIMARY KEY,
  venta_id      int NOT NULL REFERENCES ventas(id) ON DELETE CASCADE,
  contacto_30   date,
  resultado_30  text,
  contacto_90   date,
  resultado_90  text,
  nps           int,
  referido      boolean DEFAULT false,
  nombre_referido text,
  estado_referido text,
  observaciones text
);

CREATE TABLE IF NOT EXISTS presupuestos (
  id        serial PRIMARY KEY,
  categoria text NOT NULL,
  tipo      text NOT NULL CHECK (tipo IN ('ingreso','gasto')),
  anio      int NOT NULL,
  mes       int NOT NULL CHECK (mes BETWEEN 1 AND 12),
  monto     numeric(16,2) NOT NULL DEFAULT 0,
  UNIQUE (categoria, anio, mes)
);

CREATE TABLE IF NOT EXISTS cotizaciones (
  fecha date PRIMARY KEY,
  valor numeric(12,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS auditoria (
  id         serial PRIMARY KEY,
  usuario_id int REFERENCES usuarios(id),
  entidad    text NOT NULL,
  entidad_id int,
  accion     text NOT NULL,
  detalle    text,
  fecha      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auditoria_fecha_idx ON auditoria(fecha DESC);

-- ============================================================================
-- Vista: costo real y margen por unidad. Una sola fuente de verdad.
-- La compra NO es un gasto del mes: es el valor de toma de la unidad.
-- ============================================================================
CREATE OR REPLACE VIEW v_vehiculos AS
SELECT
  v.*,
  s.nombre AS sucursal,
  i.nombre AS inversor,
  COALESCE(c.total_costos, 0)                                   AS costos,
  v.valor_compra + COALESCE(c.total_costos, 0)                  AS costo_total,
  v.precio_venta - (v.valor_compra + COALESCE(c.total_costos,0)) AS margen,
  CASE WHEN (v.valor_compra + COALESCE(c.total_costos,0)) > 0
       THEN round(((v.precio_venta - (v.valor_compra + COALESCE(c.total_costos,0)))
            / (v.valor_compra + COALESCE(c.total_costos,0)) * 100)::numeric, 2)
       ELSE 0 END                                               AS margen_pct,
  (current_date - v.fecha_ingreso)                              AS dias_stock,
  CASE
    WHEN v.estado IN ('vendido','baja') THEN NULL
    WHEN (current_date - v.fecha_ingreso) > 90 THEN 'rojo'
    WHEN (current_date - v.fecha_ingreso) > 60 THEN 'naranja'
    WHEN (current_date - v.fecha_ingreso) > 30 THEN 'amarillo'
    ELSE 'verde'
  END                                                           AS alerta
FROM vehiculos v
LEFT JOIN sucursales s ON s.id = v.sucursal_id
LEFT JOIN inversores i ON i.id = v.inversor_id
LEFT JOIN (
  SELECT vehiculo_id, SUM(monto) AS total_costos
  FROM vehiculo_costos GROUP BY vehiculo_id
) c ON c.vehiculo_id = v.id;

-- Saldo por cuenta: movimientos + transferencias recibidas.
CREATE OR REPLACE VIEW v_saldos AS
SELECT
  cu.id, cu.nombre, cu.tipo, cu.moneda,
  cu.saldo_inicial
    + COALESCE(SUM(CASE
        WHEN m.cuenta_id = cu.id AND m.tipo = 'ingreso' THEN m.monto
        WHEN m.cuenta_id = cu.id AND m.tipo IN ('egreso','transferencia') THEN -m.monto
        ELSE 0 END), 0)
    + COALESCE((SELECT SUM(CASE WHEN cu.moneda = 'USD' THEN t.monto ELSE t.equivalente_ars END)
                FROM caja_movimientos t
                WHERE t.cuenta_destino_id = cu.id AND t.tipo = 'transferencia'), 0)
  AS saldo
FROM caja_cuentas cu
LEFT JOIN caja_movimientos m ON m.cuenta_id = cu.id
GROUP BY cu.id, cu.nombre, cu.tipo, cu.moneda, cu.saldo_inicial;
