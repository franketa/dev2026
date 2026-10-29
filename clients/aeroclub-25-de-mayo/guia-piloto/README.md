# Guía del piloto y del alumno

PDF para los socios: cómo entrar, cargar vuelos, leer la cuenta y el cupón, y cómo se cobra.

- `Guia del piloto - Aeroclub 25 de Mayo (celular).pdf`: hoja angosta, para mandar por WhatsApp.
- `Guia del piloto - Aeroclub 25 de Mayo (A4).pdf`: para imprimir.

Los dos salen de `guia.html` (`?f=movil` o `?f=a4`). Las capturas son de la base demo (datos
inventados, alias y CBU de ejemplo), nunca de producción.

## Regenerar

```sh
sh herramientas/preparar-demo.sh                      # base demo en .demo/
DATA_DIR=guia-piloto/.demo/data PORT=3918 node server/index.js   # desde la carpeta del cliente, aparte
node herramientas/capturar.mjs                        # capturas en .capturas/
python herramientas/procesar.py                       # a img/
sh generar.sh                                         # los dos PDF
```
