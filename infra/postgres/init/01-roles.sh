#!/bin/sh
# Creates the restricted application role used for tenant-scoped requests.
# The schema owner (workmesh_owner) bypasses RLS; workmesh_app does not.
set -eu

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  DO \$\$
  BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'workmesh_app') THEN
      CREATE ROLE workmesh_app LOGIN PASSWORD '${WORKMESH_APP_DB_PASSWORD}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
    END IF;
  END
  \$\$;
  GRANT CONNECT ON DATABASE ${POSTGRES_DB} TO workmesh_app;
  CREATE DATABASE workmesh_test OWNER ${POSTGRES_USER};
  GRANT CONNECT ON DATABASE workmesh_test TO workmesh_app;
EOSQL
