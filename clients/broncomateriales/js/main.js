/**
 * Bronco Materiales - JavaScript Principal
 * Distribuidora Mayorista de Materiales de Construcción
 *
 * Funcionalidades:
 * - Header scroll effect
 * - Mobile menu toggle
 * - Smooth scroll navigation
 * - Scroll reveal animations
 * - WhatsApp floating button interactions
 */

'use strict';

// ===================================
// DOM Elements
// ===================================
const header = document.getElementById('header');
const nav = document.getElementById('nav');
const menuToggle = document.getElementById('menuToggle');
const navLinks = document.querySelectorAll('.header__nav-link');
const whatsappFloat = document.querySelector('.whatsapp-float');

// ===================================
// Configuration
// ===================================
const CONFIG = {
    scrollThreshold: 50,
    revealOffset: 100,
    animationDelay: 100,
    whatsappNumber: '5492346515265',
    defaultMessage: 'Hola, quiero consultar por materiales'
};

// ===================================
// Header Scroll Effect
// ===================================
function handleHeaderScroll() {
    if (window.scrollY > CONFIG.scrollThreshold) {
        header.classList.add('header--scrolled');
    } else {
        header.classList.remove('header--scrolled');
    }
}

// ===================================
// Mobile Menu
// ===================================
function toggleMobileMenu() {
    nav.classList.toggle('active');
    menuToggle.classList.toggle('active');
    header.classList.toggle('menu-open');
    document.body.style.overflow = nav.classList.contains('active') ? 'hidden' : '';
}

function closeMobileMenu() {
    nav.classList.remove('active');
    menuToggle.classList.remove('active');
    header.classList.remove('menu-open');
    document.body.style.overflow = '';
}

// ===================================
// Smooth Scroll Navigation
// ===================================
function smoothScrollToSection(e) {
    const href = e.currentTarget.getAttribute('href');

    // Close mobile menu for any navigation link click
    if (nav.classList.contains('active')) {
        closeMobileMenu();
    }

    // Only handle internal anchor links
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

            // Update URL without triggering scroll
            history.pushState(null, '', href);
        }
    }
    // External links (like index.html#section) will navigate normally
}

// ===================================
// Scroll Reveal Animation
// ===================================
function initScrollReveal() {
    // Add reveal class to elements that should animate
    const revealElements = document.querySelectorAll(
        '.product-card, .value__list-item, .contact__method, .hero__stat'
    );

    revealElements.forEach((el, index) => {
        el.classList.add('reveal');
        el.style.transitionDelay = `${index * CONFIG.animationDelay}ms`;
    });

    // Create Intersection Observer
    const observerOptions = {
        root: null,
        rootMargin: '0px',
        threshold: 0.1
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                // Optional: Stop observing after revealing
                // observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    // Observe all reveal elements
    revealElements.forEach(el => observer.observe(el));

    // Also observe section headers
    const sectionHeaders = document.querySelectorAll(
        '.products__header, .value__content, .contact__info'
    );

    sectionHeaders.forEach(el => {
        el.classList.add('reveal');
        observer.observe(el);
    });
}

// ===================================
// Active Navigation Link
// ===================================
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

// ===================================
// WhatsApp Float Interaction
// ===================================
function initWhatsAppFloat() {
    if (!whatsappFloat) return;

    // Show tooltip after 3 seconds on first visit
    const hasVisited = sessionStorage.getItem('bronco_visited');

    if (!hasVisited) {
        setTimeout(() => {
            whatsappFloat.classList.add('show-tooltip');
            sessionStorage.setItem('bronco_visited', 'true');

            // Hide tooltip after 5 seconds
            setTimeout(() => {
                whatsappFloat.classList.remove('show-tooltip');
            }, 5000);
        }, 3000);
    }

    // Track clicks for analytics (if needed)
    whatsappFloat.addEventListener('click', () => {
        // You can add analytics tracking here
        console.log('WhatsApp button clicked');
    });
}

// ===================================
// Lazy Loading Images
// ===================================
function initLazyLoading() {
    const images = document.querySelectorAll('img[loading="lazy"]');

    if ('IntersectionObserver' in window) {
        const imageObserver = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    img.classList.add('loaded');
                    imageObserver.unobserve(img);
                }
            });
        });

        images.forEach(img => imageObserver.observe(img));
    }
}

// ===================================
// Form Enhancement (if forms are added later)
// ===================================
function formatPhoneNumber(input) {
    let value = input.value.replace(/\D/g, '');

    if (value.length > 10) {
        value = value.slice(0, 10);
    }

    if (value.length > 6) {
        value = value.slice(0, 2) + ' ' + value.slice(2, 6) + '-' + value.slice(6);
    } else if (value.length > 2) {
        value = value.slice(0, 2) + ' ' + value.slice(2);
    }

    input.value = value;
}

// ===================================
// Utility Functions
// ===================================
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

// ===================================
// Keyboard Navigation
// ===================================
function handleKeyboardNavigation(e) {
    // Close mobile menu on Escape
    if (e.key === 'Escape' && nav.classList.contains('active')) {
        closeMobileMenu();
    }
}

// ===================================
// Preloader (Optional)
// ===================================
function hidePreloader() {
    const preloader = document.querySelector('.preloader');
    if (preloader) {
        preloader.classList.add('hidden');
        setTimeout(() => preloader.remove(), 500);
    }
}

// ===================================
// Initialize on DOM Ready
// ===================================
document.addEventListener('DOMContentLoaded', () => {
    // Initialize all functionality
    initScrollReveal();
    initWhatsAppFloat();
    initLazyLoading();
    hidePreloader();

    // Event Listeners - Scroll
    const debouncedScrollHandler = debounce(() => {
        handleHeaderScroll();
        updateActiveNavLink();
    }, 10);

    window.addEventListener('scroll', debouncedScrollHandler, { passive: true });

    // Initial check for header state
    handleHeaderScroll();

    // Event Listeners - Mobile Menu
    if (menuToggle) {
        menuToggle.addEventListener('click', toggleMobileMenu);
    }

    // Event Listeners - Navigation Links
    navLinks.forEach(link => {
        link.addEventListener('click', smoothScrollToSection);
    });

    // Event Listeners - All anchor links with hash
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', smoothScrollToSection);
    });

    // Event Listeners - Keyboard
    document.addEventListener('keydown', handleKeyboardNavigation);

    // Handle resize for mobile menu
    const handleResize = throttle(() => {
        if (window.innerWidth >= 1024 && nav.classList.contains('active')) {
            closeMobileMenu();
        }
    }, 200);

    window.addEventListener('resize', handleResize);

    // Close mobile menu when clicking outside
    document.addEventListener('click', (e) => {
        if (nav.classList.contains('active') &&
            !nav.contains(e.target) &&
            !menuToggle.contains(e.target)) {
            closeMobileMenu();
        }
    });
});

// ===================================
// Analytics Events (Optional - ready for integration)
// ===================================
const Analytics = {
    track(eventName, properties = {}) {
        // Integration point for Google Analytics, Mixpanel, etc.
        console.log(`[Analytics] ${eventName}`, properties);

        // Example: Google Analytics 4
        // if (typeof gtag !== 'undefined') {
        //     gtag('event', eventName, properties);
        // }
    },

    trackProductClick(productName) {
        this.track('product_click', { product: productName });
    },

    trackWhatsAppClick(source) {
        this.track('whatsapp_click', { source });
    },

    trackFormSubmit(formName) {
        this.track('form_submit', { form: formName });
    }
};

// Export for use in other scripts if needed
window.BroncoMateriales = {
    Analytics,
    CONFIG
};
