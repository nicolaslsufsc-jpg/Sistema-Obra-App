"""Guarda no PC a sessão do Supabase (refresh token) e a identidade deste PC como "aparelho".

Fica em %LOCALAPPDATA%\\SistemaObra\\ (fora do repositório). O refresh token dá acesso ao que o
seu login vê: trate a pasta como você trata a sua senha. Para "sair", apague sessao_supabase.json.
"""

from __future__ import annotations

import json
import os
import pathlib
import uuid

PASTA = pathlib.Path(os.environ.get("LOCALAPPDATA") or pathlib.Path.home()) / "SistemaObra"
ARQUIVO_SESSAO = PASTA / "sessao_supabase.json"
ARQUIVO_DISPOSITIVO = PASTA / "dispositivo.json"


def carregar_sessao() -> dict | None:
    try:
        dados = json.loads(ARQUIVO_SESSAO.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return dados if isinstance(dados, dict) and dados.get("refresh_token") else None


def guardar_sessao(refresh_token: str, email: str | None = None) -> None:
    PASTA.mkdir(parents=True, exist_ok=True)
    dados = {"refresh_token": refresh_token}
    if email:
        dados["email"] = email
    ARQUIVO_SESSAO.write_text(json.dumps(dados, ensure_ascii=False, indent=1), encoding="utf-8")


def esquecer_sessao() -> None:
    try:
        ARQUIVO_SESSAO.unlink()
    except OSError:
        pass


def dispositivo_id() -> str:
    """Um uuid fixo para este PC, gerado na primeira vez (o contrato do núcleo exige dispositivo_id)."""
    try:
        dados = json.loads(ARQUIVO_DISPOSITIVO.read_text(encoding="utf-8"))
        if isinstance(dados, dict) and dados.get("dispositivo_id"):
            return str(uuid.UUID(dados["dispositivo_id"]))
    except (OSError, ValueError):
        pass
    novo = str(uuid.uuid4())
    PASTA.mkdir(parents=True, exist_ok=True)
    ARQUIVO_DISPOSITIVO.write_text(json.dumps({"dispositivo_id": novo, "nome": os.environ.get("COMPUTERNAME", "")}), encoding="utf-8")
    return novo
