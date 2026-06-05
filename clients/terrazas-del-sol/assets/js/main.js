// Terrazas del Sol — Main JS
(function() {
  'use strict';

  const WA = '5492614557890';

  // --- Nav ---
  const nav = document.getElementById('nav');
  window.addEventListener('scroll', () => nav.classList.toggle('nav--scrolled', window.scrollY > 60));

  const toggle = document.getElementById('navToggle');
  const menu = document.getElementById('navMenu');
  toggle.addEventListener('click', () => menu.classList.toggle('nav__menu--open'));
  menu.querySelectorAll('.nav__link').forEach(l => l.addEventListener('click', () => menu.classList.remove('nav__menu--open')));

  // --- Smooth scroll ---
  document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
      const t = document.querySelector(a.getAttribute('href'));
      if (t) { e.preventDefault(); t.scrollIntoView({ behavior: 'smooth' }); }
    });
  });

  // --- Booking form → WhatsApp ---
  document.getElementById('bookingBtn').addEventListener('click', () => {
    const checkIn = document.getElementById('checkIn').value;
    const checkOut = document.getElementById('checkOut').value;
    const huespedes = document.getElementById('huespedes').value;
    if (!checkIn || !checkOut) {
      alert('Por favor seleccioná las fechas de check-in y check-out.');
      return;
    }
    const texto = encodeURIComponent(
      'Hola, quiero consultar disponibilidad del ' + checkIn + ' al ' + checkOut + ' para ' + huespedes + ' personas. Tienen disponibilidad?'
    );
    window.open('https://wa.me/' + WA + '?text=' + texto, '_blank');
  });

  // --- Room CTA → WhatsApp ---
  document.querySelectorAll('.room-cta').forEach(btn => {
    btn.addEventListener('click', e => {
      e.preventDefault();
      const room = btn.dataset.room;
      const checkIn = document.getElementById('checkIn').value || '[fecha]';
      const checkOut = document.getElementById('checkOut').value || '[fecha]';
      const huespedes = document.getElementById('huespedes').value || '2';
      const texto = encodeURIComponent(
        'Hola, quiero reservar la habitacion ' + room + ' del ' + checkIn + ' al ' + checkOut + ' para ' + huespedes + ' personas. Hay disponibilidad?'
      );
      window.open('https://wa.me/' + WA + '?text=' + texto, '_blank');
    });
  });

  // --- Parallax hero ---
  const heroBg = document.querySelector('.hero__bg');
  if (heroBg) {
    window.addEventListener('scroll', () => {
      if (window.scrollY < window.innerHeight) {
        heroBg.style.transform = 'translateY(' + (window.scrollY * 0.3) + 'px)';
      }
    });
  }

  // --- Scroll reveal ---
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('reveal--visible'); obs.unobserve(e.target); }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
  document.querySelectorAll('.reveal').forEach((el, i) => {
    el.style.transitionDelay = (i % 4) * 0.1 + 's';
    obs.observe(el);
  });

  // --- Set min date on booking inputs ---
  const today = new Date().toISOString().split('T')[0];
  const checkInEl = document.getElementById('checkIn');
  const checkOutEl = document.getElementById('checkOut');
  if (checkInEl) checkInEl.min = today;
  if (checkOutEl) checkOutEl.min = today;
  checkInEl.addEventListener('change', () => {
    checkOutEl.min = checkInEl.value;
    if (checkOutEl.value && checkOutEl.value <= checkInEl.value) checkOutEl.value = '';
  });
})();
