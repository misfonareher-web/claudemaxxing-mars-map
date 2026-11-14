FROM php:8.4-fpm-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends libpq-dev python3 python3-numpy && docker-php-ext-install pdo_pgsql && rm -rf /var/lib/apt/lists/*
COPY entrypoint.sh /usr/local/bin/mars-entrypoint
RUN chmod +x /usr/local/bin/mars-entrypoint
ENTRYPOINT ["mars-entrypoint"]
