/* ================================================
   IVAN ALANIZ ARQUITECTO - Main JS
   ================================================ */

document.addEventListener("DOMContentLoaded", () => {

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

  navToggle.addEventListener("click", () => {
    navToggle.classList.toggle("header__toggle--active");
    nav.classList.toggle("header__nav--open");
    document.body.style.overflow = nav.classList.contains("header__nav--open") ? "hidden" : "";
  });

  // Close mobile nav on link click
  nav.querySelectorAll(".header__link").forEach((link) => {
    link.addEventListener("click", () => {
      navToggle.classList.remove("header__toggle--active");
      nav.classList.remove("header__nav--open");
      document.body.style.overflow = "";
    });
  });

  /* ---- Portfolio filter ---- */
  const filterButtons = document.querySelectorAll(".portfolio__filter");
  const portfolioItems = document.querySelectorAll(".portfolio__item");

  filterButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const filter = btn.dataset.filter;

      // Update active button
      filterButtons.forEach((b) => b.classList.remove("portfolio__filter--active"));
      btn.classList.add("portfolio__filter--active");

      // Filter items
      portfolioItems.forEach((item) => {
        if (filter === "todos" || item.dataset.category === filter) {
          item.classList.remove("portfolio__item--hidden");
        } else {
          item.classList.add("portfolio__item--hidden");
        }
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
    // Fallback: show everything
    revealElements.forEach((el) => el.classList.add("reveal--visible"));
  }

  /* ---- Smooth scroll for anchor links ---- */
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener("click", (e) => {
      const targetId = anchor.getAttribute("href");
      if (targetId === "#") return;

      const target = document.querySelector(targetId);
      if (target) {
        e.preventDefault();
        const headerHeight = header.offsetHeight;
        const targetPosition = target.getBoundingClientRect().top + window.scrollY - headerHeight - 20;

        window.scrollTo({
          top: targetPosition,
          behavior: "smooth",
        });
      }
    });
  });

  /* ---- Contact form ---- */
  const contactForm = document.getElementById("contactForm");

  if (contactForm) {
    contactForm.addEventListener("submit", (e) => {
      e.preventDefault();

      const formData = new FormData(contactForm);
      const data = Object.fromEntries(formData);

      // Build WhatsApp message
      let message = "Hola Iván, me contacto desde tu web.\n\n";
      message += "Nombre: " + (data.nombre || "") + "\n";
      message += "Email: " + (data.email || "") + "\n";
      if (data.telefono) message += "Tel: " + data.telefono + "\n";
      if (data.tipo) message += "Tipo de proyecto: " + data.tipo + "\n";
      if (data.presupuesto) message += "Presupuesto: " + data.presupuesto + "\n";
      if (data.descripcion) message += "Descripcion: " + data.descripcion + "\n";

      const whatsappUrl = "https://wa.me/5491155667788?text=" + encodeURIComponent(message);
      window.open(whatsappUrl, "_blank");
    });
  }

});
