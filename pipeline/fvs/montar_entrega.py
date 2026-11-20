"""Monta o pacote que roda num PC sem nada instalado (o "PC da empresa"): baixa do GitHub, extrai e abre.

Tem o app compilado, a bancada da FVS compilada e os arquivos de abrir (pipeline/fvs/pc_empresa/).
Não tem dado de obra: a conferência no fim recusa o que parecer dado, porque este pacote vai para o
GitHub. Os dados da obra vão à parte, em mãos (exportar_bancada.py).

Uso (no PC, na raiz do repositório):
    py pipeline/fvs/montar_entrega.py PASTA_DE_SAIDA
"""

from __future__ import annotations

import argparse
import datetime as dt
import pathlib
import shutil
import subprocess
import sys
import time

AQUI = pathlib.Path(__file__).resolve().parent
RAIZ = AQUI.parents[1]
APP = RAIZ / "app"
MODELOS = AQUI / "pc_empresa"

# o que nunca pode estar no pacote: dado de obra ou o que só existe com dado de obra
SUFIXOS_PROIBIDOS = {".bin", ".pdf", ".dwg", ".dxf", ".ifc", ".csv", ".xlsx", ".xls", ".zip", ".jpg", ".jpeg"}
NOMES_PROIBIDOS = {"indice.json", "fichas.json", "historico.json", "manifest.json", "relatorio.json", "itens_fvs.json", "config_fvs.json"}
LIMITE_MB = 20
# abrem em programas do Windows: fim de linha do Windows. Os com acento levam a marca de UTF-8,
# sem a qual o PowerShell 5 e o Bloco de Notas antigo leem errado.
COM_MARCA = {".ps1", ".txt"}
FIM_DE_LINHA_WINDOWS = {".ps1", ".txt", ".bat"}


class ErroEntrega(Exception):
    pass


def texto_para_windows(texto: str, sufixo: str) -> bytes:
    if sufixo in FIM_DE_LINHA_WINDOWS:
        texto = texto.replace("\r\n", "\n").replace("\n", "\r\n")
    corpo = texto.encode("utf-8")
    return b"\xef\xbb\xbf" + corpo if sufixo in COM_MARCA else corpo


def conferir_sem_dados(pasta: pathlib.Path) -> float:
    """Recusa o pacote se houver cara de dado de obra. Devolve o tamanho em MB."""
    total = 0
    for arq in pasta.rglob("*"):
        if not arq.is_file():
            continue
        if arq.suffix.lower() in SUFIXOS_PROIBIDOS or arq.name.lower() in NOMES_PROIBIDOS:
            raise ErroEntrega(f"isto parece dado de obra e o pacote vai para o GitHub: {arq.relative_to(pasta)}")
        total += arq.stat().st_size
    mb = total / 1e6
    if mb > LIMITE_MB:
        raise ErroEntrega(f"o pacote ficou com {mb:.0f} MB (limite {LIMITE_MB} MB): algo a mais entrou")
    return mb


def _rodar(comando: str, pasta: pathlib.Path) -> None:
    r = subprocess.run(comando, cwd=pasta, shell=True, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if r.returncode != 0:
        raise ErroEntrega(f"falhou: {comando}\n{r.stdout[-1500:]}\n{r.stderr[-1500:]}")


def _apagar(pasta: pathlib.Path) -> None:
    """No Windows, o antivírus segura por um instante o arquivo recém-gravado: tenta de novo."""
    for tentativa in range(6):
        try:
            if pasta.exists():
                shutil.rmtree(pasta)
            return
        except PermissionError:
            if tentativa == 5:
                raise
            time.sleep(1)


def montar(saida: pathlib.Path) -> float:
    saida = saida.resolve()
    if (RAIZ / ".git").exists() and saida.is_relative_to(RAIZ):
        raise ErroEntrega("a saída não pode ficar dentro do repositório")
    _apagar(saida)
    saida.mkdir(parents=True)
    _rodar("npm run build", APP)
    shutil.copytree(APP / "dist", saida / "site_app")
    _rodar(f'npx vite build --config vite.bancada.config.ts --outDir "{saida / "site_bancada"}" --emptyOutDir', APP)
    for modelo in sorted(MODELOS.iterdir()):
        if modelo.is_file():
            (saida / modelo.name).write_bytes(texto_para_windows(modelo.read_text(encoding="utf-8"), modelo.suffix.lower()))
    # o que está aqui é byte a byte o que deve chegar ao Windows: o git não pode converter nada
    (saida / ".gitattributes").write_text("* -text\n", encoding="utf-8")
    versao = subprocess.run("git rev-parse --short HEAD", cwd=RAIZ, shell=True, capture_output=True, text=True).stdout.strip()
    branch = subprocess.run("git branch --show-current", cwd=RAIZ, shell=True, capture_output=True, text=True).stdout.strip() or "modulo/fvs"
    pendente = subprocess.run("git status --porcelain", cwd=RAIZ, shell=True, capture_output=True, text=True).stdout.strip()
    extra = " + mudanças ainda sem commit" if pendente else ""
    (saida / "VERSAO.txt").write_bytes(texto_para_windows(f"Commit {versao}{extra}, branch {branch}, montado em {dt.date.today().isoformat()}.\n", ".txt"))
    return conferir_sem_dados(saida)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Monta o pacote do PC da empresa (sem dados de obra).")
    ap.add_argument("saida")
    args = ap.parse_args(argv)
    try:
        mb = montar(pathlib.Path(args.saida))
    except ErroEntrega as e:
        print(f"PROBLEMA: {e}")
        return 1
    print(f"Pacote pronto em {args.saida}: {mb:.1f} MB, sem dados de obra.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
