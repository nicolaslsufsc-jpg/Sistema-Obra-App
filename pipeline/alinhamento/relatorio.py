"""Relatório de conflitos de alinhamento: conflitos_de_alinhamento.json e .csv (abre no Excel).

Cada linha é uma prancha que não alinhou com segurança e por isso ficou FORA do pacote. O encaixe sugerido
vai junto: se alguém conferir e achar que está certo, passa à mão no pavimento.json ("alinhamento").
"""

from __future__ import annotations

import csv
import io
import json
import pathlib

COLUNAS = ("prancha", "camada", "motivo", "pontos", "total", "segundo", "residuo_max_cm", "residuo_medio_cm",
           "escala", "escala_esperada", "nao_bateram", "encaixe_sugerido")


def linha(prancha: str, camada: str, resultado: dict) -> dict:
    """Uma linha do relatório, a partir de Resultado.como_dict()."""
    return {
        "prancha": prancha,
        "camada": camada,
        "motivo": resultado.get("motivo") or "",
        "pontos": resultado.get("pontos"),
        "total": resultado.get("total"),
        "segundo": resultado.get("segundo"),
        "residuo_max_cm": resultado.get("residuo_max_cm"),
        "residuo_medio_cm": resultado.get("residuo_medio_cm"),
        "escala": resultado.get("escala"),
        "escala_esperada": resultado.get("escala_esperada"),
        "nao_bateram": resultado.get("nao_bateram") or [],
        "encaixe_sugerido": resultado.get("transformacao"),
    }


def texto_csv(linhas: list[dict]) -> str:
    """Separado por ";" e com vírgula decimal, como o Excel em português abre."""
    saida = io.StringIO()
    w = csv.writer(saida, delimiter=";", lineterminator="\r\n")
    w.writerow(COLUNAS)
    for l in linhas:
        valores = []
        for c in COLUNAS:
            v = l.get(c)
            if isinstance(v, float):
                v = f"{v:g}".replace(".", ",")
            elif isinstance(v, list):
                v = ", ".join(str(x) for x in v)
            elif isinstance(v, dict):
                v = json.dumps(v, ensure_ascii=False)
            valores.append("" if v is None else v)
        w.writerow(valores)
    return saida.getvalue()


def gravar(pasta: pathlib.Path, linhas: list[dict]) -> list[pathlib.Path]:
    """Grava os dois arquivos na pasta (sem conflito, grava a lista vazia: mostra que foi conferido)."""
    pasta.mkdir(parents=True, exist_ok=True)
    j = pasta / "conflitos_de_alinhamento.json"
    c = pasta / "conflitos_de_alinhamento.csv"
    j.write_text(json.dumps(linhas, ensure_ascii=False, indent=1), encoding="utf-8")
    c.write_bytes(texto_csv(linhas).encode("utf-8-sig"))  # bytes: o Windows não dobra o \r\n
    return [j, c]
