#!/bin/sh
set -e

# Apply any pending Prisma migrations before booting the API (#1175).
echo "[entrypoint] Running database migrations..."
npx prisma migrate deploy

echo "[entrypoint] Starting PropChain API..."
exec node dist/main