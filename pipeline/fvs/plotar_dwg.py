"""Plota o Model de um DWG de forma num PDF só, com o AutoCAD do PC, sem abrir janela (accoreconsole).

É o caminho direto para a folha única: cada DWG de forma da obra piloto traz o Model inteiro do pavimento, e
os layouts "Trecho 01", "Trecho 02"... só mostram uma parte. Um DWG por pavimento basta.

Uso (no PC, com o AutoCAD instalado):
    py pipeline/fvs/plotar_dwg.py "C:\\...\\EXE.ES.LO.129.FOR3PAVTIP-R03.dwg" --saida "C:\\...\\forma_3_pav.pdf"

Ele trabalha numa cópia (o DWG original não é aberto) e não plota nada no Autodoc: o PDF fica no PC.
No fim, mostra o que pôr no pavimento.json:
    "plotada": {"pdf": "C:\\...\\forma_3_pav.pdf", "escala": 3.13, "nome": "EXE.ES.LO.129.FOR3PAVTIP-R03"}
e aí é só rodar publicar_planta.py como sempre. A leitura é a mesma das pranchas
(camadas PILAR_CONCRETO e VIG_FACES e textos SHX como comentários, com PDFSHX ligado).

Escala: a maior folha do plotador (4A0) é menor que o desenho na escala da prancha. O PDF é vetorial,
então não se perde nada: o leitor recebe o fator entre o PDF e a prancha, medido pela janela maior do
layout do DWG.

As partes puras (o script do AutoCAD e as contas) não precisam do AutoCAD e são testadas em
pipeline/testes/test_fvs_folha_unica.py.
"""

from __future__ import annotations

import argparse
import glob
import json
import pathlib
import re
import shutil
import subprocess
import sys
import tempfile

# a maior folha do plotador de PDF: quanto mais perto do tamanho da prancha, menos o traço muda
PAPEL = "ISO full bleed 4A0 (1682.00 x 2378.00 MM)"
PAPEL_PONTOS = (2378 / 25.4 * 72, 1682 / 25.4 * 72)  # deitada, em pontos
TEMPO_MAXIMO_S = 600


class ErroPlotagem(Exception):
    pass


def achar_accoreconsole(indicado: str | None = None) -> str:
    """O accoreconsole do AutoCAD mais novo instalado."""
    if indicado:
        if not pathlib.Path(indicado).is_file():
            raise ErroPlotagem(f"não achei {indicado}")
        return indicado
    achados = sorted(glob.glob(r"C:\Program Files\Autodesk\AutoCAD *\accoreconsole.exe"))
    if not achados:
        raise ErroPlotagem("não achei o AutoCAD neste PC (accoreconsole.exe). Sem ele não dá para abrir DWG.")
    return achados[-1]


def script_de_informacao(arquivo_info: str) -> str:
    """Grava num arquivo a extensão do Model e a janela maior dos layouts (largura, altura no papel, altura da vista)."""
    caminho = arquivo_info.replace("\\", "/")
    return f"""(setq _arq (open "{caminho}" "w"))
(defun _lista (p) (strcat (rtos (car p) 2 6) " " (rtos (cadr p) 2 6)))
(write-line (strcat "extmin " (_lista (getvar "EXTMIN"))) _arq)
(write-line (strcat "extmax " (_lista (getvar "EXTMAX"))) _arq)
(setq _ss (ssget "X" (list (cons 0 "VIEWPORT"))))
(if _ss (progn (setq _i 0) (repeat (sslength _ss) (setq _e (entget (ssname _ss _i))) (write-line (strcat "janela " (itoa (cdr (assoc 69 _e))) " " (rtos (cdr (assoc 40 _e)) 2 6) " " (rtos (cdr (assoc 41 _e)) 2 6) " " (rtos (cdr (assoc 45 _e)) 2 6)) _arq) (setq _i (1+ _i)))))
(close _arq)
_.QUIT
_Y
"""


def script_de_plotagem(pdf: str, papel: str = PAPEL) -> str:
    """Plota o Model inteiro, em PDF, numa folha só. Cada linha responde a uma pergunta do -PLOT."""
    respostas = [
        "FILEDIA 0",
        "CMDDIA 0",
        "BACKGROUNDPLOT 0",
        "PDFSHX 1",  # texto SHX vira comentário: é de onde o leitor tira o nome das peças
        "TILEMODE 1",
        "-PLOT",
        "Y",  # configuração detalhada
        "Model",
        "DWG To PDF.pc3",
        papel,
        "M",  # milímetros
        "L",  # deitada
        "N",  # não de cabeça para baixo
        "E",  # extensão: tudo o que há no Model
        "F",  # cabe na folha
        "C",  # centrado
        "Y",  # com estilos de plotagem
        ".",  # sem tabela de estilo: a cor e o traço do próprio desenho
        "N",  # sem espessura de linha: a folha é ampliada depois, e o traço engrossaria junto
        "A",  # como está na tela
        f'"{pdf.replace(chr(92), "/")}"',
        "N",  # não guarda a configuração
        "Y",  # plota
        "_.QUIT",
        "_Y",
    ]
    return "\n".join(respostas) + "\n"


def ler_informacao(texto: str) -> dict:
    """Extensão do Model e a janela maior que mostra o Model (a número 1 é a do próprio papel)."""
    numeros = r"(-?[\d.]+(?:[eE][-+]?\d+)?)"
    ext = {}
    for nome in ("extmin", "extmax"):
        m = re.search(rf"^{nome} {numeros} {numeros}", texto, re.M)
        if not m:
            raise ErroPlotagem(f"o AutoCAD não informou {nome}")
        ext[nome] = (float(m.group(1)), float(m.group(2)))
    janelas = []
    for m in re.finditer(rf"^janela (\d+) {numeros} {numeros} {numeros}", texto, re.M):
        ident, largura, altura, vista = int(m.group(1)), float(m.group(2)), float(m.group(3)), float(m.group(4))
        if ident != 1 and vista > 0:
            janelas.append({"largura": largura, "altura": altura, "mm_por_unidade": altura / vista})
    return {**ext, "janelas": sorted(janelas, key=lambda j: -j["largura"] * j["altura"])}


def escala_da_plotagem(info: dict, papel_pontos: tuple[float, float] = PAPEL_PONTOS) -> float:
    """Quantas vezes o PDF é menor que a prancha: pontos por unidade na prancha / pontos por unidade no PDF."""
    if not info["janelas"]:
        raise ErroPlotagem("o DWG não tem layout com janela: não dá para saber a escala da prancha. Passe --escala.")
    na_prancha = info["janelas"][0]["mm_por_unidade"] * 72 / 25.4
    largura = info["extmax"][0] - info["extmin"][0]
    altura = info["extmax"][1] - info["extmin"][1]
    if largura <= 0 or altura <= 0:
        raise ErroPlotagem("o Model do DWG está vazio")
    no_pdf = min(papel_pontos[0] / largura, papel_pontos[1] / altura)
    return na_prancha / no_pdf


def _rodar(console: str, dwg: pathlib.Path, script: pathlib.Path, pasta: pathlib.Path) -> str:
    try:
        r = subprocess.run([console, "/i", str(dwg), "/s", str(script), "/l", "en-US"], cwd=pasta, stdin=subprocess.DEVNULL, capture_output=True, timeout=TEMPO_MAXIMO_S)
    except subprocess.TimeoutExpired as e:
        raise ErroPlotagem(f"o AutoCAD não terminou em {TEMPO_MAXIMO_S} s") from e
    return r.stdout.decode("utf-16-le", "replace") if r.stdout[:2].count(0) or b"\x00" in r.stdout[:40] else r.stdout.decode("utf-8", "replace")


def plotar(dwg: pathlib.Path, saida: pathlib.Path, console: str | None = None) -> dict:
    """Plota numa cópia e devolve {"pdf", "escala", "nome"}, o que vai no pavimento.json."""
    if not dwg.is_file():
        raise ErroPlotagem(f"não achei {dwg}")
    acad = achar_accoreconsole(console)
    saida = saida.resolve()
    saida.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="plotar_dwg_") as t:
        pasta = pathlib.Path(t)
        copia = pasta / "forma.dwg"
        shutil.copy2(dwg, copia)
        (pasta / "info.scr").write_text(script_de_informacao(str(pasta / "info.txt")), encoding="ascii")
        _rodar(acad, copia, pasta / "info.scr", pasta)
        if not (pasta / "info.txt").is_file():
            raise ErroPlotagem("o AutoCAD não respondeu ao abrir o DWG")
        info = ler_informacao((pasta / "info.txt").read_text(encoding="utf-8", errors="replace"))
        pdf_temp = pasta / "forma.pdf"
        (pasta / "plot.scr").write_text(script_de_plotagem(str(pdf_temp)), encoding="ascii")
        log = _rodar(acad, copia, pasta / "plot.scr", pasta)
        if not pdf_temp.is_file():
            raise ErroPlotagem(f"o AutoCAD não gerou o PDF. Fim do que ele respondeu:\n{log[-800:]}")
        shutil.move(str(pdf_temp), saida)
    nome = dwg.stem.split(" - ")[0].strip()
    return {"pdf": str(saida), "escala": round(escala_da_plotagem(info), 4), "nome": nome}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Plota o Model de um DWG de forma num PDF só.")
    ap.add_argument("dwg")
    ap.add_argument("--saida", required=True, help="o PDF (fora do repositório)")
    ap.add_argument("--acad", help="caminho do accoreconsole.exe, se não estiver no lugar de sempre")
    args = ap.parse_args(argv)
    try:
        r = plotar(pathlib.Path(args.dwg), pathlib.Path(args.saida), args.acad)
    except ErroPlotagem as e:
        print(f"PROBLEMA: {e}")
        return 1
    print("Pronto. No pavimento.json, acrescente:")
    print(f'  "plotada": {json.dumps(r, ensure_ascii=False)}')
    return 0


if __name__ == "__main__":
    sys.exit(main())
