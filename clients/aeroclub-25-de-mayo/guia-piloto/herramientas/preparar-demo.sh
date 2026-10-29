#!/bin/sh
# Base demo para las capturas de la guía: datos ficticios, horario de cierre como en producción.
G="$(cd "$(dirname "$0")/.." && pwd)/.demo"
APP="$(cd "$(dirname "$0")/../.." && pwd)"
rm -rf "$G/data" && mkdir -p "$G/data"
cd "$APP" && DATA_DIR="$G/data" node server/seed-demo.js >/dev/null && DATA_DIR="$G/data" node -e "
const {db}=require('./server/db');
const u=(sql)=>db.prepare(sql).run();
u(\"UPDATE usuarios SET debe_cambiar_password=0, email_verificado_en=datetime('now'), telefono='2345 401234', licencia='PPA 12345', dni='35123456', cma_vence=date('now','+200 days') WHERE id=6\");
u(\"UPDATE usuarios SET debe_cambiar_password=1 WHERE id=7\");
u(\"UPDATE usuarios SET bloqueado=1, bloqueo_motivo='falta de pago', debe_cambiar_password=0, email_verificado_en=datetime('now') WHERE id=11\");
u(\"UPDATE usuarios SET cma_vence=date('now','-3 days'), debe_cambiar_password=0, email_verificado_en=datetime('now') WHERE id=10\");
u(\"UPDATE usuarios SET cma_vence=date('now','+18 days'), debe_cambiar_password=0 WHERE id=8\");
const set=db.prepare('UPDATE config SET valor=? WHERE clave=?');
set.run('1','cierre_dia'); set.run('0','cierre_hora'); set.run('10','vencimiento_dia');
set.run('alias.de.ejemplo','pago_alias'); set.run('0000000000000000000000','pago_cbu'); set.run('00-00000000-0','pago_cuit'); set.run('Banco de ejemplo','pago_banco');
set.run('Después de transferir, informá el pago desde la app.','pago_instrucciones');
console.log('base demo lista');"
