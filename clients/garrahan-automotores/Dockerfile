# Garrahan Automotores — sitio estático servido con nginx
FROM nginx:alpine

# Config de nginx (gzip, cache de assets, fallback a index.html)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copiamos el sitio
COPY index.html /usr/share/nginx/html/
COPY assets/ /usr/share/nginx/html/assets/

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s \
  CMD wget -qO- http://localhost:80/ >/dev/null 2>&1 || exit 1

CMD ["nginx", "-g", "daemon off;"]
