/* VENTURE. — landing interactions */
(function () {
  "use strict";

  /* ---------- Menú mobile ---------- */
  var toggle = document.getElementById("navToggle");
  var links = document.getElementById("navLinks");
  if (toggle && links) {
    toggle.addEventListener("click", function () {
      var open = links.classList.toggle("nav__links--open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      toggle.setAttribute("aria-label", open ? "Cerrar menú" : "Abrir menú");
    });
    links.addEventListener("click", function (e) {
      if (e.target.closest("a")) {
        links.classList.remove("nav__links--open");
        toggle.setAttribute("aria-expanded", "false");
      }
    });
  }

  /* ---------- Escalado de lienzos 1080 ---------- */
  function fitLienzos() {
    document.querySelectorAll(".lienzo").forEach(function (l) {
      var w = parseInt(l.dataset.w, 10) || 1080;
      var h = parseInt(l.dataset.h, 10) || 1080;
      var stage = l.parentElement;
      var s = stage.clientWidth / w;
      l.style.width = w + "px";
      l.style.height = h + "px";
      l.style.transform = "scale(" + s + ")";
    });
  }
  window.addEventListener("resize", fitLienzos);
  window.addEventListener("load", fitLienzos);
  fitLienzos();

  /* ---------- Reveal on scroll ---------- */
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) {
            en.target.classList.add("reveal--visible");
            io.unobserve(en.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    document.querySelectorAll(".reveal").forEach(function (el) { io.observe(el); });
  } else {
    document.querySelectorAll(".reveal").forEach(function (el) {
      el.classList.add("reveal--visible");
    });
  }
})();
