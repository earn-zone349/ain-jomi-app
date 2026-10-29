#!/usr/bin/env bash
# Applies supabase/schema.sql twice (idempotency check) to a throw-away local PostgreSQL and runs
# behaviour.sql: row-level security, role guard, draft->published rules, tombstones, version counter,
# reports, error logs, account deletion. Read the printed lines: each section says what must FAIL.
#
# Needs a running PostgreSQL you can create databases in (PGHOST/PGPORT/PGUSER as usual).
set -euo pipefail
cd "$(dirname "$0")"
DB="ainjomi_test_$$"
createdb "$DB"
trap 'dropdb --if-exists "$DB"' EXIT
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f mock_supabase.sql >/dev/null
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f ../../supabase/schema.sql >/dev/null 2>&1
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f ../../supabase/schema.sql >/dev/null 2>&1
echo "schema applied twice: OK"
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f ../../supabase/seed_legal.sql
psql -d "$DB" -f behaviour.sql
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f ../../supabase/phase5_lawyers.sql >/dev/null
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f ../../supabase/phase5_lawyers.sql >/dev/null
echo "phase5 applied twice: OK"
psql -d "$DB" -f lawyers.sql
