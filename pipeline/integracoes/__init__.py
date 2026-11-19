"""Galhos de sistemas oficiais externos (docs/modulos/integracoes.md).

Cada sistema é uma pasta aqui dentro (ex.: integracoes/meu_sistema/). O pipeline só usa o que encontrar:
apagou a pasta, os scripts e os testes continuam funcionando, sem nada daquele sistema.

O que um galho pode ter:
- fichas.py com reconhece(dados) -> bool e converter(dados) -> list[dict]: lê as fichas modelo
  exportadas do sistema e devolve no formato do publicar_fichas.py;
- um script que monta o historico.json (formato genérico, lido por publicar_historico.py e pelo app);
- testes/ com os testes dele (rodam pelo pipeline/testes/test_integracoes.py).
"""

from __future__ import annotations

import importlib
import pathlib
from typing import Callable

AQUI = pathlib.Path(__file__).resolve().parent


def galhos() -> list[str]:
    """Os galhos que estão nesta cópia do repositório, em ordem alfabética."""
    return sorted(p.name for p in AQUI.iterdir() if p.is_dir() and (p / "__init__.py").is_file())


def leitor_de_fichas(dados) -> Callable[[object], list[dict]] | None:
    """O conversor do galho que reconhece este arquivo de fichas, ou None."""
    for nome in galhos():
        if not (AQUI / nome / "fichas.py").is_file():
            continue
        modulo = importlib.import_module(f"integracoes.{nome}.fichas")
        if modulo.reconhece(dados):
            return modulo.converter
    return None
