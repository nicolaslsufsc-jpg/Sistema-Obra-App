"""Compacta a pasta da obra (dados_obra) num .zip para abrir no tablet: "Abrir pacote da obra (.zip)".

O Chrome do Android não abre pasta, só arquivo. O app lê o .zip em fatias, um arquivo de cada vez: por
isso os .json vão comprimidos e o pacote.bin das plantas vai sem compressão (já é comprimido, e assim o
tablet não precisa descompactar 100 MB na memória).

Uso (no PC, na raiz do repositório):
    py pipeline/fvs/compactar_pacote.py "C:\\...\\dados_obra" --saida "C:\\...\\EXE_pacote.zip" --nome "Obra Exemplo"

O exportar_bancada.py já gera um .zip no mesmo formato; este é para quando só existe a pasta.

Documentos da empresa (módulo Documentos, app/src/documentos/pacote.ts) vão em dados_obra/documentos/,
como no exportar_bancada.py:
- com --documentos PASTA: a pasta com documentos.json e os arquivos, no mesmo formato e com a mesma
  conferência do exportar_bancada.py (ler_documentos);
- sem a opção: se a pasta da obra já tem documentos/indice.json (de um pacote extraído, por exemplo),
  ele vai junto com os arquivos que cita, conferidos um a um (tipo, tamanho até 10 MB e SHA-256).
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
from exportar_bancada import LIMITE_DOC, TIPOS_DOC, ErroExportacaoBancada, _sha256, ler_documentos  # noqa: E402
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


def _documentos_da_pasta(pasta: pathlib.Path) -> tuple[dict, list[tuple[str, pathlib.Path]]] | None:
    """documentos/indice.json que já está na pasta da obra (formato do app) e os arquivos que ele cita, conferidos."""
    raiz = pasta / "documentos"
    if not _arquivo_da_pasta(pasta, "documentos/indice.json"):
        return None
    try:
        docs = json.loads((raiz / "indice.json").read_text(encoding="utf-8"))
    except ValueError as e:
        raise ErroCompactar(f"documentos/indice.json ilegível: {e}") from e
    if not isinstance(docs, dict) or not isinstance(docs.get("documentos"), list):
        raise ErroCompactar("documentos/indice.json sem a lista de documentos")
    arquivos: list[tuple[str, pathlib.Path]] = []
    for i, d in enumerate(docs["documentos"], 1):
        a = d.get("arquivo") if isinstance(d, dict) else None
        if not a:
            continue
        onde = f"documento {i} ({d.get('codigo') or 'sem código'})"
        caminho = str(a.get("caminho") or "") if isinstance(a, dict) else ""
        origem = raiz / caminho
        if not caminho or not _arquivo_da_pasta(raiz.resolve(), caminho):
            raise ErroCompactar(f"{onde}: arquivo {caminho!r} não está em documentos/")
        if TIPOS_DOC.get(origem.suffix.lower()) is None:
            raise ErroCompactar(f"{onde}: só PDF ou foto (jpg, png, webp, heic)")
        tamanho = origem.stat().st_size
        if tamanho == 0 or tamanho > LIMITE_DOC or tamanho != a.get("tamanho"):
            raise ErroCompactar(f"{onde}: arquivo vazio, maior que 10 MB ou com tamanho diferente do índice")
        if _sha256(origem) != a.get("sha256"):
            raise ErroCompactar(f"{onde}: arquivo não confere com o SHA-256 do índice")
        arquivos.append((caminho, origem))
    return docs, arquivos


def compactar(pasta: pathlib.Path, saida: pathlib.Path, nome: str | None = None, sistema: str | None = None,
              documentos: pathlib.Path | None = None) -> dict:
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
    # testador (08/11, T4): pasta de saída que não existe dava FileNotFoundError em inglês
    if not saida.parent.is_dir():
        raise ErroCompactar(f"a pasta da saída não existe: {saida.parent} (crie a pasta ou escolha outra)")
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
    # documentos da empresa: a pasta pedida ou, sem ela, o que já está em documentos/ (conferido antes de gravar)
    if documentos is not None:
        try:
            docs = ler_documentos(documentos.resolve())
        except ErroExportacaoBancada as e:
            raise ErroCompactar(str(e)) from e
    else:
        docs = _documentos_da_pasta(pasta)
    if not _data_valida(indice.get("gerado_em")):
        quando = datetime.datetime.fromtimestamp(indice_arq.stat().st_mtime, datetime.timezone.utc)
        indice["gerado_em"] = quando.isoformat(timespec="seconds")

    temporario = saida.with_suffix(".tmp")
    try:
        with zipfile.ZipFile(temporario, "w") as z:
            for rel in arquivos:
                compressao = zipfile.ZIP_STORED if pathlib.PurePosixPath(rel).suffix.lower() in SEM_COMPRESSAO else zipfile.ZIP_DEFLATED
                z.write(pasta / rel, f"{PASTA_NO_ZIP}/{rel}", compressao)
            if docs is not None:
                for caminho, origem in docs[1]:
                    z.write(origem, f"{PASTA_NO_ZIP}/documentos/{caminho}", zipfile.ZIP_DEFLATED)
                z.writestr(f"{PASTA_NO_ZIP}/documentos/indice.json", json.dumps(docs[0], ensure_ascii=False), zipfile.ZIP_DEFLATED)
            # o índice por último (como no exportar_bancada.py), com a data
            z.writestr(f"{PASTA_NO_ZIP}/indice.json", json.dumps(indice, ensure_ascii=False), zipfile.ZIP_DEFLATED)
        if zipfile.ZipFile(temporario).testzip() is not None:
            raise ErroCompactar("o .zip saiu com defeito; tente de novo")
        temporario.replace(saida)
    finally:
        temporario.unlink(missing_ok=True)
    n_docs = len(docs[0]["documentos"]) if docs else 0
    n_arquivos = len(arquivos) + 1 + (len(docs[1]) + 1 if docs else 0)
    return {"obra": indice["obra"], "arquivos": n_arquivos, "documentos": n_docs, "tamanho_mb": round(saida.stat().st_size / 1e6, 1), "saida": str(saida)}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("pasta", type=pathlib.Path, help="a pasta dados_obra (com o indice.json)")
    ap.add_argument("--saida", type=pathlib.Path, required=True, help="o .zip a gravar, fora do repositório")
    ap.add_argument("--nome", help='nome por extenso da obra, que o app mostra (ex.: "Obra Exemplo"); só vai no .zip')
    ap.add_argument("--documentos", type=pathlib.Path, help="pasta com documentos.json e os arquivos dos documentos da empresa (opcional)")
    ap.add_argument("--sistema-oficial", help="id do sistema oficial da obra (um galho de app/src/integracoes/)")
    args = ap.parse_args(argv)
    # testador (08/11, Z4): no terminal do Windows os acentos saíam quebrados ("sa�da")
    for fluxo in (sys.stdout, sys.stderr):
        try:
            fluxo.reconfigure(encoding="utf-8", errors="replace")
        except (AttributeError, ValueError):
            pass
    try:
        r = compactar(args.pasta, args.saida, args.nome, args.sistema_oficial, args.documentos)
    except ErroCompactar as e:
        print(f"Erro: {e}", file=sys.stderr)
        return 1
    print(f"Obra {r['obra']}: {r['arquivos']} arquivos ({r['documentos']} documentos), {r['tamanho_mb']} MB em {r['saida']}")
    print('No tablet: copie o .zip e use "Abrir pacote da obra (.zip)" no app.')
    return 0


if __name__ == "__main__":
    sys.exit(main())
