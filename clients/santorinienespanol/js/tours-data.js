/**
 * Tours Data Loader
 * Carga los datos de tours desde el JSON y actualiza los elementos del DOM
 */

(function() {
    // Determinar la ruta base según la ubicación del archivo
    const isSubpage = window.location.pathname.includes('/tours/');
    const basePath = isSubpage ? '../' : '';

    // Cargar datos del JSON
    fetch(basePath + 'data/tours.json')
        .then(response => response.json())
        .then(data => {
            updateToursData(data);
        })
        .catch(error => {
            console.error('Error cargando datos de tours:', error);
        });

    function updateToursData(data) {
        const tours = data.tours;

        // Actualizar cards en index.html
        tours.forEach(tour => {
            // Buscar card por data-tour-id
            const card = document.querySelector(`[data-tour-id="${tour.id}"]`);
            if (card) {
                // Actualizar precio en imagen (desktop)
                const priceEl = card.querySelector('.experience-price');
                if (priceEl) {
                    if (tour.showPrice && tour.price) {
                        priceEl.textContent = tour.price;
                        priceEl.style.display = '';
                    } else {
                        priceEl.style.display = 'none';
                    }
                }

                // Actualizar precio mobile
                const priceMobileEl = card.querySelector('.experience-price-mobile');
                if (priceMobileEl) {
                    if (tour.showPrice && tour.price) {
                        priceMobileEl.textContent = tour.price;
                        priceMobileEl.style.display = '';
                    } else {
                        priceMobileEl.style.display = 'none';
                    }
                }
            }

            // Buscar página de tour por data-tour-id en body o section
            const tourPage = document.querySelector(`body[data-tour-id="${tour.id}"], [data-tour-page="${tour.id}"]`);
            if (tourPage) {
                // Actualizar precio en hero
                const heroPrice = document.querySelector('.tour-meta-item.price');
                if (heroPrice) {
                    if (tour.showPrice && tour.price) {
                        heroPrice.textContent = tour.price;
                        heroPrice.style.display = '';
                    } else {
                        heroPrice.style.display = 'none';
                    }
                }
            }
        });

        // Actualizar banner de inclusiones global
        const inclusionsBanner = document.querySelector('.tour-inclusions-banner');
        if (inclusionsBanner && data.globalInclusions) {
            const spanEmoji = inclusionsBanner.querySelector('span');
            const emoji = spanEmoji ? spanEmoji.outerHTML : '<span>🎁</span>';
            inclusionsBanner.innerHTML = emoji + ' ' + data.globalInclusions;
        }
    }
})();
