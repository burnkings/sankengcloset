#!/bin/bash
set -e
cd /home/admin/projects/sankengcloset/backend
set -a
source .env.production
set +a
exec docker-compose -f docker-compose.production.yml up -d --build
