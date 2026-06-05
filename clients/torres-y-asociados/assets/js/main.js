(function () {
  "use strict";

  function initMobileNav() {
    var toggle = document.querySelector(".header__toggle");
    var mobileNav = document.querySelector(".mobile-nav");
    var links = document.querySelectorAll(".mobile-nav__link");
    if (!toggle || !mobileNav) return;
    toggle.addEventListener("click", function () {
      toggle.classList.toggle("header__toggle--active");
      mobileNav.classList.toggle("mobile-nav--open");
      document.body.style.overflow = mobileNav.classList.contains("mobile-nav--open") ? "hidden" : "";
    });
    links.forEach(function (link) {
      link.addEventListener("click", function () {
        toggle.classList.remove("header__toggle--active");
        mobileNav.classList.remove("mobile-nav--open");
        document.body.style.overflow = "";
      });
    });
  }

  function initHeaderScroll() {
    var header = document.querySelector(".header");
    if (!header) return;
    var onScroll = function () {
      if (window.scrollY > 50) {
        header.classList.add("header--scrolled");
      } else {
        header.classList.remove("header--scrolled");
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(function (a) {
      a.addEventListener("click", function (e) {
        var id = this.getAttribute("href");
        if (id.length < 2) return;
        var target = document.querySelector(id);
        if (target) {
          e.preventDefault();
          target.scrollIntoView({ behavior: "smooth" });
        }
      });
    });
  }

  function initAnimations() {
    var els = document.querySelectorAll("[data-animate]");
    if (!els.length) return;
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          var delay = parseInt(entry.target.dataset.delay || "0", 10);
          setTimeout(function () {
            entry.target.classList.add("is-visible");
          }, delay);
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: "0px 0px -40px 0px" });
    els.forEach(function (el) { observer.observe(el); });
  }

  function initFAQ() {
    var items = document.querySelectorAll(".faq__item");
    items.forEach(function (item) {
      item.addEventListener("toggle", function () {
        if (this.open) {
          items.forEach(function (other) {
            if (other !== item) other.removeAttribute("open");
          });
        }
      });
    });
  }

  function initContactForm() {
    var form = document.getElementById("contact-form");
    if (!form) return;
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var nombre = form.querySelector("#nombre").value.trim();
      var telefono = form.querySelector("#telefono").value.trim();
      var area = form.querySelector("#area-legal").value;
      var mensaje = form.querySelector("#descripcion").value.trim();
      if (!nombre || !telefono) {
        alert("Por favor, complet� tu nombre y tel�fono.");
        return;
      }
      var text = "Hola, soy " + nombre + ".";
      if (area) text += " Necesito asesoramiento en " + area + ".";
      if (mensaje) text += " " + mensaje;
      text += " Mi tel�fono es " + telefono + ".";
      var url = "https://wa.me/5492215554321?text=" + encodeURIComponent(text);
      window.open(url, "_blank");
    });
  }

  function initActiveNav() {
    var sections = document.querySelectorAll("section[id]");
    var navLinks = document.querySelectorAll(".header__nav-link");
    if (!sections.length || !navLinks.length) return;
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          var id = entry.target.getAttribute("id");
          navLinks.forEach(function (link) {
            link.classList.remove("header__nav-link--active");
            if (link.getAttribute("href") === "#" + id) {
              link.classList.add("header__nav-link--active");
            }
          });
        }
      });
    }, { threshold: 0.3, rootMargin: "-80px 0px 0px 0px" });
    sections.forEach(function (s) { observer.observe(s); });
  }

  document.addEventListener("DOMContentLoaded", function () {
    initMobileNav();
    initHeaderScroll();
    initSmoothScroll();
    initAnimations();
    initFAQ();
    initContactForm();
    initActiveNav();
  });
})();
