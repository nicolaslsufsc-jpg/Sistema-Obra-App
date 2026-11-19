"""Fichas modelo lidas da tela do Construpoint (modal "Visualizar" de cada modelo), para o
publicar_fichas.py. Formato: [{"campos": {"Identificação", "Título", "Revisão", "Tipos de Modelo"},
"itens": [{"n", "nome": "(ETAPA) Título: descrição", "disp", "tol"}]}].

Só lê o arquivo já salvo no PC: não entra no Construpoint."""

from __future__ import annotations

import re

RE_NOME_CP = re.compile(r"^\(([^)]*)\)\s*(.*)$", re.S)


def _texto(v) -> str:
    return str(v or "").strip()


def reconhece(dados) -> bool:
    """O arquivo é do Construpoint: uma lista de modelos com "campos"."""
    return isinstance(dados, list) and bool(dados) and isinstance(dados[0], dict) and "campos" in dados[0]


def separar_nome_construpoint(nome: str) -> tuple[str, str, str]:
    """"(ETAPA) Título: descrição" ou "(ETAPA) Título - descrição" -> (etapa, título, descrição)."""
    m = RE_NOME_CP.match(nome.strip())
    etapa, resto = (m.group(1).strip(), m.group(2).strip()) if m else ("", nome.strip())
    for sep in (": ", " - "):
        if sep in resto:
            titulo, desc = resto.split(sep, 1)
            return etapa, titulo.strip(), desc.strip()
    return etapa, resto, ""


def aplica_a_pelo_titulo(titulo: str) -> list[str]:
    t = titulo.lower()
    tipos = [tp for tp, palavra in (("P", "pilar"), ("V", "viga"), ("L", "laje")) if palavra in t]
    return tipos


def converter(lista: list[dict]) -> list[dict]:
    fichas = []
    for m in lista:
        c = m["campos"]
        itens = []
        for it in m["itens"]:
            etapa, titulo, desc = separar_nome_construpoint(it["nome"])
            itens.append({"n": int(it["n"]), "etapa": etapa, "titulo": titulo, "descricao": desc,
                          "dispositivo": _texto(it.get("disp")), "tolerancia": _texto(it.get("tol"))})
        titulo = _texto(c.get("Título"))
        fichas.append({"codigo": _texto(c.get("Identificação")), "titulo": titulo, "revisao": _texto(c.get("Revisão")) or "0",
                       "tipo_modelo": _texto(c.get("Tipos de Modelo")) or None, "aplica_a": aplica_a_pelo_titulo(titulo),
                       "itens": itens, "origem": "construpoint"})
    return fichas
