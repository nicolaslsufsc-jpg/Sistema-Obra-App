"""Campo sistema_oficial do pacote da obra (docs/modulos/integracoes.md).

O pacote diz qual sistema oficial externo a obra usa (o id de um galho em app/src/integracoes/ e
pipeline/integracoes/). Sem o campo, o app não mostra nada de sistema oficial.
"""

from __future__ import annotations

import re

_ID = re.compile(r"^[a-z0-9_-]{1,40}$")


def validar(valor: str | None) -> str | None:
    """O id em minúsculas, ou None se vazio. Recusa o que não parece um id (letras, números, - e _)."""
    if valor is None or not valor.strip():
        return None
    v = valor.strip().lower()
    if not _ID.match(v):
        raise ValueError(f"sistema oficial inválido: {valor!r} (use só letras, números, - e _)")
    return v


def aplicar(indice: dict, valor: str | None) -> dict:
    """Grava o campo no índice quando veio um valor; sem valor, deixa o índice como está."""
    v = validar(valor)
    if v:
        indice["sistema_oficial"] = v
    return indice
