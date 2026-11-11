#!/bin/sh
# Apply the committed schema, then serve. A failed migration exits the
# container so the deploy fails visibly instead of running against a partial
# schema. Migrations are additive: Watchtower may update this image and the
# app image independently.
set -eu

/pocketbase migrate up \
    --dir /pb_data \
    --migrationsDir /pb_migrations

exec /pocketbase serve \
    --http 0.0.0.0:8090 \
    --dir /pb_data \
    --migrationsDir /pb_migrations \
    --hooksDir /pb_hooks \
    --automigrate=false
