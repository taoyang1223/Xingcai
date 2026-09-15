#!/usr/bin/env bash
set -euo pipefail
sudo -u postgres psql -v ON_ERROR_STOP=1 <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'fitme') THEN
    CREATE ROLE fitme LOGIN PASSWORD 'fitme';
  END IF;
END
$$;
SELECT 'CREATE DATABASE fitme OWNER fitme'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'fitme')\gexec
GRANT ALL ON DATABASE fitme TO fitme;
SQL
sudo -u postgres psql -d fitme -c "GRANT ALL ON SCHEMA public TO fitme;"
echo "db ready"
