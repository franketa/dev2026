/* ============================================
   TIENDA BOX — App JS
   ============================================ */

(function () {
    'use strict';

    // ---- Scroll Reveal ----
    const revealElements = document.querySelectorAll('.reveal');
    const revealObserver = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry, i) => {
                if (entry.isIntersecting) {
                    // Stagger siblings
                    const parent = entry.target.parentElement;
                    const siblings = parent.querySelectorAll('.reveal');
                    let delay = 0;
                    siblings.forEach((sib) => {
                        if (sib === entry.target) return;
                        if (sib.classList.contains('is-visible')) delay++;
                    });
                    entry.target.style.transitionDelay = delay * 80 + 'ms';
                    entry.target.classList.add('is-visible');
                    revealObserver.unobserve(entry.target);
                }
            });
        },
        { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
    );
    revealElements.forEach((el) => revealObserver.observe(el));

    // ---- Nav Scroll State ----
    const nav = document.getElementById('nav');
    let lastScroll = 0;

    function updateNav() {
        const scrollY = window.scrollY;
        nav.classList.toggle('is-scrolled', scrollY > 60);
        lastScroll = scrollY;
    }

    window.addEventListener('scroll', updateNav, { passive: true });
    updateNav();

    // ---- Mobile Menu ----
    const navToggle = document.getElementById('navToggle');
    const navLinks = document.getElementById('navLinks');

    navToggle.addEventListener('click', () => {
        const isOpen = navLinks.classList.toggle('is-open');
        navToggle.classList.toggle('is-active', isOpen);
        document.body.style.overflow = isOpen ? 'hidden' : '';
    });

    // Close menu on link click
    navLinks.querySelectorAll('a').forEach((link) => {
        link.addEventListener('click', () => {
            navLinks.classList.remove('is-open');
            navToggle.classList.remove('is-active');
            document.body.style.overflow = '';
        });
    });

    // ---- WhatsApp Float ----
    const waFloat = document.getElementById('whatsappFloat');

    function showWhatsApp() {
        if (window.scrollY > 300) {
            waFloat.classList.add('is-visible');
        }
    }

    window.addEventListener('scroll', showWhatsApp, { passive: true });
    // Show after a short delay even without scroll
    setTimeout(() => {
        waFloat.classList.add('is-visible');
    }, 2500);

    // ---- Smooth anchor scroll offset for fixed nav ----
    document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
        anchor.addEventListener('click', (e) => {
            const target = document.querySelector(anchor.getAttribute('href'));
            if (!target) return;
            e.preventDefault();
            const top = target.getBoundingClientRect().top + window.scrollY - 80;
            window.scrollTo({ top, behavior: 'smooth' });
        });
    });
})();