"""Compacta a pasta da obra (dados_obra) num .zip para abrir no tablet: "Abrir pacote da obra (.zip)".

O Chrome do Android não abre pasta, só arquivo. O app lê o .zip em fatias, um arquivo de cada vez: por
isso os .json vão comprimidos e o pacote.bin das plantas vai sem compressão (já é comprimido, e assim o
tablet não precisa descompactar 100 MB na memória).

Uso (no PC, na raiz do repositório):
    py pipeline/fvs/compactar_pacote.py "C:\\...\\dados_obra" --saida "C:\\...\\EXE_pacote.zip" --nome "Obra Exemplo"

O exportar_bancada.py já gera um .zip no mesmo formato; este é para quando só existe a pasta.
Só entra o que o índice cita (manifest.json e pacote.bin de cada planta), mais fichas.json,
historico.json e config_fvs.json (regras da FVS, conferido antes: regras_fvs.py): nada que tenha
ficado solto na pasta, e nenhum atalho. Se o indice.json não tem a
data em que foi gerado ("gerado_em", que o app mostra ao trocar de pacote), vai a data do arquivo.
O .zip tem dados de obra: nunca entra no repositório nem vai para servidor (o script recusa saída
dentro de um repositório). Quem leva ao tablet é a pessoa (cabo, pendrive ou o meio que a empresa aceitar).
"""

from __future__ import annotations

import argparse
import datetime
import json
import pathlib
import sys
import zipfile

AQUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))
sys.path.insert(0, str(AQUI.parent))

import regras_fvs  # noqa: E402
import sistema_oficial  # noqa: E402
from exportar_obra import dentro_de_repositorio  # noqa: E402

PASTA_NO_ZIP = "dados_obra"
SEM_COMPRESSAO = {".bin"}
SOLTOS = ("fichas.json", "historico.json", regras_fvs.NOME_DO_ARQUIVO)


class ErroCompactar(Exception):
    pass


def _arquivo_da_pasta(pasta: pathlib.Path, rel: str) -> bool:
    """Arquivo de verdade dentro da pasta: nem atalho, nem caminho que sai dela (../)."""
    p = pasta / rel
    return p.is_file() and not p.is_symlink() and p.resolve().is_relative_to(pasta)


def _data_valida(valor: object) -> bool:
    try:
        return isinstance(valor, str) and datetime.datetime.fromisoformat(valor) is not None
    except ValueError:
        return False


def compactar(pasta: pathlib.Path, saida: pathlib.Path, nome: str | None = None, sistema: str | None = None) -> dict:
    """Grava o .zip e devolve o resumo (obra, arquivos, tamanho)."""
    pasta = pasta.resolve()
    saida = saida.resolve()
    indice_arq = pasta / "indice.json"
    if not indice_arq.is_file():
        raise ErroCompactar(f"{pasta} não é a pasta da obra: falta o indice.json")
    try:
        indice = json.loads(indice_arq.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        raise ErroCompactar(f"indice.json ilegível: {e}") from e
    if not str(indice.get("obra", "")).strip() or not isinstance(indice.get("pavimentos"), list):
        raise ErroCompactar("indice.json sem obra ou sem pavimentos")
    if saida.suffix.lower() != ".zip":
        raise ErroCompactar("a saída tem que terminar em .zip")
    if dentro_de_repositorio(saida.parent):
        raise ErroCompactar("a saída está dentro de um repositório git: dado de obra não entra no repositório")
    if saida.is_relative_to(pasta):
        raise ErroCompactar("a saída não pode ficar dentro da pasta que está sendo compactada")

    # só o que o índice cita: cada planta inteira (senão o tablet para no meio), sem sair da pasta
    citados = [f"{pl['pasta']}{arquivo}" for pav in indice["pavimentos"] for pl in pav.get("plantas", []) for arquivo in ("manifest.json", "pacote.bin")]
    faltam = [rel for rel in citados if not _arquivo_da_pasta(pasta, rel)]
    if faltam:
        raise ErroCompactar(f"faltam {len(faltam)} arquivo(s) de planta, por exemplo {faltam[0]}")
    arquivos = sorted(set(citados) | {rel for rel in SOLTOS if _arquivo_da_pasta(pasta, rel)})
    # regras da FVS: regra fora do formato para aqui, em vez de sumir calada no tablet
    if regras_fvs.NOME_DO_ARQUIVO in arquivos:
        try:
            regras_fvs.ler(pasta / regras_fvs.NOME_DO_ARQUIVO)
        except regras_fvs.ErroRegrasFvs as e:
            raise ErroCompactar(str(e)) from e

    # o nome por extenso da obra só existe no pacote: o app publicado não leva (08/11, "Tirar o nome")
    if nome and nome.strip():
        indice["nome"] = nome.strip()
    # o sistema oficial da obra (docs/modulos/integracoes.md); sem a opção, fica o que o índice já tem
    try:
        sistema_oficial.aplicar(indice, sistema)
    except ValueError as e:
        raise ErroCompactar(str(e)) from e
    if not _data_valida(indice.get("gerado_em")):
        quando = datetime.datetime.fromtimestamp(indice_arq.stat().st_mtime, datetime.timezone.utc)
        indice["gerado_em"] = quando.isoformat(timespec="seconds")

    temporario = saida.with_suffix(".tmp")
    try:
        with zipfile.ZipFile(temporario, "w") as z:
            for rel in arquivos:
                compressao = zipfile.ZIP_STORED if pathlib.PurePosixPath(rel).suffix.lower() in SEM_COMPRESSAO else zipfile.ZIP_DEFLATED
                z.write(pasta / rel, f"{PASTA_NO_ZIP}/{rel}", compressao)
            # o índice por último (como no exportar_bancada.py), com a data
            z.writestr(f"{PASTA_NO_ZIP}/indice.json", json.dumps(indice, ensure_ascii=False), zipfile.ZIP_DEFLATED)
        if zipfile.ZipFile(temporario).testzip() is not None:
            raise ErroCompactar("o .zip saiu com defeito; tente de novo")
        temporario.replace(saida)
    finally:
        temporario.unlink(missing_ok=True)
    return {"obra": indice["obra"], "arquivos": len(arquivos) + 1, "tamanho_mb": round(saida.stat().st_size / 1e6, 1), "saida": str(saida)}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("pasta", type=pathlib.Path, help="a pasta dados_obra (com o indice.json)")
    ap.add_argument("--saida", type=pathlib.Path, required=True, help="o .zip a gravar, fora do repositório")
    ap.add_argument("--nome", help='nome por extenso da obra, que o app mostra (ex.: "Obra Exemplo"); só vai no .zip')
    ap.add_argument("--sistema-oficial", help="id do sistema oficial da obra (um galho de app/src/integracoes/)")
    args = ap.parse_args(argv)
    try:
        r = compactar(args.pasta, args.saida, args.nome, args.sistema_oficial)
    except ErroCompactar as e:
        print(f"Erro: {e}", file=sys.stderr)
        return 1
    print(f"Obra {r['obra']}: {r['arquivos']} arquivos, {r['tamanho_mb']} MB em {r['saida']}")
    print('No tablet: copie o .zip e use "Abrir pacote da obra (.zip)" no app.')
    return 0


if __name__ == "__main__":
    sys.exit(main())
