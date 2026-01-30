/**
 * María Laura Rizzo - Productora de Seguros
 * Main JavaScript
 */

(function() {
    'use strict';

    // ============================================
    // DOM Elements
    // ============================================
    const header = document.getElementById('header');
    const menuToggle = document.getElementById('menuToggle');
    const mainNav = document.getElementById('mainNav');
    const navLinks = document.querySelectorAll('.header__nav-link');
    const contactForm = document.getElementById('contactForm');
    const testimonialsCarousel = document.getElementById('testimonialsCarousel');
    const statNumbers = document.querySelectorAll('.stats__number[data-count]');
    const animatedElements = document.querySelectorAll('[data-animate]');

    // ============================================
    // Header Scroll Effect
    // ============================================
    function handleHeaderScroll() {
        const scrollY = window.scrollY;

        if (scrollY > 50) {
            header.classList.add('header--scrolled');
        } else {
            header.classList.remove('header--scrolled');
        }
    }

    // ============================================
    // Mobile Menu
    // ============================================
    function toggleMobileMenu() {
        const isOpen = menuToggle.getAttribute('aria-expanded') === 'true';

        menuToggle.setAttribute('aria-expanded', !isOpen);
        mainNav.classList.toggle('is-open', !isOpen);

        // Prevent body scroll when menu is open
        document.body.style.overflow = !isOpen ? 'hidden' : '';
    }

    function closeMobileMenu() {
        menuToggle.setAttribute('aria-expanded', 'false');
        mainNav.classList.remove('is-open');
        document.body.style.overflow = '';
    }

    // ============================================
    // Smooth Scroll
    // ============================================
    function handleNavClick(e) {
        const href = e.currentTarget.getAttribute('href');

        if (href.startsWith('#')) {
            e.preventDefault();

            const target = document.querySelector(href);
            if (target) {
                const headerHeight = header.offsetHeight;
                const targetPosition = target.getBoundingClientRect().top + window.scrollY - headerHeight;

                window.scrollTo({
                    top: targetPosition,
                    behavior: 'smooth'
                });

                // Close mobile menu if open
                closeMobileMenu();
            }
        }
    }

    // ============================================
    // Scroll Animations
    // ============================================
    function initScrollAnimations() {
        const observerOptions = {
            root: null,
            rootMargin: '0px 0px -100px 0px',
            threshold: 0.1
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const delay = entry.target.dataset.delay || 0;

                    setTimeout(() => {
                        entry.target.classList.add('is-visible');
                    }, parseInt(delay));

                    observer.unobserve(entry.target);
                }
            });
        }, observerOptions);

        animatedElements.forEach(el => {
            observer.observe(el);
        });
    }

    // ============================================
    // Stats Counter Animation
    // ============================================
    function animateCounter(element) {
        const target = parseInt(element.dataset.count);
        const duration = 2000;
        const step = target / (duration / 16);
        let current = 0;

        function updateCounter() {
            current += step;

            if (current < target) {
                element.textContent = Math.floor(current);
                requestAnimationFrame(updateCounter);
            } else {
                element.textContent = target;
            }
        }

        updateCounter();
    }

    function initStatsCounter() {
        const observerOptions = {
            root: null,
            rootMargin: '0px',
            threshold: 0.5
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    animateCounter(entry.target);
                    observer.unobserve(entry.target);
                }
            });
        }, observerOptions);

        statNumbers.forEach(el => {
            observer.observe(el);
        });
    }

    // ============================================
    // Testimonials Carousel
    // ============================================
    function initTestimonialsCarousel() {
        if (!testimonialsCarousel) return;

        const track = testimonialsCarousel.querySelector('.testimonials__track');
        const cards = track.querySelectorAll('.testimonial-card');
        const dotsContainer = document.getElementById('testimonialsDots');
        const prevBtn = testimonialsCarousel.querySelector('.testimonials__arrow--prev');
        const nextBtn = testimonialsCarousel.querySelector('.testimonials__arrow--next');

        let currentIndex = 0;
        let cardsPerView = 1;
        let autoplayInterval;

        // Create dots
        function createDots() {
            dotsContainer.innerHTML = '';
            const totalDots = Math.ceil(cards.length / cardsPerView);

            for (let i = 0; i < totalDots; i++) {
                const dot = document.createElement('button');
                dot.classList.add('testimonials__dot');
                dot.setAttribute('aria-label', `Ir al testimonio ${i + 1}`);

                if (i === 0) {
                    dot.classList.add('is-active');
                }

                dot.addEventListener('click', () => goToSlide(i));
                dotsContainer.appendChild(dot);
            }
        }

        // Update cards per view based on screen size
        function updateCardsPerView() {
            const width = window.innerWidth;

            if (width >= 1024) {
                cardsPerView = 3;
            } else if (width >= 768) {
                cardsPerView = 2;
            } else {
                cardsPerView = 1;
            }

            createDots();
            goToSlide(Math.min(currentIndex, Math.ceil(cards.length / cardsPerView) - 1));
        }

        // Go to specific slide
        function goToSlide(index) {
            const maxIndex = Math.ceil(cards.length / cardsPerView) - 1;
            currentIndex = Math.max(0, Math.min(index, maxIndex));

            const gap = parseInt(getComputedStyle(track).gap) || 0;
            const cardWidth = cards[0].offsetWidth + gap;
            const offset = currentIndex * cardsPerView * cardWidth;

            track.style.transform = `translateX(-${offset}px)`;

            // Update dots
            const dots = dotsContainer.querySelectorAll('.testimonials__dot');
            dots.forEach((dot, i) => {
                dot.classList.toggle('is-active', i === currentIndex);
            });
        }

        // Navigation
        function nextSlide() {
            const maxIndex = Math.ceil(cards.length / cardsPerView) - 1;
            goToSlide(currentIndex >= maxIndex ? 0 : currentIndex + 1);
        }

        function prevSlide() {
            const maxIndex = Math.ceil(cards.length / cardsPerView) - 1;
            goToSlide(currentIndex <= 0 ? maxIndex : currentIndex - 1);
        }

        // Autoplay
        function startAutoplay() {
            autoplayInterval = setInterval(nextSlide, 5000);
        }

        function stopAutoplay() {
            clearInterval(autoplayInterval);
        }

        // Event listeners
        prevBtn.addEventListener('click', () => {
            prevSlide();
            stopAutoplay();
            startAutoplay();
        });

        nextBtn.addEventListener('click', () => {
            nextSlide();
            stopAutoplay();
            startAutoplay();
        });

        testimonialsCarousel.addEventListener('mouseenter', stopAutoplay);
        testimonialsCarousel.addEventListener('mouseleave', startAutoplay);

        // Touch support
        let touchStartX = 0;
        let touchEndX = 0;

        track.addEventListener('touchstart', (e) => {
            touchStartX = e.touches[0].clientX;
            stopAutoplay();
        }, { passive: true });

        track.addEventListener('touchend', (e) => {
            touchEndX = e.changedTouches[0].clientX;
            const diff = touchStartX - touchEndX;

            if (Math.abs(diff) > 50) {
                if (diff > 0) {
                    nextSlide();
                } else {
                    prevSlide();
                }
            }

            startAutoplay();
        }, { passive: true });

        // Initialize
        window.addEventListener('resize', debounce(updateCardsPerView, 200));
        updateCardsPerView();
        startAutoplay();
    }

    // ============================================
    // Contact Form
    // ============================================
    function initContactForm() {
        if (!contactForm) return;

        contactForm.addEventListener('submit', function(e) {
            e.preventDefault();

            // Get form data
            const formData = new FormData(contactForm);
            const data = Object.fromEntries(formData.entries());

            // Simple validation
            if (!data.name || !data.email || !data.service || !data.message) {
                showFormMessage('Por favor, completá todos los campos obligatorios.', 'error');
                return;
            }

            // Email validation
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(data.email)) {
                showFormMessage('Por favor, ingresá un email válido.', 'error');
                return;
            }

            // Simulate form submission
            const submitBtn = contactForm.querySelector('button[type="submit"]');
            const originalText = submitBtn.innerHTML;

            submitBtn.disabled = true;
            submitBtn.innerHTML = `
                <span>Enviando...</span>
                <svg class="btn__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation: spin 1s linear infinite;">
                    <circle cx="12" cy="12" r="10" stroke-dasharray="60" stroke-dashoffset="20"/>
                </svg>
            `;

            // Simulate API call
            setTimeout(() => {
                submitBtn.disabled = false;
                submitBtn.innerHTML = originalText;

                showFormMessage('¡Gracias por tu mensaje! Te contactaré a la brevedad.', 'success');
                contactForm.reset();
            }, 1500);
        });

        // Input animations
        const inputs = contactForm.querySelectorAll('.form-input, .form-select, .form-textarea');

        inputs.forEach(input => {
            input.addEventListener('focus', function() {
                this.parentElement.classList.add('is-focused');
            });

            input.addEventListener('blur', function() {
                this.parentElement.classList.remove('is-focused');

                // Validate on blur
                if (this.value.trim()) {
                    this.parentElement.classList.add('is-filled');
                } else {
                    this.parentElement.classList.remove('is-filled');
                }
            });
        });
    }

    function showFormMessage(message, type) {
        // Remove existing message
        const existingMessage = contactForm.querySelector('.form-message');
        if (existingMessage) {
            existingMessage.remove();
        }

        // Create message element
        const messageEl = document.createElement('div');
        messageEl.className = `form-message form-message--${type}`;
        messageEl.style.cssText = `
            padding: 1rem;
            margin-bottom: 1rem;
            border-radius: 8px;
            font-size: 0.875rem;
            text-align: center;
            animation: fadeIn 0.3s ease;
            ${type === 'success'
                ? 'background: rgba(37, 211, 102, 0.1); color: #25D366; border: 1px solid rgba(37, 211, 102, 0.3);'
                : 'background: rgba(220, 53, 69, 0.1); color: #dc3545; border: 1px solid rgba(220, 53, 69, 0.3);'}
        `;
        messageEl.textContent = message;

        // Insert at the beginning of the form
        contactForm.insertBefore(messageEl, contactForm.firstChild);

        // Auto remove after 5 seconds
        setTimeout(() => {
            messageEl.style.animation = 'fadeOut 0.3s ease forwards';
            setTimeout(() => messageEl.remove(), 300);
        }, 5000);
    }

    // ============================================
    // Utility Functions
    // ============================================
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // ============================================
    // Active Nav Link on Scroll
    // ============================================
    function updateActiveNavLink() {
        const sections = document.querySelectorAll('section[id]');
        const scrollY = window.scrollY;

        sections.forEach(section => {
            const sectionHeight = section.offsetHeight;
            const sectionTop = section.offsetTop - 150;
            const sectionId = section.getAttribute('id');
            const navLink = document.querySelector(`.header__nav-link[href="#${sectionId}"]`);

            if (navLink) {
                if (scrollY >= sectionTop && scrollY < sectionTop + sectionHeight) {
                    navLinks.forEach(link => link.classList.remove('is-active'));
                    navLink.classList.add('is-active');
                }
            }
        });
    }

    // ============================================
    // Initialize
    // ============================================
    function init() {
        // Header scroll
        window.addEventListener('scroll', debounce(handleHeaderScroll, 10));
        handleHeaderScroll();

        // Mobile menu
        if (menuToggle) {
            menuToggle.addEventListener('click', toggleMobileMenu);
        }

        // Nav links
        navLinks.forEach(link => {
            link.addEventListener('click', handleNavClick);
        });

        // Close menu on outside click
        document.addEventListener('click', (e) => {
            if (mainNav.classList.contains('is-open') &&
                !mainNav.contains(e.target) &&
                !menuToggle.contains(e.target)) {
                closeMobileMenu();
            }
        });

        // Close menu on escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && mainNav.classList.contains('is-open')) {
                closeMobileMenu();
            }
        });

        // Scroll animations
        initScrollAnimations();

        // Stats counter
        initStatsCounter();

        // Testimonials carousel
        initTestimonialsCarousel();

        // Contact form
        initContactForm();

        // Active nav link on scroll
        window.addEventListener('scroll', debounce(updateActiveNavLink, 50));
    }

    // Run when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
