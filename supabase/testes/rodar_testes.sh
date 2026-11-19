#!/usr/bin/env bash
# Testa as migrações num Postgres local descartável, com a imitação mínima do Supabase.
# Uso: bash supabase/testes/rodar_testes.sh
# Requisito: Postgres 15+ instalado (initdb, pg_ctl, psql). Não toca no Supabase de verdade.
set -euo pipefail

AQUI="$(cd "$(dirname "$0")" && pwd)"
source "$AQUI/postgres_local.sh"
pg_subir "$(cd "$AQUI/.." && pwd)"
SQL="$TMP/sql"

echo "== imitação do Supabase"
"${PSQL[@]}" -f "$SQL/testes/stub_supabase.sql"

for m in "$SQL"/migrations/*.sql; do
  echo "== migração $(basename "$m")"
  "${PSQL[@]}" -f "$m"
done

echo "== testes"
for t in "$SQL"/testes/testes_*.sql; do
  "${PSQL[@]}" -f "$t" 2>&1 | sed 's/^psql:[^:]*:[0-9]*: //'
done
