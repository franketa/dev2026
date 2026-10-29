#!/bin/sh
# Genera los dos PDF de la guía desde guia.html con Chrome headless.
#   sh generar.sh
DIR="$(cd "$(dirname "$0")" && pwd)"
CHROME="${CHROME:-C:/Program Files/Google/Chrome/Application/chrome.exe}"
URL="file:///$(cd "$DIR" && pwd -W 2>/dev/null || pwd)/guia.html"
for f in movil a4; do
  case $f in movil) out="Guia del piloto - Aeroclub 25 de Mayo (celular).pdf";; a4) out="Guia del piloto - Aeroclub 25 de Mayo (A4).pdf";; esac
  "$CHROME" --headless=new --disable-gpu --no-pdf-header-footer --virtual-time-budget=8000 \
    --print-to-pdf="$DIR/$out" "$URL?f=$f" 2>/dev/null
  echo "$out"
done
