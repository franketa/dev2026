/**
 * ESTUDIO CATA - Arquitectura & Diseño de Interiores
 * JavaScript Principal
 */

(function() {
    'use strict';

    // ==================== DOM Elements ====================
    const header = document.getElementById('header');
    const navToggle = document.getElementById('navToggle');
    const navMenu = document.getElementById('navMenu');
    const navLinks = document.querySelectorAll('.nav-link');
    const contactForm = document.getElementById('contactForm');
    const packageButtons = document.querySelectorAll('[data-package]');
    const packageSelect = document.getElementById('package');

    // ==================== Header Scroll Effect ====================
    function handleHeaderScroll() {
        const scrollY = window.scrollY;
        const scrollThreshold = 100;

        if (scrollY > scrollThreshold) {
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }
    }

    // ==================== Mobile Menu Toggle ====================
    function toggleMobileMenu() {
        navToggle.classList.toggle('active');
        navMenu.classList.toggle('active');
        document.body.style.overflow = navMenu.classList.contains('active') ? 'hidden' : '';
    }

    function closeMobileMenu() {
        navToggle.classList.remove('active');
        navMenu.classList.remove('active');
        document.body.style.overflow = '';
    }

    // ==================== Smooth Scroll for Navigation ====================
    function handleNavClick(e) {
        const href = this.getAttribute('href');

        if (href.startsWith('#')) {
            e.preventDefault();
            const targetId = href.substring(1);
            const targetElement = document.getElementById(targetId);

            if (targetElement) {
                const headerHeight = header.offsetHeight;
                const targetPosition = targetElement.offsetTop - headerHeight;

                window.scrollTo({
                    top: targetPosition,
                    behavior: 'smooth'
                });

                // Update active state
                navLinks.forEach(link => link.classList.remove('active'));
                this.classList.add('active');

                // Close mobile menu if open
                closeMobileMenu();
            }
        }
    }

    // ==================== Active Section Detection ====================
    function updateActiveNavLink() {
        const sections = document.querySelectorAll('section[id]');
        const scrollPosition = window.scrollY + header.offsetHeight + 100;

        sections.forEach(section => {
            const sectionTop = section.offsetTop;
            const sectionHeight = section.offsetHeight;
            const sectionId = section.getAttribute('id');

            if (scrollPosition >= sectionTop && scrollPosition < sectionTop + sectionHeight) {
                navLinks.forEach(link => {
                    link.classList.remove('active');
                    if (link.getAttribute('href') === `#${sectionId}`) {
                        link.classList.add('active');
                    }
                });
            }
        });
    }

    // ==================== Package Selection ====================
    function handlePackageSelection(e) {
        e.preventDefault();
        const packageName = this.getAttribute('data-package');

        // Scroll to contact section
        const contactSection = document.getElementById('contacto');
        const headerHeight = header.offsetHeight;

        window.scrollTo({
            top: contactSection.offsetTop - headerHeight,
            behavior: 'smooth'
        });

        // Set package in select dropdown
        setTimeout(() => {
            const packageMap = {
                'Consultoría Express': 'consultoria',
                'Diseño Integral': 'integral',
                'Proyecto Ejecutivo': 'ejecutivo',
                'Llave en Mano': 'llave-en-mano'
            };

            if (packageSelect && packageMap[packageName]) {
                packageSelect.value = packageMap[packageName];
                // Trigger change event for any listeners
                packageSelect.dispatchEvent(new Event('change'));
            }
        }, 800);
    }

    // ==================== Form Handling ====================
    function handleFormSubmit(e) {
        e.preventDefault();

        // Get form data
        const formData = new FormData(contactForm);
        const data = Object.fromEntries(formData.entries());

        // Validate form
        if (!validateForm(data)) {
            return;
        }

        // Build WhatsApp message
        const message = buildWhatsAppMessage(data);

        // Open WhatsApp with message
        const whatsappNumber = '5491112345678'; // Placeholder number
        const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;

        window.open(whatsappUrl, '_blank');

        // Show success message
        showFormMessage('¡Gracias! Te redirigimos a WhatsApp para continuar.', 'success');

        // Reset form
        contactForm.reset();
    }

    function validateForm(data) {
        const errors = [];

        if (!data.name || data.name.trim().length < 2) {
            errors.push('Por favor, ingresa tu nombre completo.');
        }

        if (!data.email || !isValidEmail(data.email)) {
            errors.push('Por favor, ingresa un correo electrónico válido.');
        }

        if (!data.message || data.message.trim().length < 10) {
            errors.push('Por favor, escribe un mensaje más detallado.');
        }

        if (errors.length > 0) {
            showFormMessage(errors.join(' '), 'error');
            return false;
        }

        return true;
    }

    function isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    function buildWhatsAppMessage(data) {
        let message = `¡Hola! Me contacto desde el sitio web.\n\n`;
        message += `*Nombre:* ${data.name}\n`;
        message += `*Email:* ${data.email}\n`;

        if (data.phone) {
            message += `*Teléfono:* ${data.phone}\n`;
        }

        if (data.package) {
            const packageNames = {
                'consultoria': 'Consultoría Express',
                'integral': 'Diseño Integral',
                'ejecutivo': 'Proyecto Ejecutivo',
                'llave-en-mano': 'Llave en Mano'
            };
            message += `*Paquete de interés:* ${packageNames[data.package] || data.package}\n`;
        }

        message += `\n*Mensaje:*\n${data.message}`;

        return message;
    }

    function showFormMessage(message, type) {
        // Remove existing messages
        const existingMessage = document.querySelector('.form-message');
        if (existingMessage) {
            existingMessage.remove();
        }

        // Create message element
        const messageEl = document.createElement('div');
        messageEl.className = `form-message form-message-${type}`;
        messageEl.textContent = message;

        // Add styles dynamically
        messageEl.style.cssText = `
            padding: 1rem;
            margin-bottom: 1rem;
            border-radius: 4px;
            font-size: 0.875rem;
            text-align: center;
            ${type === 'success'
                ? 'background-color: #d4edda; color: #155724; border: 1px solid #c3e6cb;'
                : 'background-color: #f8d7da; color: #721c24; border: 1px solid #f5c6cb;'}
        `;

        // Insert before form
        contactForm.insertAdjacentElement('beforebegin', messageEl);

        // Auto remove after 5 seconds
        setTimeout(() => {
            messageEl.remove();
        }, 5000);
    }

    // ==================== Scroll Animations ====================
    function initScrollAnimations() {
        const observerOptions = {
            root: null,
            rootMargin: '0px',
            threshold: 0.1
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('animate-fade-in-up');
                    observer.unobserve(entry.target);
                }
            });
        }, observerOptions);

        // Observe elements for animation
        const animateElements = document.querySelectorAll(
            '.service-card, .portfolio-item, .about-content, .contact-info, .contact-form'
        );

        animateElements.forEach(el => {
            el.style.opacity = '0';
            observer.observe(el);
        });
    }

    // ==================== Portfolio Hover Effect (Touch Devices) ====================
    function initPortfolioTouch() {
        const portfolioItems = document.querySelectorAll('.portfolio-item');

        portfolioItems.forEach(item => {
            item.addEventListener('touchstart', function() {
                // Remove active class from all items
                portfolioItems.forEach(i => i.classList.remove('touch-active'));
                // Add active class to touched item
                this.classList.add('touch-active');
            });
        });

        // Remove active class when touching outside
        document.addEventListener('touchstart', function(e) {
            if (!e.target.closest('.portfolio-item')) {
                portfolioItems.forEach(item => item.classList.remove('touch-active'));
            }
        });
    }

    // ==================== Keyboard Navigation ====================
    function initKeyboardNavigation() {
        document.addEventListener('keydown', function(e) {
            // Close mobile menu with Escape key
            if (e.key === 'Escape' && navMenu.classList.contains('active')) {
                closeMobileMenu();
            }
        });
    }

    // ==================== Close Menu on Outside Click ====================
    function initOutsideClick() {
        document.addEventListener('click', function(e) {
            if (navMenu.classList.contains('active') &&
                !navMenu.contains(e.target) &&
                !navToggle.contains(e.target)) {
                closeMobileMenu();
            }
        });
    }

    // ==================== Throttle Function ====================
    function throttle(func, limit) {
        let inThrottle;
        return function(...args) {
            if (!inThrottle) {
                func.apply(this, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        };
    }

    // ==================== Initialize ====================
    function init() {
        // Header scroll effect
        window.addEventListener('scroll', throttle(handleHeaderScroll, 10));
        handleHeaderScroll(); // Check initial state

        // Active section detection
        window.addEventListener('scroll', throttle(updateActiveNavLink, 100));

        // Mobile menu toggle
        if (navToggle) {
            navToggle.addEventListener('click', toggleMobileMenu);
        }

        // Navigation links
        navLinks.forEach(link => {
            link.addEventListener('click', handleNavClick);
        });

        // Footer navigation links
        document.querySelectorAll('.footer-nav a').forEach(link => {
            link.addEventListener('click', handleNavClick);
        });

        // Package selection buttons
        packageButtons.forEach(button => {
            button.addEventListener('click', handlePackageSelection);
        });

        // Form submission
        if (contactForm) {
            contactForm.addEventListener('submit', handleFormSubmit);
        }

        // Initialize animations
        initScrollAnimations();

        // Initialize touch support for portfolio
        initPortfolioTouch();

        // Initialize keyboard navigation
        initKeyboardNavigation();

        // Initialize outside click handler
        initOutsideClick();

        console.log('Estudio Cata - Sitio web inicializado correctamente');
    }

    // Run when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
