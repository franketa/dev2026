/**
 * INMOBILIARIA GONZALEZ - Main Application
 * Mobile-first real estate website
 */

// ==========================================================================
// State Management
// ==========================================================================
const state = {
  properties: [],
  filteredProperties: [],
  currentFilter: {
    operation: 'todos',
    type: 'todos',
    neighborhood: '',
    minPrice: '',
    maxPrice: ''
  },
  visibleCount: 8,
  isMenuOpen: false,
  currentProperty: null,
  favorites: JSON.parse(localStorage.getItem('favorites')) || []
};

// ==========================================================================
// DOM Elements
// ==========================================================================
const DOM = {
  header: document.querySelector('.header'),
  menuBtn: document.querySelector('.header__menu-btn'),
  nav: document.querySelector('.nav'),
  searchForm: document.querySelector('.search-box__form'),
  searchTabs: document.querySelectorAll('.search-box__tab'),
  propertiesGrid: document.querySelector('.properties__grid'),
  filterBtns: document.querySelectorAll('.filter-btn'),
  loadMoreBtn: document.querySelector('.load-more-btn'),
  modal: document.querySelector('.modal'),
  contactForm: document.querySelector('.contact__form form'),
  propertySubmitForm: document.querySelector('#property-submit-form')
};

// ==========================================================================
// Utility Functions
// ==========================================================================
function formatPrice(price, currency) {
  if (currency === 'USD') {
    return `USD ${price.toLocaleString('es-AR')}`;
  }
  return `$ ${price.toLocaleString('es-AR')}`;
}

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

function getPropertyImage(index) {
  // Use local images (prop-1.jpg through prop-25.jpg)
  const imageNumber = (index % 25) + 1;
  return `assets/images/properties/prop-${imageNumber}.jpg`;
}

// ==========================================================================
// Data Loading
// ==========================================================================
async function loadProperties() {
  try {
    let data;

    // Use embedded data if available (works without server)
    if (window.PROPERTIES_DATA) {
      data = window.PROPERTIES_DATA;
    } else {
      // Fallback to fetch (requires server)
      const response = await fetch('data/properties.json');
      data = await response.json();
    }

    state.properties = data.properties;
    state.filteredProperties = [...state.properties];
    renderProperties();
    populateFilterOptions(data);
  } catch (error) {
    console.error('Error loading properties:', error);
    showNotification('Error al cargar las propiedades', 'error');
  }
}

function populateFilterOptions(data) {
  // Populate neighborhood select
  const neighborhoodSelect = document.querySelector('#neighborhood-select');
  if (neighborhoodSelect && data.neighborhoods) {
    data.neighborhoods.forEach(neighborhood => {
      const option = document.createElement('option');
      option.value = neighborhood;
      option.textContent = neighborhood;
      neighborhoodSelect.appendChild(option);
    });
  }

  // Populate type select
  const typeSelect = document.querySelector('#type-select');
  if (typeSelect && data.propertyTypes) {
    data.propertyTypes.forEach(type => {
      const option = document.createElement('option');
      option.value = type.id;
      option.textContent = type.label;
      typeSelect.appendChild(option);
    });
  }
}

// ==========================================================================
// Property Rendering
// ==========================================================================
function renderProperties() {
  if (!DOM.propertiesGrid) return;

  const propertiesToShow = state.filteredProperties.slice(0, state.visibleCount);

  DOM.propertiesGrid.innerHTML = propertiesToShow.map((property, index) => {
    const isFavorite = state.favorites.includes(property.id);
    const imageUrl = getPropertyImage(property.id - 1);

    return `
      <article class="property-card reveal" data-id="${property.id}" style="animation-delay: ${index * 50}ms">
        <div class="property-card__image">
          <img
            src="${imageUrl}"
            alt="${property.title}"
            class="property-card__img"
            loading="lazy"
            decoding="async"
          >
          <span class="property-card__badge property-card__badge--${property.operation}">
            ${property.operation === 'venta' ? 'Venta' : 'Alquiler'}
          </span>
          <button
            class="property-card__favorite ${isFavorite ? 'active' : ''}"
            aria-label="Agregar a favoritos"
            data-id="${property.id}"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="${isFavorite ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
            </svg>
          </button>
        </div>
        <div class="property-card__content">
          <p class="property-card__price">${formatPrice(property.price, property.currency)}</p>
          <h3 class="property-card__title">${property.title}</h3>
          <p class="property-card__location">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
              <circle cx="12" cy="10" r="3"></circle>
            </svg>
            ${property.location.neighborhood}, ${property.location.city}
          </p>
          <div class="property-card__features">
            ${property.features.bedrooms > 0 ? `
              <span class="property-card__feature">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M3 7v11a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7"></path>
                  <path d="M21 7H3l2-4h14l2 4z"></path>
                  <path d="M12 4v3"></path>
                </svg>
                ${property.features.bedrooms} amb.
              </span>
            ` : ''}
            ${property.features.bathrooms > 0 ? `
              <span class="property-card__feature">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M9 6 6.5 3.5a1.5 1.5 0 0 0-1-.5C4.683 3 4 3.683 4 4.5V17a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5"></path>
                  <line x1="10" y1="5" x2="8" y2="7"></line>
                  <line x1="2" y1="12" x2="22" y2="12"></line>
                  <line x1="7" y1="19" x2="7" y2="21"></line>
                  <line x1="17" y1="19" x2="17" y2="21"></line>
                </svg>
                ${property.features.bathrooms} ${property.features.bathrooms === 1 ? 'baño' : 'baños'}
              </span>
            ` : ''}
            <span class="property-card__feature">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              </svg>
              ${property.features.area} m²
            </span>
            ${property.features.garage > 0 ? `
              <span class="property-card__feature">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M19 17h2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10h2"></path>
                  <path d="M14 17H9"></path>
                  <circle cx="6.5" cy="17.5" r="2.5"></circle>
                  <circle cx="17.5" cy="17.5" r="2.5"></circle>
                </svg>
                ${property.features.garage} ${property.features.garage === 1 ? 'cochera' : 'cocheras'}
              </span>
            ` : ''}
          </div>
        </div>
      </article>
    `;
  }).join('');

  // Update load more button visibility
  updateLoadMoreButton();

  // Trigger reveal animations
  setTimeout(() => {
    document.querySelectorAll('.property-card.reveal').forEach(card => {
      card.classList.add('visible');
    });
  }, 100);

  // Add click listeners to cards
  document.querySelectorAll('.property-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (!e.target.closest('.property-card__favorite')) {
        const id = parseInt(card.dataset.id);
        openPropertyDetail(id);
      }
    });
  });

  // Add favorite button listeners
  document.querySelectorAll('.property-card__favorite').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFavorite(parseInt(btn.dataset.id));
    });
  });
}

function updateLoadMoreButton() {
  const loadMoreContainer = document.querySelector('.properties__load-more');
  if (!loadMoreContainer) return;

  if (state.visibleCount >= state.filteredProperties.length) {
    loadMoreContainer.style.display = 'none';
  } else {
    loadMoreContainer.style.display = 'flex';
    loadMoreContainer.innerHTML = `
      <button class="btn btn--outline load-more-btn">
        Ver más propiedades
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </button>
    `;
    loadMoreContainer.querySelector('.load-more-btn').addEventListener('click', loadMore);
  }
}

function loadMore() {
  state.visibleCount += 8;
  renderProperties();
}

// ==========================================================================
// Filtering
// ==========================================================================
function filterProperties() {
  state.filteredProperties = state.properties.filter(property => {
    // Operation filter
    if (state.currentFilter.operation !== 'todos' &&
        property.operation !== state.currentFilter.operation) {
      return false;
    }

    // Type filter
    if (state.currentFilter.type !== 'todos' &&
        property.type !== state.currentFilter.type) {
      return false;
    }

    // Neighborhood filter
    if (state.currentFilter.neighborhood &&
        property.location.neighborhood !== state.currentFilter.neighborhood) {
      return false;
    }

    // Price filters
    if (state.currentFilter.minPrice) {
      const minPrice = parseInt(state.currentFilter.minPrice);
      if (property.price < minPrice) return false;
    }

    if (state.currentFilter.maxPrice) {
      const maxPrice = parseInt(state.currentFilter.maxPrice);
      if (property.price > maxPrice) return false;
    }

    return true;
  });

  state.visibleCount = 8;
  renderProperties();
}

// ==========================================================================
// Search Box
// ==========================================================================
function initSearchBox() {
  // Tab switching
  DOM.searchTabs?.forEach(tab => {
    tab.addEventListener('click', () => {
      DOM.searchTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      state.currentFilter.operation = tab.dataset.operation;
      filterProperties();
    });
  });

  // Search form submission
  DOM.searchForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);

    state.currentFilter.type = formData.get('type') || 'todos';
    state.currentFilter.neighborhood = formData.get('neighborhood') || '';
    state.currentFilter.minPrice = formData.get('minPrice') || '';
    state.currentFilter.maxPrice = formData.get('maxPrice') || '';

    filterProperties();

    // Scroll to properties section
    document.querySelector('.properties')?.scrollIntoView({ behavior: 'smooth' });
  });
}

// ==========================================================================
// Filter Buttons
// ==========================================================================
function initFilterButtons() {
  DOM.filterBtns?.forEach(btn => {
    btn.addEventListener('click', () => {
      DOM.filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const filterType = btn.dataset.filter;
      const filterValue = btn.dataset.value;

      if (filterType === 'operation') {
        state.currentFilter.operation = filterValue;
      } else if (filterType === 'type') {
        state.currentFilter.type = filterValue;
      }

      filterProperties();
    });
  });
}

// ==========================================================================
// Favorites
// ==========================================================================
function toggleFavorite(id) {
  const index = state.favorites.indexOf(id);

  if (index === -1) {
    state.favorites.push(id);
    showNotification('Agregado a favoritos', 'success');
  } else {
    state.favorites.splice(index, 1);
    showNotification('Eliminado de favoritos', 'info');
  }

  localStorage.setItem('favorites', JSON.stringify(state.favorites));
  renderProperties();
}

// ==========================================================================
// Property Detail
// ==========================================================================
function openPropertyDetail(id) {
  // Navigate to property detail page
  window.location.href = `property.html?id=${id}`;
}

// ==========================================================================
// Mobile Navigation
// ==========================================================================
function initMobileNav() {
  DOM.menuBtn?.addEventListener('click', () => {
    state.isMenuOpen = !state.isMenuOpen;
    DOM.menuBtn.classList.toggle('active', state.isMenuOpen);
    DOM.nav?.classList.toggle('active', state.isMenuOpen);
    document.body.style.overflow = state.isMenuOpen ? 'hidden' : '';
  });

  // Close menu on nav link click
  DOM.nav?.querySelectorAll('.nav__link').forEach(link => {
    link.addEventListener('click', () => {
      state.isMenuOpen = false;
      DOM.menuBtn?.classList.remove('active');
      DOM.nav?.classList.remove('active');
      document.body.style.overflow = '';
    });
  });
}

// ==========================================================================
// Header Scroll Effect
// ==========================================================================
function initHeaderScroll() {
  const handleScroll = debounce(() => {
    DOM.header?.classList.toggle('scrolled', window.scrollY > 50);
  }, 10);

  window.addEventListener('scroll', handleScroll, { passive: true });
}

// ==========================================================================
// Contact Form
// ==========================================================================
function initContactForm() {
  DOM.contactForm?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());

    // Simulate form submission
    const submitBtn = e.target.querySelector('.form__submit');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Enviando...';
    submitBtn.disabled = true;

    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1500));

      showNotification('Mensaje enviado correctamente. Nos pondremos en contacto pronto.', 'success');
      e.target.reset();
    } catch (error) {
      showNotification('Error al enviar el mensaje. Por favor intente nuevamente.', 'error');
    } finally {
      submitBtn.textContent = originalText;
      submitBtn.disabled = false;
    }
  });
}

// ==========================================================================
// Property Submission Form
// ==========================================================================
function initPropertySubmitForm() {
  const openBtn = document.querySelector('[data-action="open-submit-modal"]');

  openBtn?.addEventListener('click', () => {
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.innerHTML = `
      <div class="modal__backdrop"></div>
      <div class="modal__content">
        <div class="modal__header">
          <h2 class="modal__title">Publicar mi propiedad</h2>
          <button class="modal__close" aria-label="Cerrar">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
        <div class="modal__body">
          <form id="property-submit-form">
            <div class="form__group">
              <label class="form__label" for="submit-name">Nombre completo *</label>
              <input type="text" id="submit-name" name="name" class="form__input" required>
            </div>
            <div class="form__group">
              <label class="form__label" for="submit-email">Email *</label>
              <input type="email" id="submit-email" name="email" class="form__input" required>
            </div>
            <div class="form__group">
              <label class="form__label" for="submit-phone">Teléfono *</label>
              <input type="tel" id="submit-phone" name="phone" class="form__input" required>
            </div>
            <div class="form__group">
              <label class="form__label" for="submit-type">Tipo de propiedad *</label>
              <select id="submit-type" name="propertyType" class="form__select" required>
                <option value="">Seleccionar...</option>
                <option value="casa">Casa</option>
                <option value="departamento">Departamento</option>
                <option value="ph">PH</option>
                <option value="local">Local Comercial</option>
                <option value="oficina">Oficina</option>
                <option value="terreno">Terreno</option>
              </select>
            </div>
            <div class="form__group">
              <label class="form__label" for="submit-operation">Operación *</label>
              <select id="submit-operation" name="operation" class="form__select" required>
                <option value="">Seleccionar...</option>
                <option value="venta">Venta</option>
                <option value="alquiler">Alquiler</option>
              </select>
            </div>
            <div class="form__group">
              <label class="form__label" for="submit-address">Dirección de la propiedad *</label>
              <input type="text" id="submit-address" name="address" class="form__input" required>
            </div>
            <div class="form__group">
              <label class="form__label" for="submit-description">Descripción</label>
              <textarea id="submit-description" name="description" class="form__textarea" rows="4" placeholder="Cuéntanos sobre tu propiedad..."></textarea>
            </div>
            <button type="submit" class="form__submit">Enviar solicitud</button>
          </form>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';

    const closeModal = () => {
      modal.classList.remove('active');
      setTimeout(() => {
        modal.remove();
        document.body.style.overflow = '';
      }, 250);
    };

    modal.querySelector('.modal__backdrop').addEventListener('click', closeModal);
    modal.querySelector('.modal__close').addEventListener('click', closeModal);

    // Handle form submission
    modal.querySelector('#property-submit-form').addEventListener('submit', async (e) => {
      e.preventDefault();

      const formData = new FormData(e.target);
      const data = Object.fromEntries(formData.entries());

      const submitBtn = e.target.querySelector('.form__submit');
      submitBtn.textContent = 'Enviando...';
      submitBtn.disabled = true;

      try {
        await new Promise(resolve => setTimeout(resolve, 1500));
        showNotification('Solicitud enviada. Nos contactaremos para coordinar la visita y toma de fotos.', 'success');
        closeModal();
      } catch (error) {
        showNotification('Error al enviar. Por favor intente nuevamente.', 'error');
        submitBtn.textContent = 'Enviar solicitud';
        submitBtn.disabled = false;
      }
    });
  });
}

// ==========================================================================
// Notifications
// ==========================================================================
function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `notification notification--${type}`;
  notification.style.cssText = `
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    padding: 12px 24px;
    background: ${type === 'success' ? 'var(--success)' : type === 'error' ? 'var(--error)' : 'var(--primary-color)'};
    color: white;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 1000;
    font-size: 14px;
    animation: fadeInUp 0.3s ease;
  `;
  notification.textContent = message;

  document.body.appendChild(notification);

  setTimeout(() => {
    notification.style.animation = 'fadeIn 0.3s ease reverse';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// ==========================================================================
// Intersection Observer for Animations
// ==========================================================================
function initScrollAnimations() {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
        }
      });
    },
    { threshold: 0.1, rootMargin: '0px 0px -50px 0px' }
  );

  document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
}

// ==========================================================================
// Smooth Scroll for Anchor Links
// ==========================================================================
function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', (e) => {
      const href = anchor.getAttribute('href');
      if (href === '#') return;

      e.preventDefault();
      const target = document.querySelector(href);

      if (target) {
        const headerHeight = DOM.header?.offsetHeight || 72;
        const targetPosition = target.getBoundingClientRect().top + window.scrollY - headerHeight;

        window.scrollTo({
          top: targetPosition,
          behavior: 'smooth'
        });
      }
    });
  });
}

// ==========================================================================
// Initialize Application
// ==========================================================================
function init() {
  loadProperties();
  initMobileNav();
  initHeaderScroll();
  initSearchBox();
  initFilterButtons();
  initContactForm();
  initPropertySubmitForm();
  initSmoothScroll();

  // Initialize animations after a short delay
  setTimeout(initScrollAnimations, 100);
}

// Start the app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// ==========================================================================
// Export for admin usage
// ==========================================================================
window.InmobiliariaApp = {
  state,
  loadProperties,
  filterProperties,
  showNotification
};
