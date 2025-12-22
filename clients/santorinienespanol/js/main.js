// DOM Elements
var leftTrack = document.getElementById('left-track');
var rightTrack = document.getElementById('right-track');
var splitContainer = document.getElementById('split-container');
var dots = document.querySelectorAll('.progress-dot');
var navLinks = document.querySelectorAll('.nav-link');
var scrollIndicator = document.getElementById('scroll-indicator');
var header = document.getElementById('header');
var menuToggle = document.getElementById('menu-toggle');
var navMenu = document.getElementById('nav-menu');

// State
var currentSection = 0;
var totalSections = 4;
var isScrolling = false;
var isFullpageMode = true;
var isMobile = window.innerWidth <= 768;
var exitDirection = 'down';

// Set initial positions (no animation on load)
leftTrack.style.transform = 'translateY(0)';
rightTrack.style.transform = 'translateY(-' + (totalSections - 1) * 100 + 'vh)';

function goToSection(index) {
    if (isScrolling || index < 0 || index >= totalSections) return;

    // Mobile: scroll to section instead of fullpage animation
    if (isMobile) {
        menuToggle.classList.remove('active');
        navMenu.classList.remove('active');
        navLinks.forEach(function(link, i) { link.classList.toggle('active', i === index); });

        var anchors = ['#inicio', '#experiencias', '#nosotros', '#contacto'];
        var target = document.querySelector(anchors[index]);
        if (target) {
            setTimeout(function() {
                target.scrollIntoView({ behavior: 'smooth' });
            }, 100); // Small delay to let menu close first
        }
        return;
    }

    // Desktop: fullpage mode animation
    if (!isFullpageMode) { enterFullpage(); }

    isScrolling = true;
    currentSection = index;

    leftTrack.style.transform = 'translateY(-' + (index * 100) + 'vh)';
    rightTrack.style.transform = 'translateY(-' + ((totalSections - 1 - index) * 100) + 'vh)';

    dots.forEach(function(dot, i) { dot.classList.toggle('active', i === index); });
    navLinks.forEach(function(link, i) { link.classList.toggle('active', i === index); });
    scrollIndicator.classList.toggle('hidden', index > 0);

    menuToggle.classList.remove('active');
    navMenu.classList.remove('active');

    setTimeout(function() { isScrolling = false; }, 800);
}

function handleWheel(e) {
    if (isMobile) return;

    if (!isFullpageMode) {
        if (e.deltaY < 0 && window.scrollY <= 10) {
            e.preventDefault();
            enterFullpage();
            goToSection(totalSections - 1);
        }
        return;
    }

    if (isScrolling) return;
    e.preventDefault();

    if (e.deltaY > 0) {
        if (currentSection < totalSections - 1) {
            goToSection(currentSection + 1);
        } else {
            exitFullpage('down');
        }
    } else {
        if (currentSection > 0) {
            goToSection(currentSection - 1);
        }
    }
}

function handleKeydown(e) {
    if (isMobile) return;
    if (e.key === 'ArrowDown' || e.key === 'PageDown') {
        if (!isFullpageMode) return;
        e.preventDefault();
        if (currentSection < totalSections - 1) goToSection(currentSection + 1);
        else exitFullpage('down');
    } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
        if (!isFullpageMode && window.scrollY <= 10) {
            e.preventDefault();
            enterFullpage();
            goToSection(totalSections - 1);
        } else if (isFullpageMode && currentSection > 0) {
            e.preventDefault();
            goToSection(currentSection - 1);
        }
    }
}

var touchStartY = 0;
function handleTouchStart(e) { touchStartY = e.touches[0].clientY; }
function handleTouchEnd(e) {
    if (isMobile) return;
    var diff = touchStartY - e.changedTouches[0].clientY;
    if (Math.abs(diff) < 50) return;
    if (!isFullpageMode) {
        if (diff < 0 && window.scrollY <= 10) { enterFullpage(); goToSection(totalSections - 1); }
        return;
    }
    if (diff > 0) { if (currentSection < totalSections - 1) goToSection(currentSection + 1); else exitFullpage('down'); }
    else if (currentSection > 0) goToSection(currentSection - 1);
}

function exitFullpage(direction) {
    if (!isFullpageMode) return;
    exitDirection = direction || 'down';
    isFullpageMode = false;

    splitContainer.classList.add('exiting-' + exitDirection);
    header.classList.add('scrolled');

    setTimeout(function() {
        document.body.classList.add('normal-scroll');
        window.scrollTo(0, 0);
    }, 400);
}

function enterFullpage() {
    if (isFullpageMode) return;
    isFullpageMode = true;
    document.body.classList.remove('normal-scroll');
    splitContainer.classList.remove('exiting-down', 'exiting-up');
    window.scrollTo(0, 0);
}

// Event Listeners
if (!isMobile) {
    window.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('keydown', handleKeydown);
    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });
} else {
    document.body.classList.add('normal-scroll');
}

window.addEventListener('resize', function() {
    isMobile = window.innerWidth <= 768;
    if (isMobile) document.body.classList.add('normal-scroll');
});

menuToggle.addEventListener('click', function() {
    menuToggle.classList.toggle('active');
    navMenu.classList.toggle('active');
});

// Contact Form
document.getElementById('contact-form').addEventListener('submit', function(e) {
    e.preventDefault();
    var fd = new FormData(this);
    var msg = '¡Hola! Me contacto desde la web.\n\n*Nombre:* ' + fd.get('nombre') + '\n*Email:* ' + fd.get('email');
    if (fd.get('telefono')) msg += '\n*Tel:* ' + fd.get('telefono');
    if (fd.get('fecha')) msg += '\n*Fecha:* ' + fd.get('fecha');
    if (fd.get('tour')) msg += '\n*Tour:* ' + fd.get('tour');
    if (fd.get('mensaje')) msg += '\n*Mensaje:* ' + fd.get('mensaje');
    window.open('https://wa.me/306976739893?text=' + encodeURIComponent(msg), '_blank');
    this.reset();
});

// Smooth scroll for anchor links
document.querySelectorAll('a[href^="#"]').forEach(function(a) {
    a.addEventListener('click', function(e) {
        var id = this.getAttribute('href');
        if (id !== '#' && document.querySelector(id) && !isFullpageMode) {
            e.preventDefault();
            document.querySelector(id).scrollIntoView({ behavior: 'smooth' });
        }
    });
});

// Header scroll effect
window.addEventListener('scroll', function() {
    if (!isFullpageMode) header.classList.toggle('scrolled', window.scrollY > 50);
});
