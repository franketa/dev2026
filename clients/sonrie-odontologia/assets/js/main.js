(function () {
  "use strict";

  var toggle = document.querySelector(".nav__toggle");
  var menu = document.querySelector(".nav__menu");
  var overlay = document.querySelector(".nav__overlay");

  function closeMenu() {
    menu.classList.remove("nav__menu--open");
    overlay.classList.remove("nav__overlay--visible");
    toggle.setAttribute("aria-expanded", "false");
  }

  function openMenu() {
    menu.classList.add("nav__menu--open");
    overlay.classList.add("nav__overlay--visible");
    toggle.setAttribute("aria-expanded", "true");
  }

  if (toggle && menu) {
    toggle.addEventListener("click", function () {
      var isOpen = menu.classList.contains("nav__menu--open");
      if (isOpen) { closeMenu(); } else { openMenu(); }
    });
  }

  if (overlay) {
    overlay.addEventListener("click", closeMenu);
  }

  document.querySelectorAll(".nav__link").forEach(function (link) {
    link.addEventListener("click", closeMenu);
  });

  var header = document.querySelector(".header");
  if (header) {
    window.addEventListener("scroll", function () {
      if (window.scrollY > 50) {
        header.classList.add("header--scrolled");
      } else {
        header.classList.remove("header--scrolled");
      }
    });
  }

  var animatedElements = document.querySelectorAll("[data-animate]");
  if (animatedElements.length > 0 && "IntersectionObserver" in window) {
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            var delay = entry.target.getAttribute("data-delay") || 0;
            setTimeout(function () {
              entry.target.classList.add("animated");
            }, parseInt(delay, 10));
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 }
    );
    animatedElements.forEach(function (el) { observer.observe(el); });
  }

  var form = document.getElementById("contactForm");
  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var nombre = document.getElementById("nombre").value.trim();
      var telefono = document.getElementById("telefono").value.trim();
      var consulta = document.getElementById("consulta").value.trim();
      var mensaje = "Hola! Soy " + nombre + ". Mi teléfono es " + telefono + ". Consulta: " + consulta;
      var url = "https://wa.me/5493515551234?text=" + encodeURIComponent(mensaje);
      window.open(url, "_blank");
    });
  }

  document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
    anchor.addEventListener("click", function (e) {
      var target = document.querySelector(this.getAttribute("href"));
      if (target) {
        e.preventDefault();
        var headerHeight = header ? header.offsetHeight : 0;
        var top = target.getBoundingClientRect().top + window.pageYOffset - headerHeight;
        window.scrollTo({ top: top, behavior: "smooth" });
      }
    });
  });
})();
