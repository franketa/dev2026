/** Pasa un número a letras. Un documento sin el importe en letras no sirve. */
export function enLetras(n: number): string {
  const U = ["", "un", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve", "diez",
    "once", "doce", "trece", "catorce", "quince", "dieciséis", "diecisiete", "dieciocho", "diecinueve"];
  const D = ["", "", "veinte", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"];
  const C = ["", "ciento", "doscientos", "trescientos", "cuatrocientos", "quinientos",
    "seiscientos", "setecientos", "ochocientos", "novecientos"];

  const hasta999 = (x: number): string => {
    if (x === 0) return "";
    if (x === 100) return "cien";
    const c = Math.floor(x / 100), resto = x % 100;
    let s = C[c];
    if (resto > 0) {
      if (resto < 20) s += (s ? " " : "") + U[resto];
      else {
        const d = Math.floor(resto / 10), un = resto % 10;
        if (resto < 30 && un > 0) s += (s ? " " : "") + "veinti" + U[un];
        else s += (s ? " " : "") + D[d] + (un ? " y " + U[un] : "");
      }
    }
    return s.trim();
  };

  n = Math.floor(Math.abs(n));
  if (n === 0) return "cero";
  const millones = Math.floor(n / 1_000_000);
  const miles = Math.floor((n % 1_000_000) / 1000);
  const resto = n % 1000;
  let out = "";
  if (millones > 0) out += (millones === 1 ? "un millón" : hasta999(millones) + " millones") + " ";
  if (miles > 0) out += (miles === 1 ? "mil" : hasta999(miles) + " mil") + " ";
  if (resto > 0) out += hasta999(resto);
  return out.trim();
}
