"""Empacota os dados da obra para a bancada rodar num PC sem Python (o "PC da empresa").

Faz num zip o que bancada.py faz na hora: indice.json, fichas.json, historico.json e os pacotes de
planta. Quem entrega ao navegador é o servidor.ps1 do pacote de pipeline/fvs/montar_entrega.py.

Uso (no PC, na raiz do repositório):
    py pipeline/fvs/exportar_bancada.py "C:\\...\\pacotes" --saida "C:\\...\\dados_obra_FVS.zip" ^
        --fichas "C:\\...\\fichas_da_empresa.json" --fichas "C:\\...\\fichas_ambientes.json" ^
        --historico "C:\\...\\historico.json" --documentos "C:\\...\\documentos_da_empresa" --sistema-oficial ID_DO_SISTEMA

--documentos (opcional): pasta com um documentos.json e os arquivos (PDF ou foto) dos documentos da
empresa (Manual, procedimentos, PES, modelos). Vão no zip em dados_obra/documentos/ e o app grava
como registros baixados, igual às fichas (app/src/documentos/pacote.ts). Formato do documentos.json:
    [{"categoria": "sistema", "codigo": "EXE-MQ", "titulo": "Manual da Qualidade", "revisao": "03",
      "data_revisao": "2026-02-01", "validade": null, "responsavel": "Qualidade",
      "situacao": "vigente", "observacao": null, "arquivo": "manual.pdf"}]

O zip tem dados de obra: nunca entra no repositório nem vai para servidor (o script recusa saída
dentro de um repositório). Quem leva é a pessoa, em mãos.
"""

from __future__ import annotations

import argparse
import datetime
import hashlib
import json
import pathlib
import re
import sys
import zipfile

AQUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))
sys.path.insert(0, str(AQUI.parent))

import bancada  # noqa: E402
import sistema_oficial  # noqa: E402
from exportar_obra import dentro_de_repositorio  # noqa: E402

PASTA_NO_ZIP = "dados_obra"
# Igual a app/src/documentos/categorias.ts e regras.ts (LIMITE_ARQUIVO): mudou lá, mude aqui.
CATEGORIAS_DOC = {"sistema", "procedimentos", "pes", "fvs", "materiais", "fornecedores", "pessoas", "equipamentos", "pqo", "controle_tecnologico", "nc", "auditoria", "cliente", "outros"}
LIMITE_DOC = 10 * 1024 * 1024
TIPOS_DOC = {".pdf": "application/pdf", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".heic": "image/heic"}  # igual a TIPOS_ACEITOS (regras.ts): nada de SVG
_DATA = re.compile(r"^\d{4}-\d{2}-\d{2}$")


class ErroExportacaoBancada(Exception):
    pass


def _sha256(caminho: pathlib.Path) -> str:
    h = hashlib.sha256()
    with caminho.open("rb") as f:
        for bloco in iter(lambda: f.read(1024 * 1024), b""):
            h.update(bloco)
    return h.hexdigest()


def ler_documentos(pasta: pathlib.Path) -> tuple[dict, list[tuple[str, pathlib.Path]]]:
    """Confere a pasta de documentos da empresa. Devolve o indice.json do app e os arquivos (caminho no zip, origem)."""
    lista_json = pasta / "documentos.json"
    if not lista_json.is_file():
        raise ErroExportacaoBancada(f"falta {lista_json}")
    try:
        lista = json.loads(lista_json.read_text(encoding="utf-8"))
    except ValueError as e:
        raise ErroExportacaoBancada(f"{lista_json} não é JSON válido: {e}") from e
    if not isinstance(lista, list):
        raise ErroExportacaoBancada(f"{lista_json} deve ser uma lista de documentos")
    docs, arquivos, vistos = [], [], set()
    for i, d in enumerate(lista, 1):
        if not isinstance(d, dict):
            raise ErroExportacaoBancada(f"documento {i}: não é um objeto")
        cod = str(d.get("codigo") or "").strip().upper()
        onde = f"documento {i} ({cod or 'sem código'})"
        for campo in ("codigo", "titulo", "revisao", "responsavel"):
            if not str(d.get(campo) or "").strip():
                raise ErroExportacaoBancada(f"{onde}: falta {campo}")
        if d.get("categoria") not in CATEGORIAS_DOC:
            raise ErroExportacaoBancada(f"{onde}: categoria {d.get('categoria')!r} não existe no app")
        if not _DATA.match(str(d.get("data_revisao") or "")):
            raise ErroExportacaoBancada(f"{onde}: data_revisao fora do formato AAAA-MM-DD")
        if d.get("validade") and not _DATA.match(str(d["validade"])):
            raise ErroExportacaoBancada(f"{onde}: validade fora do formato AAAA-MM-DD")
        if d.get("situacao", "vigente") not in ("vigente", "em_revisao"):
            raise ErroExportacaoBancada(f"{onde}: situacao deve ser vigente ou em_revisao")
        chave = (cod, str(d["revisao"]).strip())
        if chave in vistos:
            raise ErroExportacaoBancada(f"{onde}: revisão repetida")
        vistos.add(chave)
        arquivo = None
        if d.get("arquivo"):
            origem = (pasta / str(d["arquivo"])).resolve()
            if pasta.resolve() not in origem.parents or not origem.is_file():
                raise ErroExportacaoBancada(f"{onde}: arquivo {d['arquivo']!r} não está na pasta")
            tipo = TIPOS_DOC.get(origem.suffix.lower())
            if not tipo:
                raise ErroExportacaoBancada(f"{onde}: só PDF ou foto (jpg, png, webp)")
            tamanho = origem.stat().st_size
            if tamanho == 0 or tamanho > LIMITE_DOC:
                raise ErroExportacaoBancada(f"{onde}: arquivo vazio ou maior que 10 MB")
            caminho = f"arquivos/{len(arquivos) + 1:03d}{origem.suffix.lower()}"
            arquivos.append((caminho, origem))
            arquivo = {"caminho": caminho, "nome": origem.name, "tipo": tipo, "tamanho": tamanho, "sha256": _sha256(origem)}
        docs.append({
            "categoria": d["categoria"], "codigo": cod, "titulo": str(d["titulo"]).strip(), "revisao": str(d["revisao"]).strip(),
            "data_revisao": d["data_revisao"], "validade": d.get("validade") or None, "responsavel": str(d["responsavel"]).strip(),
            "situacao": d.get("situacao", "vigente"), "observacao": d.get("observacao") or None, "arquivo": arquivo,
        })
    return {"documentos": docs}, arquivos


def exportar(pacotes: pathlib.Path, fichas: list[dict], historico: pathlib.Path | None, saida: pathlib.Path, nome: str | None = None,
             documentos: pathlib.Path | None = None, sistema: str | None = None) -> dict:
    """Grava o zip e devolve o resumo. Confere cada arquivo com o SHA-256 do relatório antes de incluir."""
    saida = saida.resolve()
    if dentro_de_repositorio(saida.parent):
        raise ErroExportacaoBancada("a saída está dentro de um repositório git: dado de obra não entra no repositório")
    indice = bancada.montar_indice(pacotes)
    # o app mostra a data ao trocar de pacote e pede confirmação se for mais antigo que o do aparelho
    # o nome por extenso da obra só existe aqui, no pacote: o app publicado não leva (08/11, "Tirar o nome")
    if nome and nome.strip():
        indice["nome"] = nome.strip()
    # o sistema oficial da obra (docs/modulos/integracoes.md); sem ele, o app não mostra nada de sistema oficial
    sistema_oficial.aplicar(indice, sistema)
    indice["gerado_em"] = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")
    plantas = [pl for pav in indice["pavimentos"] for pl in pav["plantas"]]
    if not plantas:
        raise ErroExportacaoBancada(f"nenhuma planta em {pacotes}")
    docs, arquivos_doc = ler_documentos(documentos) if documentos else (None, [])
    temporario = saida.with_suffix(".tmp")
    tamanho = 0
    try:
        with zipfile.ZipFile(temporario, "w") as z:
            z.writestr(f"{PASTA_NO_ZIP}/fichas.json", json.dumps(fichas, ensure_ascii=False), zipfile.ZIP_DEFLATED)
            if historico:
                z.write(historico, f"{PASTA_NO_ZIP}/historico.json", zipfile.ZIP_DEFLATED)
            for pl in plantas:
                for nome, chave, compressao in (("manifest.json", "manifest", zipfile.ZIP_DEFLATED), ("pacote.bin", "pacote", zipfile.ZIP_STORED)):
                    arq = pacotes / pl["pasta"] / nome
                    if not arq.is_file():
                        raise ErroExportacaoBancada(f"falta {arq}")
                    if _sha256(arq) != pl[chave]["sha256"]:
                        raise ErroExportacaoBancada(f"{arq} não confere com o relatório do pavimento: gere de novo")
                    z.write(arq, f"{PASTA_NO_ZIP}/{pl['pasta']}{nome}", compressao)
                    tamanho += arq.stat().st_size
            if docs is not None:
                for caminho, origem in arquivos_doc:
                    z.write(origem, f"{PASTA_NO_ZIP}/documentos/{caminho}", zipfile.ZIP_DEFLATED)
                z.writestr(f"{PASTA_NO_ZIP}/documentos/indice.json", json.dumps(docs, ensure_ascii=False), zipfile.ZIP_DEFLATED)
            # por último: quem extrai dá os dados por prontos quando acha o índice. Se a janela
            # fechar no meio da extração, não há índice e a próxima abertura extrai de novo.
            z.writestr(f"{PASTA_NO_ZIP}/indice.json", json.dumps(indice, ensure_ascii=False), zipfile.ZIP_DEFLATED)
        temporario.replace(saida)
    finally:
        temporario.unlink(missing_ok=True)
    return {"pavimentos": len(indice["pavimentos"]), "plantas": len(plantas), "fichas": len(fichas), "documentos": len(docs["documentos"]) if docs else 0, "mb_pacotes": round(tamanho / 1e6, 1), "mb_zip": round(saida.stat().st_size / 1e6, 1)}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Empacota os dados da obra para a bancada sem Python.")
    ap.add_argument("pacotes")
    ap.add_argument("--saida", required=True)
    ap.add_argument("--fichas", action="append", default=[])
    ap.add_argument("--historico")
    ap.add_argument("--documentos", help="pasta com documentos.json e os arquivos dos documentos da empresa (opcional)")
    ap.add_argument("--nome", help='nome por extenso da obra, que o app mostra (ex.: "Obra Exemplo"); só vai no pacote')
    ap.add_argument("--sistema-oficial", help="id do sistema oficial da obra (um galho de app/src/integracoes/); sem ele, o app não mostra nada de sistema oficial")
    args = ap.parse_args(argv)
    try:
        fichas = bancada.ler_fichas(args.fichas or [str(AQUI.parent / "legado" / "itens_fvs.exemplo.json")])
        r = exportar(pathlib.Path(args.pacotes).resolve(), fichas, pathlib.Path(args.historico) if args.historico else None, pathlib.Path(args.saida), args.nome, pathlib.Path(args.documentos) if args.documentos else None, args.sistema_oficial)
    except (ErroExportacaoBancada, OSError, ValueError) as e:
        print(f"PROBLEMA: {e}")
        return 1
    print(f"{r['pavimentos']} pavimentos, {r['plantas']} plantas, {r['fichas']} fichas, {r['documentos']} documentos; {r['mb_zip']} MB em {args.saida}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
