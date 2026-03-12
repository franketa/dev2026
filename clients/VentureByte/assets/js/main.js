/* ============================================================
   VentureByte — Main JavaScript
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  /* ----------------------------------------------------------
     1. Navbar Scroll Effect
     ---------------------------------------------------------- */
  const nav = document.querySelector('.nav');
  const SCROLL_THRESHOLD = 50;

  const handleNavScroll = () => {
    if (window.scrollY > SCROLL_THRESHOLD) {
      nav.classList.add('nav--scrolled');
    } else {
      nav.classList.remove('nav--scrolled');
    }
  };

  window.addEventListener('scroll', handleNavScroll, { passive: true });
  handleNavScroll();

  /* ----------------------------------------------------------
     2. Mobile Menu
     ---------------------------------------------------------- */
  const toggle = document.querySelector('.nav__toggle');
  const mobileMenu = document.querySelector('.mobile-menu');
  const mobileLinks = document.querySelectorAll('.mobile-menu__link');

  if (toggle && mobileMenu) {
    const openMenu = () => {
      toggle.classList.add('nav__toggle--active');
      mobileMenu.classList.add('mobile-menu--open');
      mobileMenu.setAttribute('aria-hidden', 'false');
      toggle.setAttribute('aria-expanded', 'true');
      document.body.classList.add('menu-open');
    };

    const closeMenu = () => {
      toggle.classList.remove('nav__toggle--active');
      mobileMenu.classList.remove('mobile-menu--open');
      mobileMenu.setAttribute('aria-hidden', 'true');
      toggle.setAttribute('aria-expanded', 'false');
      document.body.classList.remove('menu-open');
    };

    toggle.addEventListener('click', () => {
      const isOpen = mobileMenu.classList.contains('mobile-menu--open');
      isOpen ? closeMenu() : openMenu();
    });

    mobileLinks.forEach(link => {
      link.addEventListener('click', closeMenu);
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && mobileMenu.classList.contains('mobile-menu--open')) {
        closeMenu();
      }
    });
  }

  /* ----------------------------------------------------------
     3. Smooth Scroll (same-page anchors only)
     ---------------------------------------------------------- */
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', (e) => {
      const targetId = anchor.getAttribute('href');
      if (targetId === '#') return;

      const target = document.querySelector(targetId);
      if (!target) return;

      e.preventDefault();
      const navHeight = nav ? nav.offsetHeight : 0;
      const top = target.getBoundingClientRect().top + window.scrollY - navHeight;

      window.scrollTo({ top, behavior: 'smooth' });
    });
  });

  /* ----------------------------------------------------------
     4. Active Nav Link (index.html only)
     ---------------------------------------------------------- */
  const sections = document.querySelectorAll('section[id]');
  const navLinks = document.querySelectorAll('.nav__link[href^="#"]');

  if (sections.length > 0 && navLinks.length > 0) {
    const observerNav = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const id = entry.target.getAttribute('id');
            navLinks.forEach(link => {
              link.classList.toggle(
                'nav__link--active',
                link.getAttribute('href') === `#${id}`
              );
            });
          }
        });
      },
      { rootMargin: '-30% 0px -60% 0px' }
    );

    sections.forEach(section => observerNav.observe(section));
  }

  /* ----------------------------------------------------------
     5. Scroll Reveal
     ---------------------------------------------------------- */
  const revealElements = document.querySelectorAll('.reveal');

  if (revealElements.length > 0) {
    const observerReveal = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('reveal--visible');
            observerReveal.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    );

    revealElements.forEach(el => observerReveal.observe(el));
  }

  /* ----------------------------------------------------------
     6. Counter Animation
     ---------------------------------------------------------- */
  const statNumbers = document.querySelectorAll('.stat__number[data-target]');

  if (statNumbers.length > 0) {
    const animateCounter = (el) => {
      const target = parseInt(el.dataset.target, 10);
      const duration = 2000;
      const startTime = performance.now();

      const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

      const update = (currentTime) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easedProgress = easeOutCubic(progress);
        const current = Math.round(easedProgress * target);

        el.textContent = current >= 1000
          ? current.toLocaleString('es-AR')
          : current;

        if (target >= 1000) {
          el.textContent = current.toLocaleString('es-AR') + '+';
        } else {
          el.textContent = current + '+';
        }

        if (progress < 1) {
          requestAnimationFrame(update);
        }
      };

      requestAnimationFrame(update);
    };

    const observerCounter = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            animateCounter(entry.target);
            observerCounter.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.5 }
    );

    statNumbers.forEach(el => observerCounter.observe(el));
  }

  /* ----------------------------------------------------------
     7. Contact Form → WhatsApp
     ---------------------------------------------------------- */
  const form = document.getElementById('contactForm');

  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();

      // Clear previous errors
      form.querySelectorAll('.form-group--error').forEach(g => {
        g.classList.remove('form-group--error');
      });

      const nombre = form.querySelector('#nombre');
      const email = form.querySelector('#email');
      const empresa = form.querySelector('#empresa');
      const mensaje = form.querySelector('#mensaje');

      let valid = true;

      // Validate required fields
      if (!nombre.value.trim()) {
        nombre.closest('.form-group').classList.add('form-group--error');
        valid = false;
      }

      if (!email.value.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)) {
        email.closest('.form-group').classList.add('form-group--error');
        valid = false;
      }

      if (!mensaje.value.trim()) {
        mensaje.closest('.form-group').classList.add('form-group--error');
        valid = false;
      }

      if (!valid) return;

      // Build WhatsApp message
      const lines = [
        'Hola VentureByte!',
        `Nombre: ${nombre.value.trim()}`,
        `Email: ${email.value.trim()}`
      ];

      if (empresa && empresa.value.trim()) {
        lines.push(`Empresa: ${empresa.value.trim()}`);
      }

      lines.push(`Proyecto: ${mensaje.value.trim()}`);

      const whatsappUrl = `https://wa.me/5492346564757?text=${encodeURIComponent(lines.join('\n'))}`;
      window.open(whatsappUrl, '_blank');
    });

    // Clear error on input
    form.querySelectorAll('input, textarea').forEach(input => {
      input.addEventListener('input', () => {
        input.closest('.form-group').classList.remove('form-group--error');
      });
    });
  }

  /* ----------------------------------------------------------
     8. WhatsApp Float Tooltip
     ---------------------------------------------------------- */
  const tooltip = document.querySelector('.whatsapp-float__tooltip');

  if (tooltip && !sessionStorage.getItem('vb-wa-tooltip')) {
    setTimeout(() => {
      tooltip.classList.add('whatsapp-float__tooltip--visible');
      sessionStorage.setItem('vb-wa-tooltip', '1');

      setTimeout(() => {
        tooltip.classList.remove('whatsapp-float__tooltip--visible');
      }, 4000);
    }, 3000);
  }
});
