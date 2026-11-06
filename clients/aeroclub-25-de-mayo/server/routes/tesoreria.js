'use strict';
/* Servicio de datos del módulo Caja (Tesorería).
 *
 *   GET    /api/admin/tesoreria/docs           -> { docs: { "<ruta>": {...}, ... } }   (staff: admin y consulta)
 *   PUT    /api/admin/tesoreria/docs/:col/:id  cuerpo = objeto JSON                    (solo admin)
 *   DELETE /api/admin/tesoreria/docs/:col/:id                                          (solo admin)
 *
 * Cómo se monta (Express):
 *   const { crearRouter } = require('./tesoreria.routes.cjs');
 *   app.use('/api/admin/tesoreria', crearRouter(express, { db, requiereStaff, requiereAdmin }));
 *
 *  - db: conexión SQLite estilo better-sqlite3 (prepare().all/get/run). Si usan otra base, ver `almacen()`.
 *  - requiereStaff / requiereAdmin: los middlewares que el sitio YA usa para las rutas de administración
 *    (mismo criterio que /api/admin/cuentas: admin escribe, consulta solo lee). Deben responder 401/403.
 *  - Debe quedar detrás del mismo middleware de sesión y del chequeo del header X-A25 que usa el resto de /api.
 */
const LIMITES = { movs: 3500, pend: 500, socios: 500, cuentas: 60 };
const RUTA_OK = /^(?:(movs|pend|socios|cuentas)\/[A-Za-z0-9_-]{1,40}|app\/(?:cfg|reglas))$/;
const MAX_DOC_BYTES = 8 * 1024;

function almacen(db) {
  return {
    todos: () => db.prepare('SELECT ruta, json FROM tesoreria_docs').all(),
    existe: (ruta) => !!db.prepare('SELECT 1 AS x FROM tesoreria_docs WHERE ruta = ?').get(ruta),
    cuenta: (col) => db.prepare("SELECT COUNT(*) AS n FROM tesoreria_docs WHERE ruta LIKE ? || '/%'").get(col).n,
    guardar: (ruta, json, quien) => db.prepare(
      `INSERT INTO tesoreria_docs (ruta, json, actualizado_en, actualizado_por) VALUES (?, ?, datetime('now'), ?)
       ON CONFLICT(ruta) DO UPDATE SET json = excluded.json, actualizado_en = excluded.actualizado_en, actualizado_por = excluded.actualizado_por`
    ).run(ruta, json, quien),
    borrar: (ruta) => db.prepare('DELETE FROM tesoreria_docs WHERE ruta = ?').run(ruta)
  };
}

const quienEs = (req) => String((req.usuario && req.usuario.id) ?? (req.user && req.user.id) ?? '') || null;
const error = (res, status, msg) => res.status(status).json({ error: msg });

function handlers(db) {
  const a = almacen(db);
  return {
    listar(req, res) {
      const docs = {};
      for (const f of a.todos()) { try { docs[f.ruta] = JSON.parse(f.json); } catch { /* fila dañada: se omite */ } }
      res.json({ docs });
    },
    guardar(req, res) {
      const ruta = req.params.col + '/' + req.params.id;
      if (!RUTA_OK.test(ruta)) return error(res, 400, 'Ruta inválida.');
      const cuerpo = req.body;
      if (!cuerpo || typeof cuerpo !== 'object' || Array.isArray(cuerpo)) return error(res, 400, 'El documento debe ser un objeto.');
      const json = JSON.stringify(cuerpo);
      if (Buffer.byteLength(json) > MAX_DOC_BYTES) return error(res, 413, 'Documento demasiado grande.');
      const col = req.params.col;
      if (LIMITES[col] && !a.existe(ruta) && a.cuenta(col) >= LIMITES[col]) return error(res, 409, 'Se alcanzó el máximo de registros de esta sección.');
      a.guardar(ruta, json, quienEs(req));
      res.status(204).end();
    },
    borrar(req, res) {
      const ruta = req.params.col + '/' + req.params.id;
      if (!RUTA_OK.test(ruta)) return error(res, 400, 'Ruta inválida.');
      a.borrar(ruta);
      res.status(204).end();
    }
  };
}

function crearRouter(express, { db, requiereStaff, requiereAdmin }) {
  const r = express.Router();
  const h = handlers(db);
  r.use(express.json({ limit: '16kb' }));
  r.get('/docs', requiereStaff, h.listar);
  r.put('/docs/:col/:id', requiereAdmin, h.guardar);
  r.delete('/docs/:col/:id', requiereAdmin, h.borrar);
  return r;
}

module.exports = { crearRouter, handlers };
