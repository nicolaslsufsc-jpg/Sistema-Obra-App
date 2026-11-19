#!/usr/bin/env bash
# Testes de integração do app: Postgres local com as migrações + PostgREST de verdade
# (mesma versão do Supabase) + testes do app (vitest) e, com E2E=1, teste no navegador.
#
# Uso: bash supabase/testes/rodar_integracao.sh          # testes da biblioteca
#      E2E=1 bash supabase/testes/rodar_integracao.sh    # + telas no Chromium
#      SO_PRINTS=/pasta E2E=1 bash ...                    # + salva capturas de tela
# Requisitos: Postgres 15+, Node 20+, dependências do app instaladas (cd app && npm install).
set -euo pipefail

AQUI="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$AQUI/../.." && pwd)"
PGRST_BIN="$(python3 -I "$AQUI/baixar_postgrest.py")"

source "$AQUI/postgres_local.sh"
# Fuso diferente de UTC de propósito: as horas voltam com "-03:00" e a biblioteca tem que lidar.
pg_subir "$REPO/supabase" "-c timezone=America/Sao_Paulo"
SQL="$TMP/sql"

"${PSQL[@]}" -f "$SQL/testes/stub_supabase.sql"
for m in "$SQL"/migrations/*.sql; do "${PSQL[@]}" -f "$m"; done
"${PSQL[@]}" -f "$SQL/testes/dados_integracao.sql"

SEGREDO="segredo-somente-para-teste-local-0123456789"
PORTA_PGRST="${PORTA_PGRST:-54330}"
cat > "$TMP/postgrest.conf" <<CONF
db-uri = "postgres://authenticator@/postgres?host=$TMP&port=$PORTA"
db-schemas = "public,storage"
db-anon-role = "anon"
jwt-secret = "$SEGREDO"
server-host = "127.0.0.1"
server-port = $PORTA_PGRST
log-level = "error"
CONF
"$PGRST_BIN" "$TMP/postgrest.conf" > "$TMP/postgrest.log" 2>&1 &
PID_EXTRA=$!
for _ in $(seq 1 40); do
  curl -sf -o /dev/null "http://127.0.0.1:$PORTA_PGRST/" && break
  sleep 0.25
done
curl -sf -o /dev/null "http://127.0.0.1:$PORTA_PGRST/" || { cat "$TMP/postgrest.log"; exit 1; }

export SO_PGRST_URL="http://127.0.0.1:$PORTA_PGRST"
export SO_JWT_SEGREDO="$SEGREDO"
export SO_PG_HOST="$TMP"
export SO_PG_PORT="$PORTA"
# Arquivos enviados ao "armazenamento" do servidor de teste: uma pasta para a rodada inteira.
export SO_ARMAZENAMENTO="$TMP/armazenamento"
mkdir -p "$SO_ARMAZENAMENTO"

# Com E2E=1 roda também testes/telas.e2e.test.ts (app compilado + Chromium).
if [ "${E2E:-}" = "1" ]; then export SO_E2E=1; fi
# testes/guarda_integracao.test.ts falha se algo acima faltar (o CI não fica verde com tudo pulado).
export SO_EXIGIR_INTEGRACAO=1

cd "$REPO/app"
echo "== testes do app (vitest)"
npx vitest run "$@"
