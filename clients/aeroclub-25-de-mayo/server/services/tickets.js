// Tickets de servicios (hangaraje, combustible, etc.), registro de aeronaves de terceros
// y cuentas de externos.
//
// Un ticket se carga en el libro como un único movimiento de tipo 'servicio' a la cuenta
// de quien corresponda (socio o externo) y entra en su cupón del mes. Si se cobra en el
// acto, se registra además el pago. No se editan: se anulan (contraasiento) y se hace otro.

const crypto = require('crypto');
const { db, auditar } = require('../db');
const ledger = require('./ledger');
const servicios = require('./servicios');
const {
  ErrorNegocio, hoy, sumarDias, ultimoDia, periodoDe, esFecha, esPeriodo, nombrePeriodo, parsePesos, parseCantidad, fmtCantidad,
  importeItem, fmtPesos, limpiarTexto, nombreCompleto, normalizarEmail, telefonoWhatsApp, MEDIOS
} = require('../util');

const DIAS_ATRAS_RAMPA = 7;
const MAX_ITEMS = 20;

const fmtNumero = (n) => `T-${String(n).padStart(5, '0')}`;

// ── Externos ────────────────────────────────────────────────────────────────
// Dueños de aeronaves de afuera: tienen cuenta corriente pero no entran al sistema.
function crearExterno(input, actor) {
  const nombre = limpiarTexto(input.nombre, 80);
  if (!nombre) throw new ErrorNegocio('Completá el nombre del propietario (persona o empresa)');
  const apellido = limpiarTexto(input.apellido, 60) || '';
  const telefono = limpiarTexto(input.telefono, 30);
  if (telefono && !telefonoWhatsApp(telefono)) throw new ErrorNegocio('Celular inválido: poné código de área y número (ej: 2345 401234)');
  const email = normalizarEmail(limpiarTexto(input.email, 120)) || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ErrorNegocio('Email inválido');
  const dni = limpiarTexto(input.dni, 15);
  try {
    const r = db.prepare(`
      INSERT INTO usuarios (nombre, apellido, email, telefono, dni, rol, password_hash, debe_cambiar_password)
      VALUES (?, ?, ?, ?, ?, 'externo', NULL, 0)`).run(nombre, apellido, email, telefono, dni);
    auditar(actor.id, 'externo.alta', `${nombreCompleto({ nombre, apellido })}${telefono ? `, ${telefono}` : ''}${dni ? `, DNI/CUIT ${dni}` : ''}`);
    return Number(r.lastInsertRowid);
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) throw new ErrorNegocio('Ya hay alguien registrado con ese email');
    throw e;
  }
}

function editarExterno(id, input, actor) {
  const antes = db.prepare(`SELECT * FROM usuarios WHERE id = ? AND rol = 'externo'`).get(id);
  if (!antes) throw new ErrorNegocio('Externo inexistente', 404);
  const nombre = limpiarTexto(input.nombre, 80);
  if (!nombre) throw new ErrorNegocio('Completá el nombre (persona o empresa)');
  const apellido = limpiarTexto(input.apellido, 60) || '';
  const telefono = limpiarTexto(input.telefono, 30);
  if (telefono && !telefonoWhatsApp(telefono)) throw new ErrorNegocio('Celular inválido: poné código de área y número (ej: 2345 401234)');
  const email = normalizarEmail(limpiarTexto(input.email, 120)) || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ErrorNegocio('Email inválido');
  const dni = limpiarTexto(input.dni, 15);
  const activo = input.activo === false || input.activo === 0 ? 0 : 1;
  try {
    db.prepare('UPDATE usuarios SET nombre = ?, apellido = ?, email = ?, telefono = ?, dni = ?, activo = ? WHERE id = ?')
      .run(nombre, apellido, email, telefono, dni, activo, id);
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) throw new ErrorNegocio('Ya hay alguien registrado con ese email');
    throw e;
  }
  const despues = { nombre, apellido, email, telefono, dni, activo };
  const cambios = Object.keys(despues).filter(k => String(despues[k] ?? '') !== String(antes[k] ?? '')).map(k => `${k}: ${antes[k] ?? '—'} → ${despues[k] ?? '—'}`);
  if (cambios.length) auditar(actor.id, 'externo.edicion', `${nombreCompleto(despues)}: ${cambios.join('; ')}`);
}

// Cuentas a las que se puede cargar un ticket (para el buscador de rampa y tesorería).
function cuentasParaTicket() {
  return db.prepare(`
    SELECT id, nombre, apellido, rol, telefono FROM usuarios
    WHERE activo = 1 AND rol IN ('piloto','admin','consulta','externo')
    ORDER BY CASE WHEN apellido = '' THEN nombre ELSE apellido END, nombre`).all();
}

// ── Aeronaves ───────────────────────────────────────────────────────────────
const REGEX_MATRICULA = /^[A-Z0-9]{1,3}-?[A-Z0-9]{2,5}$/;

function normalizarMatricula(v) {
  const m = limpiarTexto(v, 12)?.toUpperCase().replace(/\s/g, '');
  if (!m || !REGEX_MATRICULA.test(m)) throw new ErrorNegocio('Matrícula inválida (ej: LV-ABC)');
  return m;
}

const SELECT_AERONAVE = `
  SELECT ae.*, p.nombre prop_nombre, p.apellido prop_apellido, p.rol prop_rol, p.telefono prop_telefono,
    (SELECT COUNT(*) FROM tickets t WHERE t.aeronave_id = ae.id AND t.estado = 'vigente') tickets,
    (SELECT MAX(t.fecha) FROM tickets t WHERE t.aeronave_id = ae.id AND t.estado = 'vigente') ultimo_ticket
  FROM aeronaves ae JOIN usuarios p ON p.id = ae.propietario_id`;

function listarAeronaves() {
  return db.prepare(`${SELECT_AERONAVE} ORDER BY ae.matricula`).all();
}

function getAeronave(id) {
  const a = db.prepare(`${SELECT_AERONAVE} WHERE ae.id = ?`).get(id);
  if (!a) throw new ErrorNegocio('Aeronave inexistente', 404);
  return a;
}

// El propietario es una cuenta existente (`propietario_id`) o un externo nuevo (`externo: {...}`).
const guardarAeronave = db.transaction((input, actor, id = null) => {
  const matricula = normalizarMatricula(input.matricula);
  if (db.prepare('SELECT 1 FROM aviones WHERE matricula = ?').get(matricula)) {
    throw new ErrorNegocio(`${matricula} es un avión de la flota del club: sus horas se cargan como vuelos`);
  }
  const modelo = limpiarTexto(input.modelo, 60);
  const notas = limpiarTexto(input.notas, 300);
  let propietarioId;
  if (input.externo) {
    propietarioId = crearExterno(input.externo, actor);
  } else {
    propietarioId = Number(input.propietario_id);
    if (!propietarioId || !db.prepare('SELECT 1 FROM usuarios WHERE id = ?').get(propietarioId)) throw new ErrorNegocio('Elegí el propietario de la aeronave');
  }
  const dueno = db.prepare('SELECT nombre, apellido FROM usuarios WHERE id = ?').get(propietarioId);

  try {
    if (id == null) {
      const r = db.prepare('INSERT INTO aeronaves (matricula, modelo, propietario_id, notas, creado_por) VALUES (?, ?, ?, ?, ?)')
        .run(matricula, modelo, propietarioId, notas, actor.id);
      auditar(actor.id, 'aeronave.alta', `${matricula}${modelo ? ` ${modelo}` : ''}, propietario ${nombreCompleto(dueno)}`);
      return getAeronave(Number(r.lastInsertRowid));
    }
    const antes = getAeronave(id);
    db.prepare('UPDATE aeronaves SET matricula = ?, modelo = ?, propietario_id = ?, notas = ? WHERE id = ?').run(matricula, modelo, propietarioId, notas, id);
    const cambios = [];
    if (antes.matricula !== matricula) cambios.push(`matrícula: ${antes.matricula} → ${matricula}`);
    if ((antes.modelo || '') !== (modelo || '')) cambios.push(`modelo: ${antes.modelo || '—'} → ${modelo || '—'}`);
    if (antes.propietario_id !== propietarioId) cambios.push(`propietario: ${nombreCompleto({ nombre: antes.prop_nombre, apellido: antes.prop_apellido })} → ${nombreCompleto(dueno)}`);
    if ((antes.notas || '') !== (notas || '')) cambios.push('notas');
    if (cambios.length) auditar(actor.id, 'aeronave.edicion', `${matricula}: ${cambios.join('; ')}`);
    return getAeronave(id);
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) throw new ErrorNegocio(`La matrícula ${matricula} ya está registrada`);
    throw e;
  }
});

// ── Tickets ─────────────────────────────────────────────────────────────────
// Ítems del formulario → filas listas para guardar. Rampa sólo usa servicios de la tabla y a
// su precio; tesorería además puede cambiar el precio o agregar "otros conceptos".
function leerItems(items, actor) {
  if (!Array.isArray(items) || !items.length) throw new ErrorNegocio('Agregá al menos un servicio');
  if (items.length > MAX_ITEMS) throw new ErrorNegocio(`Como máximo ${MAX_ITEMS} ítems por ticket`);
  const esAdmin = actor.rol === 'admin';
  return items.map((it) => {
    const cantidad = parseCantidad(it.cantidad ?? '1');
    if (!cantidad) throw new ErrorNegocio('Cantidad inválida: usá números con hasta dos decimales (ej.: 40,5)');
    if (it.servicio_id) {
      const s = servicios.getServicio(Number(it.servicio_id));
      if (!s.activo) throw new ErrorNegocio(`${s.nombre} está dado de baja`);
      let precio = s.precio;
      if (esAdmin && it.precio != null && it.precio !== '') {
        precio = parsePesos(String(it.precio));
        if (precio == null || precio < 0) throw new ErrorNegocio(`Precio inválido en ${s.nombre}`);
      }
      if (!precio) throw new ErrorNegocio(`${s.nombre} no tiene precio cargado. Pedile a tesorería que lo complete en Flota y tarifas.`);
      return { servicio_id: s.id, concepto: s.nombre, unidad: s.unidad, cantidad, precio, importe: importeItem(precio, cantidad) };
    }
    if (!esAdmin) throw new ErrorNegocio('Elegí un servicio de la lista');
    const concepto = limpiarTexto(it.concepto, 80);
    if (!concepto) throw new ErrorNegocio('Escribí el concepto');
    const precio = parsePesos(String(it.precio ?? ''));
    if (precio == null || precio <= 0) throw new ErrorNegocio(`Indicá el importe de "${concepto}"`);
    return { servicio_id: null, concepto, unidad: null, cantidad, precio, importe: importeItem(precio, cantidad) };
  });
}

function describirItem(i) {
  return i.cantidad === 100 ? i.concepto : `${i.concepto} ${fmtCantidad(i.cantidad, i.unidad)}`;
}

function conceptoTicket(numero, matricula, items) {
  return `Ticket ${fmtNumero(numero)}${matricula ? ` (${matricula})` : ''}: ${items.map(describirItem).join(', ')}`.slice(0, 300);
}

const qItem = db.prepare(`
  INSERT INTO ticket_items (ticket_id, servicio_id, concepto, unidad, cantidad, precio, importe)
  VALUES (@ticket_id, @servicio_id, @concepto, @unidad, @cantidad, @precio, @importe)`);

// Guarda el ticket y su cargo en el libro. Sin validaciones de permisos: lo usan crear() y el cierre.
function insertar({ usuario_id, aeronave_id = null, matricula = null, fecha, origen, items, notas = null, creado_por = null, cierre_id = null }) {
  const numero = db.prepare('SELECT COALESCE(MAX(numero), 0) + 1 n FROM tickets').get().n;
  const total = items.reduce((s, i) => s + i.importe, 0);
  if (total <= 0) throw new ErrorNegocio('El total del ticket tiene que ser mayor a cero');
  const mov = ledger.registrar({
    usuario_id, tipo: 'servicio', concepto: conceptoTicket(numero, matricula, items), importe: total, fecha, cierre_id, creado_por
  });
  const r = db.prepare(`
    INSERT INTO tickets (numero, usuario_id, aeronave_id, matricula, fecha, origen, total, notas, movimiento_id, token, creado_por)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(numero, usuario_id, aeronave_id, matricula, fecha, origen, total, notas, mov.id, crypto.randomBytes(18).toString('base64url'), creado_por);
  const id = Number(r.lastInsertRowid);
  for (const it of items) qItem.run({ ticket_id: id, ...it });
  return { id, numero, total };
}

const crear = db.transaction((input, actor) => {
  const esAdmin = actor.rol === 'admin';
  const aeronave = input.aeronave_id ? getAeronave(Number(input.aeronave_id)) : null;
  if (!aeronave && !esAdmin) throw new ErrorNegocio('Elegí la aeronave');

  const usuarioId = Number(input.usuario_id || aeronave?.propietario_id);
  const u = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(usuarioId);
  if (!u) throw new ErrorNegocio('Elegí a nombre de quién va el ticket');
  if (!u.activo) throw new ErrorNegocio(`${nombreCompleto(u)} está dado de baja`);
  if (u.rol === 'rampa') throw new ErrorNegocio('Esa cuenta no puede recibir cargos');

  const fecha = input.fecha || hoy();
  if (!esFecha(fecha) || fecha > hoy()) throw new ErrorNegocio('Fecha inválida');
  if (!esAdmin && fecha < sumarDias(hoy(), -DIAS_ATRAS_RAMPA)) {
    throw new ErrorNegocio(`Sólo se pueden cargar tickets de los últimos ${DIAS_ATRAS_RAMPA} días. Para uno más viejo, pedíselo a tesorería.`);
  }
  const items = leerItems(input.items, actor);
  const notas = limpiarTexto(input.notas, 500);

  let medio = null;
  if (input.cobrado) {
    medio = MEDIOS.includes(input.medio) ? input.medio : null;
    if (!medio) throw new ErrorNegocio('Indicá cómo pagó');
  }

  const t = insertar({
    usuario_id: u.id, aeronave_id: aeronave?.id ?? null, matricula: aeronave?.matricula ?? null, fecha,
    origen: actor.rol === 'rampa' ? 'rampa' : 'tesoreria', items, notas, creado_por: actor.id
  });

  if (medio) {
    const pago = ledger.registrar({
      usuario_id: u.id, tipo: 'pago', concepto: `Pago del ticket ${fmtNumero(t.numero)} por ${medio}`,
      importe: -t.total, fecha, medio, creado_por: actor.id
    });
    db.prepare('UPDATE tickets SET pago_movimiento_id = ? WHERE id = ?').run(pago.id, t.id);
  }
  auditar(actor.id, 'ticket.alta',
    `${fmtNumero(t.numero)} a ${nombreCompleto(u)}${aeronave ? ` (${aeronave.matricula})` : ''}: ${fmtPesos(t.total)}${medio ? `, cobrado en el acto por ${medio}` : ', a cuenta'}`);
  return detalle(t.id);
});

const anular = db.transaction((id, motivo, actor) => {
  const t = db.prepare('SELECT * FROM tickets WHERE id = ?').get(id);
  if (!t) throw new ErrorNegocio('Ticket inexistente', 404);
  if (t.estado === 'anulado') throw new ErrorNegocio('Ese ticket ya está anulado');
  motivo = limpiarTexto(motivo, 200);
  if (!motivo) throw new ErrorNegocio('Contá brevemente por qué se anula (queda en el registro)');
  if (t.movimiento_id && !db.prepare('SELECT 1 FROM movimientos WHERE anula_id = ?').get(t.movimiento_id)) {
    ledger.anular(t.movimiento_id, `ticket anulado: ${motivo}`, actor.id);
  }
  db.prepare(`UPDATE tickets SET estado = 'anulado', motivo_anulacion = ? WHERE id = ?`).run(motivo, id);
  auditar(actor.id, 'ticket.anulacion', `${fmtNumero(t.numero)} (${fmtPesos(t.total)}): ${motivo}${t.pago_movimiento_id ? '. El pago en el acto queda como saldo a favor.' : ''}`);
  return detalle(id);
});

// Si un movimiento es el cargo de un ticket (o su anulación), se corrige desde el ticket: así
// el libro y el ticket nunca quedan desparejos.
function ticketDeMovimiento(movimientoId) {
  return db.prepare(`
    SELECT id, numero FROM tickets
    WHERE movimiento_id = @id OR movimiento_id = (SELECT anula_id FROM movimientos WHERE id = @id)`).get({ id: movimientoId }) || null;
}

const SELECT_TICKET = `
  SELECT t.*, u.nombre, u.apellido, u.telefono, u.email, u.dni, u.rol usuario_rol, ae.modelo,
         c.nombre || ' ' || c.apellido creado_por_nombre, pm.medio pago_medio,
         (SELECT GROUP_CONCAT(i.concepto, ', ') FROM ticket_items i WHERE i.ticket_id = t.id) resumen
  FROM tickets t
  JOIN usuarios u ON u.id = t.usuario_id
  LEFT JOIN aeronaves ae ON ae.id = t.aeronave_id
  LEFT JOIN usuarios c ON c.id = t.creado_por
  LEFT JOIN movimientos pm ON pm.id = t.pago_movimiento_id`;

function detalle(id) {
  const t = db.prepare(`${SELECT_TICKET} WHERE t.id = ?`).get(id);
  if (!t) throw new ErrorNegocio('Ticket inexistente', 404);
  const items = db.prepare('SELECT * FROM ticket_items WHERE ticket_id = ? ORDER BY id').all(id)
    .map(i => ({ ...i, cantidad_txt: fmtCantidad(i.cantidad, i.unidad) }));
  return { ...t, numero_txt: fmtNumero(t.numero), items };
}

function listar(filtros = {}) {
  const where = [];
  const params = {};
  if (filtros.periodo && esPeriodo(filtros.periodo)) { where.push('substr(t.fecha,1,7) = @periodo'); params.periodo = filtros.periodo; }
  if (filtros.usuario_id) { where.push('t.usuario_id = @usuario_id'); params.usuario_id = Number(filtros.usuario_id); }
  if (filtros.creado_por) { where.push('t.creado_por = @creado_por'); params.creado_por = Number(filtros.creado_por); }
  if (filtros.aeronave_id) { where.push('t.aeronave_id = @aeronave_id'); params.aeronave_id = Number(filtros.aeronave_id); }
  if (['vigente', 'anulado'].includes(filtros.estado)) { where.push('t.estado = @estado'); params.estado = filtros.estado; }
  if (['rampa', 'tesoreria', 'cierre'].includes(filtros.origen)) { where.push('t.origen = @origen'); params.origen = filtros.origen; }
  const limite = Math.min(Number(filtros.limite) || 300, 1000);
  return db.prepare(`${SELECT_TICKET} ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY t.fecha DESC, t.id DESC LIMIT ${limite}`).all(params).map(t => ({ ...t, numero_txt: fmtNumero(t.numero) }));
}

// Servicios facturados en un mes, valorizados (para el panel y los reportes).
function resumenServicios(periodo) {
  return db.prepare(`
    SELECT i.servicio_id, COALESCE(s.nombre, 'Otros conceptos') nombre, s.unidad,
           SUM(i.cantidad) cantidad, SUM(i.importe) importe, COUNT(DISTINCT t.id) tickets
    FROM ticket_items i JOIN tickets t ON t.id = i.ticket_id LEFT JOIN servicios s ON s.id = i.servicio_id
    WHERE t.estado = 'vigente' AND substr(t.fecha,1,7) = ?
    GROUP BY COALESCE(i.servicio_id, 0)
    ORDER BY COALESCE(s.orden, 999), nombre`).all(periodo)
    .map(r => ({ ...r, cantidad_txt: r.unidad ? fmtCantidad(r.cantidad, r.unidad) : `${r.tickets} ${r.tickets === 1 ? 'cargo' : 'cargos'}` }));
}

// Derecho de aeronave: se cobra en el cierre, una vez por piloto y por mes en que voló.
// `vuelos` son los que entran en este cierre (incluye los cargados tarde de meses anteriores).
function cobrarDerechos(vuelos, cierreId, actor) {
  const derecho = servicios.derechoAeronave();
  if (!derecho) return 0;
  const pares = new Map();
  for (const v of vuelos) pares.set(`${v.piloto_id}|${periodoDe(v.fecha)}`, { usuario_id: v.piloto_id, periodo: periodoDe(v.fecha) });
  const ya = db.prepare('SELECT 1 FROM derechos_aeronave WHERE usuario_id = ? AND periodo = ?');
  const marcar = db.prepare('INSERT INTO derechos_aeronave (usuario_id, periodo, ticket_id) VALUES (?, ?, ?)');
  let n = 0;
  for (const { usuario_id, periodo } of pares.values()) {
    if (ya.get(usuario_id, periodo)) continue;
    const t = insertar({
      usuario_id, fecha: ultimoDia(periodo), origen: 'cierre', cierre_id: cierreId, creado_por: actor?.id ?? null,
      items: [{ servicio_id: derecho.id, concepto: `${derecho.nombre} de ${nombrePeriodo(periodo)}`, unidad: derecho.unidad, cantidad: 100, precio: derecho.precio, importe: derecho.precio }]
    });
    marcar.run(usuario_id, periodo, t.id);
    n++;
  }
  return n;
}

function porToken(token) {
  const t = db.prepare('SELECT id FROM tickets WHERE token = ?').get(String(token));
  return t ? detalle(t.id) : null;
}

module.exports = {
  crearExterno, editarExterno, cuentasParaTicket, listarAeronaves, getAeronave, guardarAeronave,
  crear, anular, detalle, listar, resumenServicios, cobrarDerechos, ticketDeMovimiento, porToken, fmtNumero
};
