# Funções para subir um Postgres descartável. Usado por rodar_testes.sh e rodar_integracao.sh.
# Uso: source postgres_local.sh; pg_subir [opções extras do postgres]; ... ; (para sozinho no fim)
# Variáveis definidas: TMP, PORTA, PGBIN, COMO (prefixo para rodar como usuário postgres), PSQL (array)

PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
PORTA="${PORTA:-54329}"
TMP="$(mktemp -d)"
COMO=()

pg_parar() {
  if [ -n "${PID_EXTRA:-}" ]; then kill "$PID_EXTRA" 2>/dev/null || true; fi
  "${COMO[@]}" "$PGBIN/pg_ctl" -D "$TMP/dados" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
trap pg_parar EXIT

# pg_subir <pasta com os SQL> [opções -c do postgres]
pg_subir() {
  local origem="$1"; shift
  # Cópia dos SQL numa pasta temporária (o usuário postgres precisa conseguir ler).
  cp -r "$origem" "$TMP/sql"
  # initdb não roda como root: usa o usuário postgres do sistema.
  if [ "$(id -u)" = "0" ]; then
    chown -R postgres "$TMP"
    COMO=(runuser -u postgres --)
  fi
  "${COMO[@]}" "$PGBIN/initdb" -D "$TMP/dados" -U postgres -A trust --locale=C.UTF-8 >/dev/null
  "${COMO[@]}" "$PGBIN/pg_ctl" -D "$TMP/dados" -l "$TMP/log" -w \
    -o "-p $PORTA -k $TMP -c listen_addresses='' $*" start >/dev/null
  chmod 755 "$TMP"
  PSQL=("${COMO[@]}" "$PGBIN/psql" -h "$TMP" -p "$PORTA" -U postgres -d postgres -v ON_ERROR_STOP=1 -q -X -o /dev/null)
}
