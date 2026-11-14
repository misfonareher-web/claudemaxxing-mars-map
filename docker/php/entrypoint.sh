#!/bin/sh
set -eu
php /app/api/bin/load_features.php
exec php-fpm
