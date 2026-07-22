/* VENTURE. — Admin de entregas y material */
(function () {
  "use strict";

  var TOKEN_KEY = "venture_admin_token";
  var token = null;
  try { token = localStorage.getItem(TOKEN_KEY); } catch (e) { /* nada */ }

  var $ = function (id) { return document.getElementById(id); };
  var vistaLogin = $("vistaLogin");
  var vistaPanel = $("vistaPanel");
  var clienteEnEdicion = null; // código cuando se edita
  var clienteMaterial = null;  // código del panel de material abierto

  /* ---------- API helper ---------- */
  function api(ruta, opciones) {
    opciones = opciones || {};
    opciones.headers = opciones.headers || {};
    if (token) opciones.headers.Authorization = "Bearer " + token;
    if (opciones.body && !(opciones.body instanceof FormData)) {
      opciones.headers["Content-Type"] = "application/json";
      opciones.body = JSON.stringify(opciones.body);
    }
    return fetch(ruta, opciones).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) {
        if (r.status === 401 && ruta.indexOf("/api/auth/login") === -1) { cerrarSesion(); }
        if (!r.ok) throw new Error(data.error || ("Error " + r.status));
        return data;
      });
    });
  }

  function formatoPeso(bytes) {
    if (!bytes) return "0 B";
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + " KB";
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MB";
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
  }
  function escapar(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  /* ---------- Sesión ---------- */
  function abrirPanel() {
    vistaLogin.hidden = true;
    vistaPanel.hidden = false;
    cargarClientes();
  }
  function cerrarSesion() {
    token = null;
    try { localStorage.removeItem(TOKEN_KEY); } catch (e) { /* nada */ }
    vistaPanel.hidden = true;
    vistaLogin.hidden = false;
  }

  $("formLogin").addEventListener("submit", function (e) {
    e.preventDefault();
    $("loginError").hidden = true;
    api("/api/auth/login", { method: "POST", body: { email: $("loginEmail").value, password: $("loginPass").value } })
      .then(function (data) {
        token = data.token;
        try { localStorage.setItem(TOKEN_KEY, token); } catch (err) { /* nada */ }
        abrirPanel();
      })
      .catch(function (err) {
        $("loginError").textContent = err.message;
        $("loginError").hidden = false;
      });
  });

  $("btnSalir").addEventListener("click", cerrarSesion);

  /* ---------- Contraseña ---------- */
  $("btnPassword").addEventListener("click", function () {
    $("secPassword").hidden = !$("secPassword").hidden;
  });
  $("formPassword").addEventListener("submit", function (e) {
    e.preventDefault();
    $("passError").hidden = true; $("passOk").hidden = true;
    api("/api/auth/change-password", { method: "POST", body: { actual: $("passActual").value, nueva: $("passNueva").value } })
      .then(function () {
        $("passOk").hidden = false;
        $("formPassword").reset();
      })
      .catch(function (err) {
        $("passError").textContent = err.message;
        $("passError").hidden = false;
      });
  });

  /* ---------- Clientes ---------- */
  function cargarClientes() {
    api("/api/clientes").then(function (data) {
      var cont = $("listaClientes");
      if (!data.clientes.length) {
        cont.innerHTML = '<p style="color:var(--texto-3);font-size:14px">Todavía no hay clientes.</p>';
        return;
      }
      cont.innerHTML = data.clientes.map(function (c) {
        return '<div class="adm-cliente' + (c.activo ? "" : " adm-cliente--inactivo") + '">' +
          '<div class="adm-cliente__fila">' +
          '<div><span class="adm-cliente__nombre">' + escapar(c.nombre) + '</span> ' +
          '<span class="adm-cliente__codigo mono">' + escapar(c.codigo) + "</span>" +
          '<div class="adm-cliente__meta mono">' + escapar(c.entrega || "sin entrega") + " · " + escapar(c.estado) +
          " · " + c.archivos + " archivos (" + formatoPeso(c.peso) + ")" + (c.activo ? "" : " · INACTIVO") + "</div></div>" +
          '<div class="adm-cliente__acciones">' +
          '<a class="adm-btn-sm" href="portal.html#' + encodeURIComponent(c.codigo) + '" target="_blank" rel="noopener">Portal ↗</a>' +
          '<button class="adm-btn-sm" data-accion="copiar-link" data-codigo="' + escapar(c.codigo) + '">Copiar link</button>' +
          '<button class="adm-btn-sm adm-btn-sm--lima" data-accion="material" data-codigo="' + escapar(c.codigo) + '">Material</button>' +
          '<button class="adm-btn-sm" data-accion="editar" data-codigo="' + escapar(c.codigo) + '">Editar</button>' +
          '<button class="adm-btn-sm adm-btn-sm--rojo" data-accion="borrar" data-codigo="' + escapar(c.codigo) + '">Borrar</button>' +
          "</div></div></div>";
      }).join("");
      cont.querySelectorAll("[data-accion]").forEach(function (b) {
        b.addEventListener("click", function (e) {
          var accion = b.dataset.accion;
          var codigo = b.dataset.codigo;
          if (accion === "material") abrirMaterial(codigo);
          if (accion === "editar") editarCliente(codigo, data.clientes);
          if (accion === "borrar") borrarCliente(codigo);
          if (accion === "copiar-link") {
            var link = window.location.origin + "/portal.html#" + codigo;
            (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject()).then(function () {
              b.textContent = "Copiado ✓";
              setTimeout(function () { b.textContent = "Copiar link"; }, 1600);
            }).catch(function () { window.prompt("Copiá el link:", link); });
          }
          if (accion === "copiar-link") e.preventDefault();
        });
      });
    }).catch(function () { /* sesión vencida ya manejada */ });
  }

  function editarCliente(codigo, clientes) {
    var c = clientes.find(function (x) { return x.codigo === codigo; });
    if (!c) return;
    clienteEnEdicion = codigo;
    $("formClienteTitulo").textContent = "Editar — " + c.nombre;
    $("btnGuardarCliente").textContent = "Guardar cambios";
    $("btnCancelarEdicion").hidden = false;
    $("cCodigo").value = c.codigo;
    $("cCodigo").disabled = true;
    $("cNombre").value = c.nombre;
    $("cRubro").value = c.rubro || "";
    $("cEntrega").value = c.entrega || "";
    $("cEstado").value = c.estado || "En producción";
    $("cTema").value = c.tema || "";
    $("cNota").value = c.nota || "";
    $("formCliente").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function resetFormCliente() {
    clienteEnEdicion = null;
    $("formCliente").reset();
    $("cCodigo").disabled = false;
    $("formClienteTitulo").textContent = "Nuevo cliente";
    $("btnGuardarCliente").textContent = "Crear cliente";
    $("btnCancelarEdicion").hidden = true;
    $("clienteError").hidden = true;
  }
  $("btnCancelarEdicion").addEventListener("click", resetFormCliente);

  $("formCliente").addEventListener("submit", function (e) {
    e.preventDefault();
    $("clienteError").hidden = true;
    var cuerpo = {
      codigo: $("cCodigo").value,
      nombre: $("cNombre").value,
      rubro: $("cRubro").value,
      entrega: $("cEntrega").value,
      estado: $("cEstado").value,
      tema: $("cTema").value,
      nota: $("cNota").value
    };
    var req = clienteEnEdicion
      ? api("/api/clientes/" + encodeURIComponent(clienteEnEdicion), { method: "PUT", body: cuerpo })
      : api("/api/clientes", { method: "POST", body: cuerpo });
    req.then(function () {
      resetFormCliente();
      cargarClientes();
    }).catch(function (err) {
      $("clienteError").textContent = err.message;
      $("clienteError").hidden = false;
    });
  });

  function borrarCliente(codigo) {
    if (!window.confirm("¿Borrar el cliente " + codigo + " y TODO su material? No se puede deshacer.")) return;
    api("/api/clientes/" + encodeURIComponent(codigo), { method: "DELETE" })
      .then(function () {
        if (clienteMaterial === codigo) cerrarMaterial();
        cargarClientes();
      })
      .catch(function (err) { window.alert(err.message); });
  }

  /* ---------- Material ---------- */
  function abrirMaterial(codigo) {
    clienteMaterial = codigo;
    $("secMaterial").hidden = false;
    $("matCliente").textContent = codigo;
    $("matError").hidden = true;
    cargarMaterial();
    $("secMaterial").scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function cerrarMaterial() {
    clienteMaterial = null;
    $("secMaterial").hidden = true;
  }
  $("btnCerrarMaterial").addEventListener("click", cerrarMaterial);

  function tipoDe(m) {
    if ((m.mime || "").indexOf("video/") === 0) return "VIDEO";
    if ((m.mime || "").indexOf("image/") === 0) return "IMG";
    if ((m.mime || "").indexOf("audio/") === 0) return "AUDIO";
    if ((m.mime || "").indexOf("zip") !== -1 || /\.(zip|rar|7z)$/i.test(m.original)) return "PACK";
    return "FILE";
  }

  function cargarMaterial() {
    if (!clienteMaterial) return;
    api("/api/clientes/" + encodeURIComponent(clienteMaterial) + "/material").then(function (data) {
      var cont = $("listaMaterial");
      if (!data.material.length) {
        cont.innerHTML = '<p style="color:var(--texto-3);font-size:14px">Sin archivos todavía.</p>';
        return;
      }
      cont.innerHTML = data.material.map(function (m) {
        return '<div class="adm-archivo">' +
          '<span class="adm-archivo__icono mono">' + tipoDe(m) + "</span>" +
          '<a class="adm-archivo__nombre" href="' + m.url + '" target="_blank" rel="noopener" style="color:var(--papel)">' + escapar(m.original) + "</a>" +
          '<span class="adm-archivo__peso mono">' + formatoPeso(m.size) + "</span>" +
          '<button class="adm-btn-sm adm-btn-sm--rojo" data-id="' + m.id + '">Borrar</button>' +
          "</div>";
      }).join("");
      cont.querySelectorAll("button[data-id]").forEach(function (b) {
        b.addEventListener("click", function () {
          api("/api/clientes/" + encodeURIComponent(clienteMaterial) + "/material/" + b.dataset.id, { method: "DELETE" })
            .then(function () { cargarMaterial(); cargarClientes(); })
            .catch(function (err) { window.alert(err.message); });
        });
      });
    });
  }

  /* Subida con progreso (XHR para tener onprogress) */
  function subirArchivos(archivos) {
    if (!clienteMaterial || !archivos.length) return;
    $("matError").hidden = true;
    var fd = new FormData();
    Array.prototype.forEach.call(archivos, function (f) { fd.append("archivos", f); });

    var xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/clientes/" + encodeURIComponent(clienteMaterial) + "/material");
    xhr.setRequestHeader("Authorization", "Bearer " + token);
    $("progreso").hidden = false;
    $("progresoBarra").style.width = "0%";
    xhr.upload.onprogress = function (e) {
      if (e.lengthComputable) {
        $("progresoBarra").style.width = Math.round((e.loaded / e.total) * 100) + "%";
      }
    };
    xhr.onload = function () {
      $("progreso").hidden = true;
      if (xhr.status >= 200 && xhr.status < 300) {
        cargarMaterial();
        cargarClientes();
      } else {
        var msg = "Error al subir";
        try { msg = JSON.parse(xhr.responseText).error || msg; } catch (e) { /* nada */ }
        $("matError").textContent = msg;
        $("matError").hidden = false;
      }
    };
    xhr.onerror = function () {
      $("progreso").hidden = true;
      $("matError").textContent = "Error de red al subir";
      $("matError").hidden = false;
    };
    xhr.send(fd);
  }

  var drop = $("dropZone");
  drop.addEventListener("click", function () { $("inputArchivos").click(); });
  $("inputArchivos").addEventListener("change", function () {
    subirArchivos(this.files);
    this.value = "";
  });
  ["dragenter", "dragover"].forEach(function (ev) {
    drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add("adm-drop--sobre"); });
  });
  ["dragleave", "drop"].forEach(function (ev) {
    drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove("adm-drop--sobre"); });
  });
  drop.addEventListener("drop", function (e) {
    if (e.dataTransfer && e.dataTransfer.files) subirArchivos(e.dataTransfer.files);
  });

  /* ---------- Arranque ---------- */
  if (token) {
    // validar token con una llamada
    api("/api/clientes").then(abrirPanel).catch(function () { cerrarSesion(); });
  }
})();
