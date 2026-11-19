"""Confere se as migrações da FVS já estão no servidor. Só leitura, sem login, com a chave pública.

Uso (no PC, na raiz do repositório):
    py pipeline/fvs/conferir_servidor.py

Como funciona (docs/modulos/0_nucleo.md): sem login, o servidor responde "permission denied" se a
tabela existe, PGRST205 se ela não existe e 42703 se a coluna não existe. Nenhum dado da obra é lido.

Não dá para conferir sem login a 20261105090000_fvs_ambientes.sql: ela só muda uma regra de uma coluna.
"""

from __future__ import annotations

import json
import pathlib
import sys
import urllib.error
import urllib.request

AQUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parent))

# (o que perguntar, a migração que traz isso)
CONFERIR = [
    ("fichas_modelo?select=id&limit=0", "20261104100000_fvs.sql"),
    ("plantas?select=id&limit=0", "20261104100000_fvs.sql"),
    ("fvs_eventos?select=id&limit=0", "20261104100000_fvs.sql"),
    ("fvs_fotos?select=id&limit=0", "20261104100000_fvs.sql"),
    ("fvs_fichas_campo?select=id&limit=0", "20261105120000_fvs_fichas_campo.sql"),
    ("fvs_eventos?select=ficha_campo_id,verificado_por,origem_id&limit=0", "20261105120000_fvs_fichas_campo.sql"),
    ("fvs_areas?select=id&limit=0", "20261106130000_fvs_areas.sql"),
    ("fvs_eventos?select=area_id&limit=0", "20261106130000_fvs_areas.sql"),
]


def existe(status: int, corpo: bytes) -> bool | None:
    """True: existe. False: falta no servidor. None: não deu para saber (servidor fora do ar, por exemplo)."""
    try:
        codigo = json.loads(corpo.decode("utf-8", "replace")).get("code")
    except (ValueError, AttributeError):
        codigo = None
    if status == 200 or codigo == "42501":  # sem permissão de visitante: a tabela está lá
        return True
    if codigo in ("PGRST205", "42P01", "42703", "PGRST204"):
        return False
    return None


def perguntar(url: str, chave: str, caminho: str) -> tuple[int, bytes]:
    req = urllib.request.Request(f"{url}/rest/v1/{caminho}", headers={"apikey": chave})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def faltando(respostas: dict[str, bool | None]) -> tuple[list[str], list[str]]:
    """(migrações que faltam, migrações que não deu para conferir), a partir de {consulta: existe}."""
    faltam: list[str] = []
    duvida: list[str] = []
    for consulta, migracao in CONFERIR:
        r = respostas.get(consulta)
        if r is False and migracao not in faltam:
            faltam.append(migracao)
        elif r is None and migracao not in duvida:
            duvida.append(migracao)
    return faltam, [m for m in duvida if m not in faltam]


def main() -> int:
    from exportar_obra import CHAVE_PADRAO, URL_PADRAO

    respostas: dict[str, bool | None] = {}
    for consulta, _ in CONFERIR:
        try:
            respostas[consulta] = existe(*perguntar(URL_PADRAO, CHAVE_PADRAO, consulta))
        except OSError:
            respostas[consulta] = None
    faltam, duvida = faltando(respostas)
    for m in duvida:
        print(f"Não consegui conferir {m} (servidor fora do ar ou sem internet?).")
    if faltam:
        print("Falta aplicar no Supabase, nesta ordem (copie o arquivo, cole no editor SQL e rode):")
        for m in faltam:
            print(f"  supabase/migrations/{m}")
        return 1
    if not duvida:
        print("As tabelas e colunas da FVS estão todas no servidor.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
