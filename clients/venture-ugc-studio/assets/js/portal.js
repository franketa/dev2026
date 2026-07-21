/* ============================================================
   VENTURE. — Portal de clientes · lógica
   Gate por código → render de piezas → calendario ideal →
   copiar copies → descargar PNG en resolución real.
   ============================================================ */
(function () {
  "use strict";

  var CLIENTES = window.PORTAL_CLIENTES || {};
  var STORAGE_KEY = "venture_portal_codigo";

  var gate = document.getElementById("gate");
  var gateForm = document.getElementById("gateForm");
  var gateInput = document.getElementById("gateInput");
  var gateError = document.getElementById("gateError");
  var app = document.getElementById("app");
  var offscreen = document.getElementById("offscreen");

  var TIPO_LABEL = { post: "Post", historia: "Historia", reel: "Reel" };
  var MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio",
               "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  var DIAS_CORTOS = ["LU", "MA", "MI", "JU", "VI", "SA", "DO"];
  var DIAS_LARGOS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

  var clienteActual = null;
  var filtroActual = "todo";

  /* ---------- Utilidades ---------- */
  function normalizarCodigo(v) {
    return (v || "").trim().toUpperCase();
  }
  function parseFecha(iso) {
    var p = iso.split("-");
    return new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
  }
  function fechaLinda(iso, hora) {
    var d = parseFecha(iso);
    return DIAS_LARGOS[d.getDay()] + " " + d.getDate() + " · " + hora + " h";
  }
  function escaparHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  /* ---------- Gate ---------- */
  function intentarEntrar(codigo, silencioso) {
    var c = CLIENTES[codigo];
    if (c) {
      try { localStorage.setItem(STORAGE_KEY, codigo); } catch (e) { /* modo privado */ }
      clienteActual = c;
      montarApp();
      return true;
    }
    if (!silencioso) {
      gateError.hidden = false;
      gate.classList.remove("gate--error");
      void gate.offsetWidth; /* reinicia la animación */
      gate.classList.add("gate--error");
    }
    return false;
  }

  gateForm.addEventListener("submit", function (e) {
    e.preventDefault();
    intentarEntrar(normalizarCodigo(gateInput.value));
  });

  function salir() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* nada */ }
    var url = new URL(window.location.href);
    url.search = "";
    window.location.href = url.toString();
  }

  /* ---------- Montaje del portal ---------- */
  function montarApp() {
    var c = clienteActual;
    gate.hidden = true;
    app.hidden = false;
    app.className = c.tema || "";
    document.title = "Portal — " + c.nombre + " · VENTURE. UGC Studio";

    document.getElementById("appCliente").textContent = c.nombre + " · " + c.rubro;
    document.getElementById("appEntrega").textContent = c.entrega;
    document.getElementById("appEstado").textContent = c.estado;
    document.getElementById("appNota").textContent = c.nota || "";

    var conteos = { post: 0, historia: 0, reel: 0 };
    c.piezas.forEach(function (p) { conteos[p.tipo]++; });
    document.getElementById("appConteos").innerHTML =
      "<span><b>" + conteos.post + "</b> posts</span>" +
      "<span><b>" + conteos.historia + "</b> historias</span>" +
      "<span><b>" + conteos.reel + "</b> reels</span>" +
      "<span><b>" + c.piezas.length + "</b> piezas en total</span>";

    montarFiltros(conteos);
    renderPiezas();
    renderCalendario();
    document.getElementById("appSalir").addEventListener("click", salir);
  }

  function montarFiltros(conteos) {
    var cont = document.getElementById("appFiltros");
    var defs = [
      ["todo", "Todo", clienteActual.piezas.length],
      ["post", "Posts", conteos.post],
      ["historia", "Historias", conteos.historia],
      ["reel", "Reels", conteos.reel]
    ];
    cont.innerHTML = "";
    defs.forEach(function (d) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "p-filtro mono" + (d[0] === filtroActual ? " p-filtro--activo" : "");
      b.innerHTML = d[1] + ' <span class="p-filtro__n">' + d[2] + "</span>";
      b.addEventListener("click", function () {
        filtroActual = d[0];
        cont.querySelectorAll(".p-filtro").forEach(function (x) { x.classList.remove("p-filtro--activo"); });
        b.classList.add("p-filtro--activo");
        renderPiezas();
      });
      cont.appendChild(b);
    });
  }

  /* ---------- Piezas ---------- */
  function renderPiezas() {
    var grid = document.getElementById("appGrid");
    grid.innerHTML = "";
    clienteActual.piezas
      .filter(function (p) { return filtroActual === "todo" || p.tipo === filtroActual; })
      .forEach(function (p) { grid.appendChild(crearCard(p)); });
    ajustarLienzos();
  }

  function crearCard(p) {
    var card = document.createElement("article");
    card.className = "p-card";
    card.id = "pieza-" + p.id;

    var formato = p.w + "×" + p.h + (p.tipo === "reel" ? " · " + (p.duracion || "") : "");

    var guionHtml = "";
    if (p.tipo === "reel" && p.guion) {
      guionHtml =
        '<details class="p-card__guion"><summary class="mono">Guion del reel</summary>' +
        '<div class="p-card__guion-body">' +
        p.guion.map(function (b) {
          return '<div class="p-card__beat"><b class="mono">' + escaparHtml(b[0]) + "</b><p>" + escaparHtml(b[1]) + "</p></div>";
        }).join("") +
        "</div></details>";
    }

    card.innerHTML =
      '<div class="p-card__stage" style="aspect-ratio:' + p.w + "/" + p.h + '">' +
      '<div class="lienzo" data-w="' + p.w + '" data-h="' + p.h + '">' + p.html + "</div>" +
      "</div>" +
      '<div class="p-card__body">' +
      '<div class="p-card__fila">' +
      '<span class="p-badge p-badge--' + p.tipo + ' mono">' + TIPO_LABEL[p.tipo] + "</span>" +
      '<span class="p-card__formato mono">' + formato + "</span>" +
      "</div>" +
      '<h3 class="p-card__titulo">' + escaparHtml(p.titulo) + "</h3>" +
      '<div class="p-card__fecha mono">Publicar: ' + fechaLinda(p.fecha, p.hora) + "</div>" +
      '<div class="p-card__caption">' + escaparHtml(p.caption) + "</div>" +
      guionHtml +
      '<div class="p-card__acciones">' +
      '<button class="p-accion mono" type="button" data-accion="copiar">Copiar texto</button>' +
      '<button class="p-accion p-accion--principal mono" type="button" data-accion="descargar">Descargar PNG</button>' +
      "</div>" +
      "</div>";

    card.querySelector('[data-accion="copiar"]').addEventListener("click", function () {
      copiarTexto(p.caption, this);
    });
    card.querySelector('[data-accion="descargar"]').addEventListener("click", function () {
      descargarPieza(p, this);
    });
    return card;
  }

  /* ---------- Escalado de lienzos ---------- */
  function ajustarLienzos() {
    document.querySelectorAll("#app .lienzo").forEach(function (l) {
      var w = parseInt(l.dataset.w, 10) || 1080;
      var stage = l.parentElement;
      var s = stage.clientWidth / w;
      l.style.width = w + "px";
      l.style.height = (parseInt(l.dataset.h, 10) || 1080) + "px";
      l.style.transform = "scale(" + s + ")";
    });
  }
  window.addEventListener("resize", ajustarLienzos);
  window.addEventListener("load", ajustarLienzos);

  /* ---------- Copiar caption ---------- */
  function copiarTexto(texto, boton) {
    function ok() {
      var original = boton.textContent;
      boton.textContent = "Copiado ✓";
      boton.classList.add("p-accion--ok");
      setTimeout(function () {
        boton.textContent = original;
        boton.classList.remove("p-accion--ok");
      }, 1800);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(texto).then(ok, function () { copiarFallback(texto); ok(); });
    } else {
      copiarFallback(texto);
      ok();
    }
  }
  function copiarFallback(texto) {
    var ta = document.createElement("textarea");
    ta.value = texto;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch (e) { /* nada */ }
    document.body.removeChild(ta);
  }

  /* ---------- Descarga PNG en resolución real ---------- */
  function descargarPieza(p, boton) {
    if (typeof html2canvas !== "function") {
      window.alert("No se pudo cargar el generador de imágenes. Probá recargar la página.");
      return;
    }
    var original = boton.textContent;
    boton.textContent = "Generando…";
    boton.disabled = true;

    var marco = document.createElement("div");
    marco.style.position = "relative";
    marco.style.width = p.w + "px";
    marco.style.height = p.h + "px";
    marco.className = clienteActual.tema || "";
    marco.innerHTML = p.html;
    offscreen.appendChild(marco);

    /* Esperamos a que las fuentes estén listas para que el render sea fiel */
    var fuentesListas = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();
    fuentesListas.then(function () {
      return html2canvas(marco, {
        width: p.w,
        height: p.h,
        scale: 1,
        backgroundColor: null,
        useCORS: true,
        logging: false
      });
    }).then(function (canvas) {
      var a = document.createElement("a");
      a.download = clienteActual.nombre.toLowerCase() + "-" + p.id + "-" + p.w + "x" + p.h + ".png";
      a.href = canvas.toDataURL("image/png");
      a.click();
      boton.textContent = "Listo ✓";
      setTimeout(function () { boton.textContent = original; }, 1800);
    }).catch(function () {
      boton.textContent = "Error — reintentá";
      setTimeout(function () { boton.textContent = original; }, 2400);
    }).finally(function () {
      boton.disabled = false;
      offscreen.removeChild(marco);
    });
  }

  /* ---------- Calendario ideal ---------- */
  function renderCalendario() {
    var piezas = clienteActual.piezas.slice().sort(function (a, b) {
      return (a.fecha + a.hora).localeCompare(b.fecha + b.hora);
    });
    if (!piezas.length) return;

    var base = parseFecha(piezas[0].fecha);
    var anio = base.getFullYear();
    var mes = base.getMonth();

    var porDia = {};
    piezas.forEach(function (p) {
      var d = parseFecha(p.fecha);
      if (d.getFullYear() === anio && d.getMonth() === mes) {
        var dia = d.getDate();
        (porDia[dia] = porDia[dia] || []).push(p);
      }
    });

    var hoy = new Date();
    var esMesActual = hoy.getFullYear() === anio && hoy.getMonth() === mes;

    var primerDia = new Date(anio, mes, 1);
    var offset = (primerDia.getDay() + 6) % 7; /* semana arranca lunes */
    var diasEnMes = new Date(anio, mes + 1, 0).getDate();
    var celdas = Math.ceil((offset + diasEnMes) / 7) * 7;

    var cal = document.getElementById("appCal");
    var html = '<div class="cal__semana">';
    DIAS_CORTOS.forEach(function (d) {
      html += '<div class="cal__dia-nombre mono">' + d + "</div>";
    });
    html += '</div><div class="cal__grid">';

    for (var i = 0; i < celdas; i++) {
      var nDia = i - offset + 1;
      if (nDia < 1 || nDia > diasEnMes) {
        html += '<div class="cal__celda cal__celda--fuera"></div>';
        continue;
      }
      var esHoy = esMesActual && hoy.getDate() === nDia;
      html += '<div class="cal__celda' + (esHoy ? " cal__celda--hoy" : "") + '">';
      html += '<span class="cal__num mono">' + nDia + "</span>";
      (porDia[nDia] || []).forEach(function (p) {
        html += '<button type="button" class="cal__chip cal__chip--' + p.tipo + ' mono" data-pieza="' + p.id + '" title="' +
          escaparHtml(p.titulo) + " · " + p.hora + ' h">' + p.hora + " " + escaparHtml(p.titulo.split("·").pop().trim()) + "</button>";
      });
      html += "</div>";
    }
    html += "</div>";
    cal.innerHTML = html;

    /* Título del mes en el encabezado de la sección */
    var h2 = document.querySelector(".p-cal-head h2");
    if (h2) {
      h2.innerHTML = "Calendario ideal — <span class=\"accent\">" + MESES[mes] + " " + anio + "</span>.";
    }

    /* Lista mobile */
    var lista = document.getElementById("appCalLista");
    lista.innerHTML = piezas.map(function (p) {
      return '<button type="button" class="cal-lista__item" data-pieza="' + p.id + '">' +
        '<span class="cal-lista__fecha mono">' + fechaLinda(p.fecha, p.hora) + "</span>" +
        '<span class="cal-lista__titulo">' + escaparHtml(p.titulo) + "</span>" +
        '<span class="cal-lista__tipo mono">' + TIPO_LABEL[p.tipo] + "</span>" +
        "</button>";
    }).join("");

    /* Chip → scroll a la pieza */
    function irAPieza(id) {
      filtroActual = "todo";
      montarFiltros(contarTipos());
      renderPiezas();
      var card = document.getElementById("pieza-" + id);
      if (card) {
        card.scrollIntoView({ behavior: "smooth", block: "center" });
        card.classList.remove("p-card--flash");
        void card.offsetWidth;
        card.classList.add("p-card--flash");
      }
    }
    [cal, lista].forEach(function (cont) {
      cont.addEventListener("click", function (e) {
        var chip = e.target.closest("[data-pieza]");
        if (chip) irAPieza(chip.dataset.pieza);
      });
    });
  }

  function contarTipos() {
    var conteos = { post: 0, historia: 0, reel: 0 };
    clienteActual.piezas.forEach(function (p) { conteos[p.tipo]++; });
    return conteos;
  }

  /* ---------- Arranque ---------- */
  var params = new URLSearchParams(window.location.search);
  var codigoUrl = normalizarCodigo(params.get("codigo"));
  var codigoGuardado = "";
  try { codigoGuardado = normalizarCodigo(localStorage.getItem(STORAGE_KEY)); } catch (e) { /* nada */ }

  if (codigoUrl && intentarEntrar(codigoUrl, true)) {
    /* entró por link directo */
  } else if (codigoGuardado && intentarEntrar(codigoGuardado, true)) {
    /* sesión recordada */
  } else {
    gateInput.focus();
  }
})();
