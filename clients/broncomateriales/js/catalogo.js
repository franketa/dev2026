/**
 * Catálogo de Productos - Bronco Materiales
 * ==========================================
 * Script para búsqueda, filtrado y visualización de productos
 */

(function() {
    'use strict';

    // ===================================
    // CONFIGURACIÓN
    // ===================================

    const CONFIG = {
        dataUrl: 'data/products.json',
        whatsappNumber: '5492346515265',
        logoUrl: 'logo.png',
        debounceDelay: 300
    };

    // ===================================
    // ESTADO DE LA APLICACIÓN
    // ===================================

    let products = [];
    let filteredProducts = [];
    let categories = [];

    // ===================================
    // ELEMENTOS DEL DOM
    // ===================================

    const elements = {
        productsGrid: document.getElementById('productsGrid'),
        searchInput: document.getElementById('searchInput'),
        clearSearch: document.getElementById('clearSearch'),
        categoryFilter: document.getElementById('categoryFilter'),
        resultsCount: document.getElementById('resultsCount'),
        emptyState: document.getElementById('emptyState'),
        resetFilters: document.getElementById('resetFilters')
    };

    // ===================================
    // FUNCIONES UTILITARIAS
    // ===================================

    /**
     * Debounce para evitar múltiples llamadas en poco tiempo
     */
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

    /**
     * Normaliza texto para búsqueda (quita acentos, pasa a minúsculas)
     */
    function normalizeText(text) {
        if (!text) return '';
        return text
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .trim();
    }

    /**
     * Genera URL de WhatsApp con mensaje predefinido
     */
    function getWhatsAppUrl(productName, productCode) {
        let message = `Hola, quiero consultar por el producto: ${productName}`;
        if (productCode) {
            message += ` (Código: ${productCode})`;
        }
        return `https://wa.me/${CONFIG.whatsappNumber}?text=${encodeURIComponent(message)}`;
    }

    /**
     * Escapa HTML para prevenir XSS
     */
    function escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ===================================
    // CARGA DE DATOS
    // ===================================

    /**
     * Carga los productos desde el archivo JSON
     */
    async function loadProducts() {
        try {
            showLoading();

            const response = await fetch(CONFIG.dataUrl);

            if (!response.ok) {
                throw new Error(`Error HTTP: ${response.status}`);
            }

            products = await response.json();

            // Extraer categorías únicas
            categories = [...new Set(products.map(p => p.categoria))].sort();

            // Poblar el selector de categorías
            populateCategoryFilter();

            // Mostrar todos los productos inicialmente
            filteredProducts = [...products];
            renderProducts();

            // Verificar parámetros de URL
            checkUrlParams();

        } catch (error) {
            console.error('Error al cargar productos:', error);
            showError();
        }
    }

    /**
     * Muestra el estado de carga
     */
    function showLoading() {
        elements.productsGrid.innerHTML = `
            <div class="catalogo__loading" style="grid-column: 1 / -1;">
                <div class="catalogo__loading-spinner"></div>
                <p class="catalogo__loading-text">Cargando productos...</p>
            </div>
        `;
    }

    /**
     * Muestra error de carga
     */
    function showError() {
        elements.productsGrid.innerHTML = `
            <div class="catalogo__empty" style="grid-column: 1 / -1;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <circle cx="12" cy="12" r="10"/>
                    <path d="M12 8v4M12 16h.01"/>
                </svg>
                <h3>Error al cargar productos</h3>
                <p>No pudimos cargar el catálogo. Por favor, intentá de nuevo más tarde.</p>
                <button onclick="location.reload()" class="catalogo__reset-btn">Reintentar</button>
            </div>
        `;
        elements.emptyState.style.display = 'none';
    }

    // ===================================
    // FILTRADO Y BÚSQUEDA
    // ===================================

    /**
     * Pobla el selector de categorías
     */
    function populateCategoryFilter() {
        elements.categoryFilter.innerHTML = '<option value="">Todas las categorías</option>';

        categories.forEach(cat => {
            const option = document.createElement('option');
            option.value = cat;
            option.textContent = cat;
            elements.categoryFilter.appendChild(option);
        });
    }

    /**
     * Filtra productos según búsqueda y categoría
     */
    function filterProducts() {
        const searchTerm = normalizeText(elements.searchInput.value);
        const selectedCategory = elements.categoryFilter.value;

        filteredProducts = products.filter(product => {
            // Filtro por categoría
            if (selectedCategory && product.categoria !== selectedCategory) {
                return false;
            }

            // Filtro por búsqueda
            if (searchTerm) {
                const searchFields = [
                    product.nombre,
                    product.codigo,
                    product.medida,
                    product.subcategoria,
                    product.categoria
                ].filter(Boolean).map(normalizeText);

                return searchFields.some(field => field.includes(searchTerm));
            }

            return true;
        });

        // Actualizar UI
        renderProducts();
        updateResultsCount();
        updateClearButton();
        updateUrl();
    }

    /**
     * Actualiza el contador de resultados
     */
    function updateResultsCount() {
        const total = products.length;
        const showing = filteredProducts.length;

        if (showing === total) {
            elements.resultsCount.textContent = `Mostrando ${total} productos`;
        } else if (showing === 0) {
            elements.resultsCount.textContent = 'No se encontraron productos';
        } else {
            elements.resultsCount.textContent = `Mostrando ${showing} de ${total} productos`;
        }
    }

    /**
     * Actualiza visibilidad del botón de limpiar búsqueda
     */
    function updateClearButton() {
        const hasSearch = elements.searchInput.value.length > 0;
        elements.clearSearch.style.display = hasSearch ? 'flex' : 'none';
    }

    /**
     * Actualiza la URL con los parámetros de búsqueda
     */
    function updateUrl() {
        const params = new URLSearchParams();

        if (elements.searchInput.value) {
            params.set('buscar', elements.searchInput.value);
        }

        if (elements.categoryFilter.value) {
            params.set('categoria', elements.categoryFilter.value);
        }

        const newUrl = params.toString()
            ? `${window.location.pathname}?${params.toString()}`
            : window.location.pathname;

        window.history.replaceState({}, '', newUrl);
    }

    /**
     * Verifica parámetros de URL al cargar
     */
    function checkUrlParams() {
        const params = new URLSearchParams(window.location.search);

        const buscar = params.get('buscar');
        const categoria = params.get('categoria');

        if (buscar) {
            elements.searchInput.value = buscar;
        }

        if (categoria && categories.includes(categoria)) {
            elements.categoryFilter.value = categoria;
        }

        if (buscar || categoria) {
            filterProducts();
        }
    }

    /**
     * Limpia todos los filtros
     */
    function resetFilters() {
        elements.searchInput.value = '';
        elements.categoryFilter.value = '';
        filterProducts();
        elements.searchInput.focus();
    }

    // ===================================
    // RENDERIZADO
    // ===================================

    /**
     * Renderiza los productos en la grilla
     */
    function renderProducts() {
        if (filteredProducts.length === 0) {
            elements.productsGrid.innerHTML = '';
            elements.emptyState.style.display = 'block';
            return;
        }

        elements.emptyState.style.display = 'none';

        const html = filteredProducts.map(product => createProductCard(product)).join('');
        elements.productsGrid.innerHTML = html;
    }

    /**
     * Crea el HTML de una tarjeta de producto
     */
    function createProductCard(product) {
        const nombre = escapeHtml(product.nombre);
        const categoria = escapeHtml(product.categoria);
        const codigo = product.codigo ? escapeHtml(product.codigo) : null;
        const medida = product.medida ? escapeHtml(product.medida) : null;
        const subcategoria = product.subcategoria ? escapeHtml(product.subcategoria) : null;
        const whatsappUrl = getWhatsAppUrl(product.nombre, product.codigo);

        return `
            <article class="producto-card">
                <div class="producto-card__image">
                    <img src="${CONFIG.logoUrl}" alt="${nombre}" loading="lazy">
                    <span class="producto-card__categoria">${categoria}</span>
                </div>
                <div class="producto-card__content">
                    <h3 class="producto-card__nombre">${nombre}</h3>
                    ${codigo ? `<span class="producto-card__codigo">${codigo}</span>` : ''}
                    ${medida ? `<p class="producto-card__medida">${medida}</p>` : ''}
                    ${subcategoria ? `<p class="producto-card__subcategoria">${subcategoria}</p>` : ''}
                    <a href="${whatsappUrl}" class="producto-card__cta" target="_blank" rel="noopener">
                        <svg viewBox="0 0 24 24" fill="currentColor">
                            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                        </svg>
                        Consultar
                    </a>
                </div>
            </article>
        `;
    }

    // ===================================
    // EVENT LISTENERS
    // ===================================

    /**
     * Inicializa los event listeners
     */
    function initEventListeners() {
        // Búsqueda con debounce
        const debouncedFilter = debounce(filterProducts, CONFIG.debounceDelay);
        elements.searchInput.addEventListener('input', debouncedFilter);

        // Filtro de categoría
        elements.categoryFilter.addEventListener('change', filterProducts);

        // Botón limpiar búsqueda
        elements.clearSearch.addEventListener('click', () => {
            elements.searchInput.value = '';
            filterProducts();
            elements.searchInput.focus();
        });

        // Botón resetear filtros (en estado vacío)
        elements.resetFilters.addEventListener('click', resetFilters);

        // Búsqueda con Enter
        elements.searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                filterProducts();
            }
            if (e.key === 'Escape') {
                elements.searchInput.value = '';
                filterProducts();
            }
        });
    }

    // ===================================
    // INICIALIZACIÓN
    // ===================================

    /**
     * Inicializa la aplicación
     */
    function init() {
        initEventListeners();
        loadProducts();
    }

    // Iniciar cuando el DOM esté listo
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
