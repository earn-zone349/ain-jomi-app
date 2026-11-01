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
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f ../../supabase/phase5_lawyers_v2.sql >/dev/null
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f ../../supabase/phase5_lawyers_v2.sql >/dev/null
echo "phase5 v2 applied twice: OK"
if psql -q -v ON_ERROR_STOP=1 -d "$DB" -f ../../supabase/phase5_lawyers.sql >/dev/null 2>&1; then echo "FAIL  old phase5 file ran again after v2"; else echo "PASS  old phase5 file refuses to run after v2"; fi
psql -d "$DB" -f lawyers.sql
psql -d "$DB" -f lawyers_v2.sql
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f ../../supabase/phase6_ai.sql >/dev/null
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f ../../supabase/phase6_ai.sql >/dev/null
echo "phase6 applied twice: OK"
psql -d "$DB" -f ai.sql

# The single paste-once file: apply it three times to a fresh database, then run every test again on that result.
DB2="${DB}_all"
createdb "$DB2"
trap 'dropdb --if-exists "$DB"; dropdb --if-exists "$DB2"' EXIT
psql -q -v ON_ERROR_STOP=1 -d "$DB2" -f mock_supabase.sql >/dev/null
for i in 1 2 3; do psql -q -1 -v ON_ERROR_STOP=1 -d "$DB2" -f ../../supabase/ALL_IN_ONE.sql >/dev/null; done
echo "ALL_IN_ONE.sql applied three times: OK"
psql -d "$DB2" -f behaviour.sql
psql -d "$DB2" -f lawyers.sql
psql -d "$DB2" -f lawyers_v2.sql
psql -d "$DB2" -f ai.sql
