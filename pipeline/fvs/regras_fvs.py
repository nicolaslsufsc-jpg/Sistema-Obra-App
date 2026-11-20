"""Confere o config_fvs.json (regras da FVS da obra: prazos e ligações entre itens das fichas).

O arquivo vai no pacote da obra (dados_obra/config_fvs.json) e o app grava como a linha de fvs_regras
da obra (app/src/nucleo/pacote_obra.ts). O pacote local não passa pelo banco, então a conferência é
aqui, igual à do gatilho da migração 20261119120000_fvs_regras.sql: mudou lá, mude aqui. Sem isto,
uma regra torta (prazo com "dias": null, por exemplo) sumiria calada no aparelho.

Formato:
    {"prazos":   [{"id": "texto", "ficha": "codigo", "item": 12, "dias": 21,
                   "depois_de": {"tipo": "concretagem"} | {"tipo": "item", "ficha": "codigo", "item": 3},
                   "texto": "opcional"}],
     "ligacoes": [{"id": "texto", "de": {"ficha": "codigo", "item": 5}, "para": {"ficha": "codigo", "item": 2}}]}
"prazos" e "ligacoes" podem faltar (lista vazia). Campo a mais numa regra passa, como no banco.
"""

from __future__ import annotations

import json
import pathlib

NOME_DO_ARQUIVO = "config_fvs.json"
LISTAS = ("prazos", "ligacoes")


class ErroRegrasFvs(ValueError):
    pass


def _inteiro(v: object, minimo: int, maximo: int) -> bool:
    if isinstance(v, bool) or not isinstance(v, (int, float)):
        return False
    return float(v).is_integer() and minimo <= v <= maximo


def _ref(v: object) -> bool:
    """{"ficha": "codigo", "item": n}: código de 1 a 40 letras, item de 1 a 999."""
    return isinstance(v, dict) and isinstance(v.get("ficha"), str) and 1 <= len(v["ficha"]) <= 40 and _inteiro(v.get("item"), 1, 999)


def _mesmo_item(a: dict, b: dict) -> bool:
    return a["ficha"] == b["ficha"] and int(a["item"]) == int(b["item"])


def conferir(config: object) -> dict:
    """Devolve {"prazos": n, "ligacoes": n}; regra fora do formato levanta ErroRegrasFvs dizendo qual."""
    if not isinstance(config, dict):
        raise ErroRegrasFvs('as regras da FVS têm que ser um objeto {"prazos": [...], "ligacoes": [...]}')
    for lista in LISTAS:
        itens = config.get(lista, [])
        if not isinstance(itens, list) or len(itens) > 1000:
            raise ErroRegrasFvs(f'"{lista}" tem que ser uma lista (até 1000)')
        ids: set[str] = set()
        for it in itens:
            if not isinstance(it, dict) or not isinstance(it.get("id"), str) or not 1 <= len(it["id"]) <= 80:
                raise ErroRegrasFvs(f'regra em "{lista}" sem id')
            rid = it["id"]
            if rid in ids:
                raise ErroRegrasFvs(f'id repetido em "{lista}" ({rid})')
            ids.add(rid)
            if lista == "prazos":
                _conferir_prazo(rid, it)
            else:
                _conferir_ligacao(rid, it)
    return {lista: len(config.get(lista, [])) for lista in LISTAS}


def _conferir_prazo(rid: str, p: dict) -> None:
    if not _ref(p):
        raise ErroRegrasFvs(f'prazo "{rid}" sem ficha ou com número de item inválido')
    if not _inteiro(p.get("dias"), 0, 365):
        raise ErroRegrasFvs(f'prazo "{rid}" com dias fora de 0 a 365 (dias: {p.get("dias")!r})')
    d = p.get("depois_de")
    if not isinstance(d, dict) or d.get("tipo") not in ("concretagem", "item"):
        raise ErroRegrasFvs(f'prazo "{rid}" sem "depois_de" (concretagem ou item)')
    if d["tipo"] == "item":
        if not _ref(d):
            raise ErroRegrasFvs(f'prazo "{rid}": "depois_de" sem ficha ou com número de item inválido')
        if _mesmo_item(p, d):
            raise ErroRegrasFvs(f'prazo "{rid}" conta a partir do próprio item')
    texto = p.get("texto")
    if texto is not None and (not isinstance(texto, str) or len(texto) > 500):
        raise ErroRegrasFvs(f'texto do prazo "{rid}" inválido ou longo demais')


def _conferir_ligacao(rid: str, lig: dict) -> None:
    de, para = lig.get("de"), lig.get("para")
    if not _ref(de) or not _ref(para):
        raise ErroRegrasFvs(f'ligação "{rid}" sem ficha ou com número de item inválido')
    if _mesmo_item(de, para):
        raise ErroRegrasFvs(f'ligação "{rid}" liga o item a ele mesmo')


def ler(arquivo: pathlib.Path) -> tuple[dict, dict]:
    """Lê e confere o arquivo. Devolve (o objeto inteiro, {"prazos": n, "ligacoes": n})."""
    try:
        config = json.loads(arquivo.read_text(encoding="utf-8-sig"))
    except ValueError as e:
        raise ErroRegrasFvs(f"{arquivo} não é JSON válido: {e}") from e
    try:
        return config, conferir(config)
    except ErroRegrasFvs as e:
        raise ErroRegrasFvs(f"{arquivo.name}: {e}") from e
