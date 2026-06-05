(function(){
var menu=[
{"categoria":"Entradas","nombre":"Empanadas salteñas (x6)","descripcion":"Relleno jugoso de carne cortada a cuchillo, papa y huevo","precio":5800,"badges":["Destacado"]},
{"categoria":"Entradas","nombre":"Provoleta a la parrilla","descripcion":"Queso provolone fundido con orégano y tomate","precio":4500,"badges":[]},
{"categoria":"Entradas","nombre":"Tabla de fiambres y quesos","descripcion":"Selección de embutidos artesanales, quesos regionales y pan casero","precio":7200,"badges":[]},
{"categoria":"Entradas","nombre":"Humita en chala","descripcion":"Choclo fresco, queso de cabra y especias, cocida en chala","precio":4200,"badges":["Regional"]},
{"categoria":"Parrilla","nombre":"Bife de chorizo 400g","descripcion":"Corte premium a la parrilla, guarnición a elección","precio":9800,"badges":["Destacado"]},
{"categoria":"Parrilla","nombre":"Ojo de bife 350g","descripcion":"Tierno y jugoso, punto a elección","precio":10500,"badges":[]},
{"categoria":"Parrilla","nombre":"Asado de tira","descripcion":"Costilla de res a la cruz, cocción lenta","precio":8900,"badges":["Destacado"]},
{"categoria":"Parrilla","nombre":"Vacío con chimichurri","descripcion":"Corte clásico argentino, chimichurri casero","precio":8500,"badges":[]},
{"categoria":"Parrilla","nombre":"Parrillada para 2","descripcion":"Bife, chorizo, morcilla, chinchulín, ensalada y papas","precio":16500,"badges":["Para compartir"]},
{"categoria":"Pastas","nombre":"Sorrentinos de jamón y queso","descripcion":"Masa casera, salsa fileto o crema","precio":7200,"badges":[]},
{"categoria":"Pastas","nombre":"Ñoquis de papa","descripcion":"Hechos a mano, salsa bolognesa o 4 quesos","precio":6500,"badges":[]},
{"categoria":"Postres","nombre":"Flan casero con dulce de leche","descripcion":"Receta de la abuela, dulce de leche artesanal","precio":3800,"badges":["Destacado"]},
{"categoria":"Postres","nombre":"Helado artesanal (3 bochas)","descripcion":"Sabores de temporada","precio":3200,"badges":[]},
{"categoria":"Postres","nombre":"Volcán de chocolate","descripcion":"Centro líquido, helado de crema americana","precio":4500,"badges":[]},
{"categoria":"Bebidas","nombre":"Vino Torrontés (copa)","descripcion":"Cepa insignia de Salta, fresco y aromático","precio":2800,"badges":["Regional"]},
{"categoria":"Bebidas","nombre":"Vino Malbec Reserva (botella)","descripcion":"Bodega seleccionada, cosecha especial","precio":8500,"badges":[]},
{"categoria":"Bebidas","nombre":"Cerveza artesanal","descripcion":"Rubia, roja o negra — producción local","precio":2500,"badges":[]},
{"categoria":"Bebidas","nombre":"Agua mineral / Soda","descripcion":"Con o sin gas","precio":1200,"badges":[]},
];
function formatPrice(n){
return '$'+n.toString().replace(/\B(?=(\d{3})+(?!\d))/g,'.');
}
function renderMenu(cat){
var grid=document.getElementById('menuGrid');
var filtered=menu.filter(function(i){return i.categoria===cat;});
grid.innerHTML='';
filtered.forEach(function(item,idx){
var card=document.createElement('div');
card.className='menu__item';
card.style.animationDelay=(idx*0.08)+'s';
var bh='';
if(item.badges&&item.badges.length>0){
bh='<div class="menu__item-badges">'+item.badges.map(function(b){
return '<span class="menu__badge menu__badge--'+b.replace(/ /g,'-')+'">'+b+'</span>';
}).join('')+'</div>';
}
card.innerHTML='<div class="menu__item-header"><span class="menu__item-name">'+item.nombre+'</span><span class="menu__item-price">'+formatPrice(item.precio)+'</span></div><p class="menu__item-desc">'+item.descripcion+'</p>'+bh;
grid.appendChild(card);
});
}

function initTabs(){
var tabs=document.querySelectorAll('.menu__tab');
tabs.forEach(function(tab){
tab.addEventListener('click',function(){
tabs.forEach(function(t){t.classList.remove('menu__tab--active');t.setAttribute('aria-selected','false');});
tab.classList.add('menu__tab--active');
tab.setAttribute('aria-selected','true');
renderMenu(tab.dataset.categoria);
});});
renderMenu('Entradas');
}
function initNav(){
var toggle=document.getElementById('navToggle');
var nm=document.getElementById('navMenu');
toggle.addEventListener('click',function(){
var o=nm.classList.toggle('nav__menu--open');
toggle.classList.toggle('nav__toggle--active');
toggle.setAttribute('aria-expanded',o?'true':'false');
});
nm.querySelectorAll('.nav__link').forEach(function(lk){
lk.addEventListener('click',function(){nm.classList.remove('nav__menu--open');toggle.classList.remove('nav__toggle--active');toggle.setAttribute('aria-expanded','false');});
});
window.addEventListener('scroll',function(){
var nav=document.getElementById('nav');
if(window.scrollY>50){nav.classList.add('nav--scrolled');}else{nav.classList.remove('nav--scrolled');}
});
}

function initSmoothScroll(){
document.querySelectorAll('a[href^="#"]').forEach(function(a){
a.addEventListener('click',function(e){
var href=this.getAttribute('href');
if(href==='#')return;
var tgt=document.querySelector(href);
if(tgt){e.preventDefault();var nh=document.getElementById('nav').offsetHeight;var tp=tgt.getBoundingClientRect().top+window.pageYOffset-nh;window.scrollTo({top:tp,behavior:'smooth'});}
});});
}
function initReveal(){
var obs=new IntersectionObserver(function(entries){
entries.forEach(function(en){if(en.isIntersecting){en.target.classList.add('reveal--visible');}});
},{threshold:0.15,rootMargin:'0px 0px -40px 0px'});
document.querySelectorAll('.reveal').forEach(function(el){obs.observe(el);});
}
document.addEventListener('DOMContentLoaded',function(){
initNav();initTabs();initSmoothScroll();initReveal();
});
})();
