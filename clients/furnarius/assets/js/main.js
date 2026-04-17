/* ================================================
   FURNARIUS DESARROLLADORA · Main JS
   ================================================ */

(function () {
  "use strict";

  /* ----- Config: WhatsApp number (placeholder) -----
     Reemplazar este valor cuando el cliente confirme su número real.
     Buscar también "5492346555000" en index.html. */
  const WHATSAPP_NUMBER = "5492346555000";

  document.addEventListener("DOMContentLoaded", function () {

    /* ---- Header scroll ---- */
    const header = document.getElementById("header");

    const onScroll = () => {
      if (window.scrollY > 60) {
        header.classList.add("header--scrolled");
      } else {
        header.classList.remove("header--scrolled");
      }
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    /* ---- Mobile nav toggle ---- */
    const navToggle = document.getElementById("navToggle");
    const nav = document.getElementById("nav");

    const closeNav = () => {
      navToggle.classList.remove("header__toggle--active");
      nav.classList.remove("header__nav--open");
      navToggle.setAttribute("aria-expanded", "false");
      document.body.style.overflow = "";
    };

    navToggle.addEventListener("click", () => {
      const isOpen = nav.classList.toggle("header__nav--open");
      navToggle.classList.toggle("header__toggle--active", isOpen);
      navToggle.setAttribute("aria-expanded", String(isOpen));
      document.body.style.overflow = isOpen ? "hidden" : "";
    });

    // Close on link click (mobile)
    nav.querySelectorAll(".header__link").forEach((link) => {
      link.addEventListener("click", closeNav);
    });

    // Close on Escape
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && nav.classList.contains("header__nav--open")) {
        closeNav();
      }
    });

    /* ---- Obras filter ---- */
    const filterButtons = document.querySelectorAll(".obras__filter");
    const obrasItems = document.querySelectorAll(".obras__item");

    filterButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const filter = btn.dataset.filter;

        filterButtons.forEach((b) => b.classList.remove("obras__filter--active"));
        btn.classList.add("obras__filter--active");

        obrasItems.forEach((item) => {
          const match = filter === "todos" || item.dataset.category === filter;
          item.classList.toggle("obras__item--hidden", !match);
        });
      });
    });

    /* ---- Scroll reveal (IntersectionObserver) ---- */
    const revealElements = document.querySelectorAll(".reveal");

    if ("IntersectionObserver" in window) {
      const revealObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add("reveal--visible");
              revealObserver.unobserve(entry.target);
            }
          });
        },
        {
          threshold: 0.12,
          rootMargin: "0px 0px -40px 0px",
        }
      );

      revealElements.forEach((el) => revealObserver.observe(el));
    } else {
      revealElements.forEach((el) => el.classList.add("reveal--visible"));
    }

    /* ---- Smooth scroll for anchor links ---- */
    document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
      anchor.addEventListener("click", (e) => {
        const targetId = anchor.getAttribute("href");
        if (targetId === "#" || targetId.length < 2) return;

        const target = document.querySelector(targetId);
        if (!target) return;

        e.preventDefault();
        const headerHeight = header.offsetHeight;
        const targetPosition =
          target.getBoundingClientRect().top + window.scrollY - headerHeight - 20;

        window.scrollTo({ top: targetPosition, behavior: "smooth" });
      });
    });

    /* ---- Contact form → WhatsApp ---- */
    const contactForm = document.getElementById("contactForm");

    if (contactForm) {
      contactForm.addEventListener("submit", (e) => {
        e.preventDefault();

        const data = Object.fromEntries(new FormData(contactForm));

        const lines = [
          "Hola, me contacto desde la web de Furnarius.",
          "",
          "Nombre: " + (data.nombre || ""),
          "Email: " + (data.email || ""),
        ];

        if (data.telefono)     lines.push("Teléfono: " + data.telefono);
        if (data.tipo)         lines.push("Tipo de proyecto: " + data.tipo);
        if (data.presupuesto)  lines.push("Presupuesto: " + data.presupuesto);
        if (data.descripcion)  lines.push("", "Descripción:", data.descripcion);

        const message = lines.join("\n");
        const url = "https://wa.me/" + WHATSAPP_NUMBER + "?text=" + encodeURIComponent(message);
        window.open(url, "_blank", "noopener");
      });
    }

    /* ---- Dynamic year in footer copy (future-proof) ---- */
    const footerCopy = document.querySelector(".footer__copy");
    if (footerCopy) {
      const year = new Date().getFullYear();
      footerCopy.textContent = footerCopy.textContent.replace(/\b(20\d{2})\b/, year);
    }

  });
})();
