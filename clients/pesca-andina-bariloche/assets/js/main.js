// ─── Navegación ──────────────────────────────────────────────
const nav = document.querySelector('.nav');
const navToggle = document.getElementById('navToggle');
const navLinks = document.getElementById('navLinks');

const actualizarNav = () => {
  nav.classList.toggle('nav--solida', window.scrollY > 40);
};
window.addEventListener('scroll', actualizarNav, { passive: true });
actualizarNav();

navToggle.addEventListener('click', () => {
  const abierta = nav.classList.toggle('nav--abierta');
  navToggle.setAttribute('aria-expanded', abierta);
});
navLinks.addEventListener('click', (e) => {
  if (e.target.tagName === 'A') {
    nav.classList.remove('nav--abierta');
    navToggle.setAttribute('aria-expanded', 'false');
  }
});

// ─── Reveals con IntersectionObserver ────────────────────────
const observador = new IntersectionObserver((entradas) => {
  entradas.forEach((entrada) => {
    if (entrada.isIntersecting) {
      entrada.target.classList.add('visible');
      observador.unobserve(entrada.target);
    }
  });
}, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

document.querySelectorAll('.revela').forEach((el) => observador.observe(el));

// ─── Contadores de datos ─────────────────────────────────────
const animarContador = (el) => {
  const meta = parseInt(el.dataset.contador, 10);
  const duracion = 1400;
  const inicio = performance.now();
  const formato = new Intl.NumberFormat('es-AR');
  const paso = (ahora) => {
    const progreso = Math.min((ahora - inicio) / duracion, 1);
    const suavizado = 1 - Math.pow(1 - progreso, 3);
    el.textContent = formato.format(Math.round(meta * suavizado));
    if (progreso < 1) requestAnimationFrame(paso);
  };
  requestAnimationFrame(paso);
};

const obsContadores = new IntersectionObserver((entradas) => {
  entradas.forEach((entrada) => {
    if (entrada.isIntersecting) {
      animarContador(entrada.target);
      obsContadores.unobserve(entrada.target);
    }
  });
}, { threshold: 0.6 });

document.querySelectorAll('[data-contador]').forEach((el) => {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    el.textContent = new Intl.NumberFormat('es-AR').format(el.dataset.contador);
  } else {
    obsContadores.observe(el);
  }
});

// ─── Reels: reproducir / pausar ──────────────────────────────
const reels = document.querySelectorAll('[data-reel]');
reels.forEach((reel) => {
  const video = reel.querySelector('video');
  const boton = reel.querySelector('.reel__play');

  const alternar = () => {
    if (video.paused) {
      // pausar los demás
      reels.forEach((otro) => {
        const v = otro.querySelector('video');
        if (v !== video && !v.paused) {
          v.pause();
          otro.classList.remove('reel--reproduciendo');
        }
      });
      video.play();
      reel.classList.add('reel--reproduciendo');
    } else {
      video.pause();
      reel.classList.remove('reel--reproduciendo');
    }
  };

  boton.addEventListener('click', alternar);
  video.addEventListener('click', alternar);
  video.addEventListener('ended', () => reel.classList.remove('reel--reproduciendo'));
});

// ─── Galería: lightbox ───────────────────────────────────────
const lightbox = document.getElementById('lightbox');
const lightboxImg = lightbox.querySelector('img');
const lightboxCerrar = lightbox.querySelector('.lightbox__cerrar');

document.querySelectorAll('.galeria__item').forEach((item) => {
  item.addEventListener('click', () => {
    lightboxImg.src = item.dataset.full;
    lightboxImg.alt = item.querySelector('img').alt;
    lightbox.hidden = false;
    document.body.style.overflow = 'hidden';
    lightboxCerrar.focus();
  });
});

const cerrarLightbox = () => {
  lightbox.hidden = true;
  lightboxImg.src = '';
  document.body.style.overflow = '';
};
lightboxCerrar.addEventListener('click', cerrarLightbox);
lightbox.addEventListener('click', (e) => {
  if (e.target === lightbox) cerrarLightbox();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !lightbox.hidden) cerrarLightbox();
});

// ─── Línea de mosca: se dibuja con el scroll ─────────────────
// Una curva continua que serpentea entre las secciones, como la
// línea de un lanzamiento, y termina en el CTA final.
const flyLine = document.querySelector('.fly-line');
const flyPath = document.querySelector('.fly-line__path');
const movimientoReducido = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const construirLinea = () => {
  if (!flyLine || movimientoReducido || window.innerWidth <= 700) return;

  const altoDoc = document.documentElement.scrollHeight;
  const ancho = document.documentElement.clientWidth;
  flyLine.setAttribute('width', ancho);
  flyLine.setAttribute('height', altoDoc);
  flyLine.setAttribute('viewBox', `0 0 ${ancho} ${altoDoc}`);

  // Anclas: el inicio del contenido y cada sección, alternando lados
  const secciones = document.querySelectorAll('.seccion, .cierre');
  const puntos = [[ancho * 0.5, window.innerHeight * 0.96]];
  secciones.forEach((s, i) => {
    const y = s.offsetTop + s.offsetHeight * 0.45;
    const x = i % 2 === 0 ? ancho * 0.045 : ancho * 0.955;
    puntos.push([x, y]);
  });

  let d = `M ${puntos[0][0]} ${puntos[0][1]}`;
  for (let i = 1; i < puntos.length; i++) {
    const [x0, y0] = puntos[i - 1];
    const [x1, y1] = puntos[i];
    const cy = (y0 + y1) / 2;
    d += ` C ${x0} ${cy}, ${x1} ${cy}, ${x1} ${y1}`;
  }
  flyPath.setAttribute('d', d);

  const largo = flyPath.getTotalLength();
  flyPath.style.strokeDasharray = largo;
  flyPath.style.strokeDashoffset = largo;
};

const dibujarLinea = () => {
  if (!flyPath.getAttribute('d')) return;
  const largo = flyPath.getTotalLength();
  const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
  const progreso = maxScroll > 0 ? window.scrollY / maxScroll : 0;
  flyPath.style.strokeDashoffset = largo * (1 - Math.min(progreso * 1.15, 1));
};

let ticking = false;
window.addEventListener('scroll', () => {
  if (!ticking) {
    requestAnimationFrame(() => {
      dibujarLinea();
      ticking = false;
    });
    ticking = true;
  }
}, { passive: true });

window.addEventListener('resize', () => {
  construirLinea();
  dibujarLinea();
});
window.addEventListener('load', () => {
  construirLinea();
  dibujarLinea();
});
