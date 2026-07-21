/* ============================================================
   VENTURE. — Portal de clientes · Datos de entregas
   ------------------------------------------------------------
   Cada cliente es una clave del objeto PORTAL_CLIENTES.
   Para sumar un cliente nuevo: copiá el bloque de TILIFE-DEMO,
   cambiá el código, el nombre y las piezas.

   Tipos de pieza: "post" (1080×1080 o 1080×1350),
                   "historia" (1080×1920),
                   "reel" (portada 1080×1920 + guion + video).

   El campo `html` es el arte de la pieza en un lienzo de
   `w`×`h` px (se escala solo y se descarga en esa resolución).
   ============================================================ */

window.PORTAL_CLIENTES = {

  "TILIFE-DEMO": {
    nombre: "TILIFE",
    rubro: "Distribuidora de suplementos deportivos",
    tema: "tema-tilife",
    entrega: "Agosto 2026",
    estado: "Lista para publicar",
    nota: "Lote completo: 7 posts, 4 historias y 2 reels. El calendario de abajo indica el día y la hora ideal de cada publicación. Cualquier ajuste, nos escribís y lo giramos en el día.",
    piezas: [

      /* ---------------- POSTS ---------------- */
      {
        id: "post-colageno",
        tipo: "post",
        w: 1080, h: 1080,
        titulo: "Ad · Colágeno Núcleo",
        fecha: "2026-08-03", hora: "19:00",
        caption: "Colágeno que se nota. Cuidá tu piel, tu pelo y tus articulaciones con Colágeno Núcleo. Sumalo a tu rutina y pedí el tuyo.\n\n#TILIFE #Colágeno #Bienestar #TeAyudaASerMejor",
        html:
          '<div class="tl-lienzo">' +
          '<div class="tl-prodcol"><div class="tl-prodtile"><span class="tl-prodtile__marca">TILIFE</span><div class="tl-prodtile__jar"><i></i></div><div class="tl-prodtile__nombre">COLÁGENO<br>NÚCLEO</div></div><div class="tl-prodcol__fade"></div></div>' +
          '<div class="tl-cont" style="width:640px">' +
          '<div><span class="tl-pk">Piel, pelo y articulaciones</span>' +
          '<h2 class="tl-ph" style="font-size:96px;margin-top:38px">Colágeno<br>que se<br><span class="tl-verde">nota.</span></h2></div>' +
          '<div style="margin-top:auto"><div class="tl-sub">Colágeno Núcleo · 300g</div>' +
          '<div class="tl-cta">Pedí el tuyo →</div></div>' +
          '</div>' +
          '<img class="tl-logo" src="assets/img/tilife-logo-white.png" alt="" style="position:absolute;right:70px;bottom:70px">' +
          '</div>'
      },
      {
        id: "post-motivacion-lunes",
        tipo: "post",
        w: 1080, h: 1080,
        titulo: "Motivación · Empezá hoy",
        fecha: "2026-08-05", hora: "18:30",
        caption: "No esperes el lunes, ni el 1° de mes, ni año nuevo. Empezá hoy. Tu versión más fuerte arranca con una sola decisión.\n\n#TILIFE #EmpezáHoy #FitLife #TeAyudaASerMejor",
        html:
          '<div class="tl-lienzo">' +
          '<div class="tl-cont">' +
          '<span class="tl-pk">Te ayuda a ser mejor</span>' +
          '<h2 class="tl-ph" style="font-size:116px;margin-top:auto">No esperes<br>el lunes.<br><span class="tl-verde">Empezá hoy.</span></h2>' +
          '<p class="tl-body" style="font-size:32px;max-width:800px;margin-top:40px">El mejor momento para arrancar fue ayer. El segundo mejor es ahora.</p>' +
          '<img class="tl-logo" src="assets/img/tilife-logo-white.png" alt="" style="margin-top:auto">' +
          '</div>' +
          '</div>'
      },
      {
        id: "post-magnesio",
        tipo: "post",
        w: 1080, h: 1080,
        titulo: "Ad · Magnesio Gold",
        fecha: "2026-08-07", hora: "19:00",
        caption: "Recuperá con magnesio. Magnesio Gold te ayuda con la energía, los músculos y el descanso. Sumalo hoy y comprá el tuyo.\n\n#TILIFE #Magnesio #Recuperación #NoAflojes",
        html:
          '<div class="tl-lienzo">' +
          '<div class="tl-prodcol"><div class="tl-prodtile"><span class="tl-prodtile__marca">TILIFE</span><div class="tl-prodtile__jar tl-prodtile__jar--caps"><i></i></div><div class="tl-prodtile__nombre">MAGNESIO<br>GOLD</div></div><div class="tl-prodcol__fade"></div></div>' +
          '<div class="tl-cont" style="width:640px">' +
          '<div><span class="tl-pk">Energía y descanso</span>' +
          '<h2 class="tl-ph" style="font-size:96px;margin-top:38px">Recuperá<br>con<br><span class="tl-verde">magnesio.</span></h2></div>' +
          '<div style="margin-top:auto"><div class="tl-sub">Magnesio Gold · 60 caps</div>' +
          '<div class="tl-cta">Comprá ahora →</div></div>' +
          '</div>' +
          '<img class="tl-logo" src="assets/img/tilife-logo-white.png" alt="" style="position:absolute;right:70px;bottom:70px">' +
          '</div>'
      },
      {
        id: "post-rival",
        tipo: "post",
        w: 1080, h: 1080,
        titulo: "Motivación · Tu único rival",
        fecha: "2026-08-10", hora: "18:30",
        caption: "No compitas con nadie. Tu único rival sos vos, el de ayer. Superá esa marca todos los días. Dale que podés.\n\n#TILIFE #TuÚnicoRivalSosVos #Disciplina #Mindset",
        html:
          '<div class="tl-lienzo tl-lienzo--radial">' +
          '<div class="tl-cont" style="align-items:center;justify-content:center;text-align:center">' +
          '<span class="tl-pk tl-pk--centro">Mentalidad TILIFE</span>' +
          '<h2 class="tl-ph" style="font-size:122px;margin-top:44px">Tu único<br>rival<br><span class="tl-verde">sos vos.</span></h2>' +
          '</div>' +
          '<img class="tl-logo" src="assets/img/tilife-logo-white.png" alt="" style="position:absolute;left:50%;transform:translateX(-50%);bottom:84px">' +
          '</div>'
      },
      {
        id: "post-onefit",
        tipo: "post",
        w: 1080, h: 1080,
        titulo: "Ad · Proteína One Fit",
        fecha: "2026-08-12", hora: "19:00",
        caption: "Sumá proteína ONE FIT, tu proteína de todos los días. Entrá y llevate la tuya.\n\n#TILIFE #ONEFIT #Proteína #TeAyudaASerMejor",
        html:
          '<div class="tl-lienzo">' +
          '<div class="tl-prodcol"><div class="tl-prodtile"><span class="tl-prodtile__marca">TILIFE</span><div class="tl-prodtile__jar"><i></i></div><div class="tl-prodtile__nombre">ONE FIT<br>PROTEIN</div></div><div class="tl-prodcol__fade"></div></div>' +
          '<div class="tl-cont" style="width:640px">' +
          '<div><span class="tl-pk">Tu proteína de todos los días</span>' +
          '<h2 class="tl-ph" style="font-size:96px;margin-top:38px">Sumá<br>proteína<br><span class="tl-verde">ONE FIT.</span></h2></div>' +
          '<div style="margin-top:auto"><div class="tl-sub">One Fit Protein · 1kg</div>' +
          '<div class="tl-cta">Comprala ahora →</div></div>' +
          '</div>' +
          '<img class="tl-logo" src="assets/img/tilife-logo-white.png" alt="" style="position:absolute;right:70px;bottom:70px">' +
          '</div>'
      },
      {
        id: "post-envio",
        tipo: "post",
        w: 1080, h: 1080,
        titulo: "Promo · Envío gratis",
        fecha: "2026-08-19", hora: "19:00",
        caption: "Envío gratis a todo el país en compras superiores a $125.000. Armá tu combo de suplementos originales y aprovechá.\n\n#TILIFE #EnvíoGratis #Suplementos #DaleQuePodés",
        html:
          '<div class="tl-lienzo tl-lienzo--verde">' +
          '<div class="tl-banda-skew"></div>' +
          '<div class="tl-cont" style="padding-right:300px">' +
          '<div><span class="tl-pk tl-pk--tinta">Solo por tiempo limitado</span>' +
          '<h2 class="tl-ph tl-ph--tinta" style="font-size:110px;margin-top:40px">Envío<br>gratis en<br>todo el país</h2>' +
          '<p class="tl-body tl-body--tinta" style="font-size:32px;font-weight:600;max-width:620px;margin-top:34px">En compras superiores a $125.000. Aprovechá y hacé rendir tu pedido.</p></div>' +
          '<div style="margin-top:auto"><div class="tl-cta tl-cta--oscura">Comprá ahora →</div>' +
          '<p class="tl-body tl-body--tinta" style="font-size:15px;opacity:.7;margin-top:16px">Sujeto al peso del producto.</p></div>' +
          '</div>' +
          '<img class="tl-logo tl-logo--tinta" src="assets/img/tilife-logo-white.png" alt="" style="position:absolute;right:80px;bottom:74px">' +
          '</div>'
      },
      {
        id: "post-no-afloja",
        tipo: "post",
        w: 1080, h: 1080,
        titulo: "Motivación · El que no afloja",
        fecha: "2026-08-21", hora: "18:30",
        caption: "La motivación arranca, la disciplina sostiene. El que no afloja, gana. Sumá un día más. No aflojes.\n\n#TILIFE #NoAflojes #Disciplina #FitMotivación",
        html:
          '<div class="tl-lienzo tl-lienzo--gris">' +
          '<div class="tl-banda-skew tl-banda-skew--derecha"></div>' +
          '<div class="tl-cont" style="padding-right:340px">' +
          '<span class="tl-pk">Disciplina &gt; motivación</span>' +
          '<h2 class="tl-ph" style="font-size:120px;margin-top:auto">El que<br>no afloja,<br><span class="tl-verde">gana.</span></h2>' +
          '<p class="tl-body" style="font-size:32px;max-width:600px;margin-top:38px">Cada día que entrenás sumás. No aflojes cuando más cuesta.</p>' +
          '<img class="tl-logo" src="assets/img/tilife-logo-white.png" alt="" style="margin-top:auto">' +
          '</div>' +
          '</div>'
      },

      /* ---------------- HISTORIAS ---------------- */
      {
        id: "hist-un-dia-mas",
        tipo: "historia",
        w: 1080, h: 1920,
        titulo: "Historia · Un día más",
        fecha: "2026-08-04", hora: "12:00",
        caption: "Un día más. No aflojes. Los resultados llegan cuando dejás de buscar excusas. Dale que podés.\n\n#TILIFE #NoAflojes #Disciplina",
        html:
          '<div class="tl-lienzo">' +
          '<div class="tl-marca-lateral"></div>' +
          '<div class="tl-segs"><span class="on"></span><span></span></div>' +
          '<div class="tl-cont tl-cont--historia">' +
          '<span class="tl-pk" style="font-size:26px">Mentalidad TILIFE</span>' +
          '<h2 class="tl-ph" style="font-size:170px;margin-top:auto">Un día<br>más.<br><span class="tl-verde">No aflojes.</span></h2>' +
          '<p class="tl-body" style="font-size:42px;max-width:760px;margin-top:56px">Los resultados no llegan el día que empezás. Llegan el día que no aflojás.</p>' +
          '<img class="tl-logo tl-logo--grande" src="assets/img/tilife-logo-white.png" alt="" style="margin-top:auto">' +
          '</div>' +
          '</div>'
      },
      {
        id: "hist-rival",
        tipo: "historia",
        w: 1080, h: 1920,
        titulo: "Historia · Tu único rival",
        fecha: "2026-08-11", hora: "12:00",
        caption: "Tu único rival sos vos. Superá al de ayer, todos los días. Entrená con todo.\n\n#TILIFE #TuÚnicoRivalSosVos #Mindset",
        html:
          '<div class="tl-lienzo tl-lienzo--radial">' +
          '<div class="tl-segs"><span></span><span class="on"></span></div>' +
          '<div class="tl-cont tl-cont--historia" style="align-items:center;text-align:center;justify-content:center">' +
          '<span class="tl-pk tl-pk--centro" style="font-size:26px">Te ayuda a ser mejor</span>' +
          '<h2 class="tl-ph" style="font-size:150px;margin-top:52px">Tu único<br>rival<br><span class="tl-verde">sos vos.</span></h2>' +
          '<p class="tl-body" style="font-size:42px;max-width:720px;margin-top:56px">Superá al de ayer. Todos los días.</p>' +
          '</div>' +
          '<img class="tl-logo tl-logo--grande" src="assets/img/tilife-logo-white.png" alt="" style="position:absolute;left:50%;transform:translateX(-50%);bottom:120px">' +
          '</div>'
      },
      {
        id: "hist-recetas",
        tipo: "historia",
        w: 1080, h: 1920,
        titulo: "Historia · Seguinos, recetas fit",
        fecha: "2026-08-08", hora: "11:00",
        caption: "Seguinos y llevate recetas fit, técnicas de entrenamiento y tips para mejorar tu estilo de vida. Todo lo que necesitás para ser mejor, en un solo lugar.\n\n#TILIFE #RecetasFit #EstiloDeVida #Seguinos",
        html:
          '<div class="tl-lienzo tl-lienzo--gris">' +
          '<div class="tl-banda-skew tl-banda-skew--derecha tl-banda-skew--historia"></div>' +
          '<div class="tl-segs"><span class="on"></span><span></span></div>' +
          '<div class="tl-cont tl-cont--historia" style="padding-right:340px">' +
          '<span class="tl-pk" style="font-size:26px">Seguinos</span>' +
          '<h2 class="tl-ph" style="font-size:132px;margin-top:44px">Recetas<br>fit que<br><span class="tl-verde">funcionan.</span></h2>' +
          '<div style="display:flex;flex-direction:column;gap:22px;margin-top:56px">' +
          '<span class="tl-chip">Recetas altas en proteína</span>' +
          '<span class="tl-chip">Técnicas de entrenamiento</span>' +
          '<span class="tl-chip">Tips de estilo de vida</span>' +
          '</div>' +
          '<div style="margin-top:auto"><div class="tl-cta" style="height:96px;font-size:30px">Seguí a @tilife ↗</div>' +
          '<img class="tl-logo tl-logo--grande" src="assets/img/tilife-logo-white.png" alt="" style="margin-top:44px"></div>' +
          '</div>' +
          '</div>'
      },
      {
        id: "hist-comunidad",
        tipo: "historia",
        w: 1080, h: 1920,
        titulo: "Historia · Sumate a la comunidad",
        fecha: "2026-08-17", hora: "12:00",
        caption: "Sumate a la comunidad TILIFE. Todas las semanas subimos recetas, técnicas y hábitos para que mejores tu estilo de vida. Seguinos y no te lo pierdas.\n\n#TILIFE #Comunidad #Seguinos #TeAyudaASerMejor",
        html:
          '<div class="tl-lienzo tl-lienzo--verde">' +
          '<div class="tl-banda-skew tl-banda-skew--izquierda tl-banda-skew--historia"></div>' +
          '<div class="tl-segs tl-segs--tinta"><span></span><span class="on"></span></div>' +
          '<div class="tl-cont tl-cont--historia">' +
          '<span class="tl-pk tl-pk--tinta" style="font-size:26px">No te lo pierdas</span>' +
          '<h2 class="tl-ph tl-ph--tinta" style="font-size:150px;margin-top:44px">Sumate<br>a la<br>comunidad.</h2>' +
          '<p class="tl-body tl-body--tinta" style="font-size:44px;font-weight:600;max-width:760px;margin-top:52px">Recetas, técnicas y hábitos para mejorar tu estilo de vida. Todas las semanas.</p>' +
          '<div style="margin-top:auto;display:flex;flex-direction:column;gap:40px">' +
          '<div class="tl-handle">@ tilife</div>' +
          '<div class="tl-cta tl-cta--oscura" style="height:96px;font-size:30px">Seguinos ahora ↗</div>' +
          '</div>' +
          '</div>' +
          '<img class="tl-logo tl-logo--tinta" src="assets/img/tilife-logo-white.png" alt="" style="position:absolute;right:90px;bottom:96px">' +
          '</div>'
      },

      /* ---------------- REELS ---------------- */
      {
        id: "reel-creatina",
        tipo: "reel",
        w: 1080, h: 1920,
        titulo: "Reel UGC · Creatina 30 días",
        fecha: "2026-08-06", hora: "20:00",
        duracion: "28 s",
        caption: "Probé la creatina TILIFE 30 días seguidos y esto fue lo que pasó. Si estás dudando, mirá el video hasta el final.\n\n#TILIFE #Creatina #UGC #Resultados #NoAflojes",
        guion: [
          ["HOOK · 0-3s", "“Tomé creatina TILIFE 30 días seguidos y les voy a ser sincero…” (cara a cámara, gym de fondo)"],
          ["DESARROLLO · 3-15s", "“Semana 1: nada raro. Semana 2: empecé a sacar una repetición más en todo. Semana 3: los básicos subieron 5 kilos.” (b-roll: scoop, shaker, serie de fuerza)"],
          ["PRUEBA · 15-22s", "“No es magia: es constancia más una creatina que es 100% original. La pedís y te llega a tu casa.” (primer plano del pote, sello original)"],
          ["CTA · 22-28s", "“Está el link en la bio de @tilife. Dale que podés.” (sonrisa, señala hacia abajo)"]
        ],
        html:
          '<div class="tl-lienzo tl-lienzo--reel">' +
          '<div class="tl-reel-rec">REC · 00:28</div>' +
          '<div class="tl-cont tl-cont--historia" style="justify-content:flex-end;padding-bottom:220px">' +
          '<span class="tl-pk" style="font-size:26px">Reel UGC</span>' +
          '<h2 class="tl-ph" style="font-size:126px;margin-top:36px">Probé la<br>creatina<br><span class="tl-verde">30 días.</span></h2>' +
          '<p class="tl-body" style="font-size:40px;max-width:720px;margin-top:48px">Y esto fue lo que pasó.</p>' +
          '</div>' +
          '<img class="tl-logo tl-logo--grande" src="assets/img/tilife-logo-white.png" alt="" style="position:absolute;left:88px;bottom:96px">' +
          '</div>'
      },
      {
        id: "reel-pancakes",
        tipo: "reel",
        w: 1080, h: 1920,
        titulo: "Reel receta · Pancakes de whey",
        fecha: "2026-08-15", hora: "11:00",
        duracion: "34 s",
        caption: "Pancakes con 30g de proteína en 3 pasos. Guardá este reel para el desayuno del finde.\n\n#TILIFE #RecetasFit #Whey #DesayunoFit #TeAyudaASerMejor",
        guion: [
          ["HOOK · 0-3s", "“Pancakes con 30 gramos de proteína, 3 ingredientes. Guardalo.” (plano cenital del plato terminado)"],
          ["PASO 1 · 3-12s", "“Un scoop de whey TILIFE, una banana, dos huevos. Licuá todo.” (manos + licuadora, texto en pantalla)"],
          ["PASO 2 · 12-22s", "“Sartén a fuego medio, tapalos un minuto por lado.” (timelapse del vuelta y vuelta)"],
          ["PASO 3 + CTA · 22-34s", "“Miel, frutas y listo. La whey está en @tilife con envío a todo el país. Guardá la receta y mandásela a tu compañero de gym.” (bite final)"]
        ],
        html:
          '<div class="tl-lienzo tl-lienzo--reel">' +
          '<div class="tl-reel-rec">REC · 00:34</div>' +
          '<div class="tl-cont tl-cont--historia" style="justify-content:flex-end;padding-bottom:220px">' +
          '<span class="tl-pk" style="font-size:26px">Receta fit</span>' +
          '<h2 class="tl-ph" style="font-size:126px;margin-top:36px">Pancakes<br>de whey en<br><span class="tl-verde">3 pasos.</span></h2>' +
          '<p class="tl-body" style="font-size:40px;max-width:720px;margin-top:48px">30g de proteína por porción.</p>' +
          '</div>' +
          '<img class="tl-logo tl-logo--grande" src="assets/img/tilife-logo-white.png" alt="" style="position:absolute;left:88px;bottom:96px">' +
          '</div>'
      }
    ]
  }
};
