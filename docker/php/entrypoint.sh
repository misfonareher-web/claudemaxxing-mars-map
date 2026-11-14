#!/bin/sh
set -eu
case "${DB_PASSWORD:-}" in
  ''|local-demo-only|CHANGE_ME_USE_A_RANDOM_PASSWORD)
    echo 'Set DB_PASSWORD to a strong private password in .env before starting ARES.' >&2
    exit 1
    ;;
esac
php /app/api/bin/load_features.php
exec php-fpm
