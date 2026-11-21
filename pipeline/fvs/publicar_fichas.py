"""Publica fichas (PVS) na tabela fichas_modelo de uma obra (módulo FVS).

Uso (no PC, na raiz do repositório):
    py pipeline/fvs/publicar_fichas.py EXE fichas.json
    py pipeline/fvs/publicar_fichas.py OBRA fichas_da_empresa.json      (fichas de pilar e viga no formato do HTML legado)
    py pipeline/fvs/publicar_fichas.py EXE fichas.json --so-conferir            (só mostra o que entraria)
    py pipeline/fvs/publicar_fichas.py EXE fichas_ambiente.json --aplica-a A    (fichas por ambiente: alvenaria, reboco...)

Aceita três formatos de arquivo:
  1. o do sistema: [{"codigo", "titulo", "revisao", "tipo_modelo", "aplica_a": ["P"], "itens": [{"n", "etapa",
     "titulo", "descricao", "dispositivo", "tolerancia", "parte"}]}]
     "parte" (opcional, só em ficha de pilar): "consolo" ou "capitel". O item só vale no pilar que tem a
     parte na planta (exemplo: pipeline/fvs/fichas_partes.exemplo.json).
     "furos": true (opcional, só em ficha de viga, um por ficha): o item de furação, que os furos marcam.
     "barras": true (opcional, só em ficha de laje, um por ficha): o item de armadura, que as barras de aço
     da laje marcam na planta (exemplo: pipeline/fvs/fichas_laje.exemplo.json).
     "concretagem": true/false (opcional): a etapa da concretagem marcada à mão (sem a marca, o app
     adivinha pelo nome da etapa).
     "rastreio_concreto": true (opcional, só em ficha de pilar ou de viga, um por ficha): o item que o
     módulo Concreto marca quando a peça tem caminhão lançado.
     "instalacao": "esgoto", "agua" ou "eletrica" (opcional, só em ficha de laje, uma de cada por ficha): o
     item dos pontos de instalação na laje. Esgoto e água são marcados pelos furos de laje (SAN e HID) da
     área; a elétrica fica à mão, e furo elétrico errado deixa o item NC (item 4, 19/11/2026).
     "esquadrias": true (opcional, só em ficha de ambiente, um ou mais por ficha): item de vão ou esquadria
     ("eixos e vãos", "requadros", "recorte na porta"), que as esquadrias do ambiente marcam, uma a uma.
     "pontos": "hidro" ou "sanitario" (opcional, só em ficha de ambiente): o item que os pontos de instalação
     daquela disciplina marcam na planta dela, um a um (pipeline/fvs/instalacoes.py, 20/11/2026).
  2. o do HTML legado (exemplo: pipeline/legado/itens_fvs.exemplo.json): {"P": {"codigo", "titulo", "itens": [...]}, "V": {...}}
     (as marcas "parte", "furos", "barras", "concretagem", "rastreio_concreto", "instalacao", "esquadrias" e "pontos" passam como no formato 1)
  3. o de um sistema oficial, quando o galho dele está em pipeline/integracoes/ (docs/modulos/integracoes.md):
     o galho reconhece o arquivo e converte para o formato 1.

Ficha que já existe na obra com o mesmo código e revisão fica como está (não duplica).
O conteúdo das fichas é da empresa: o arquivo fica fora do repositório. No repositório, só o exemplo fictício.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import pathlib
import re
import sys
import uuid

AQUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))
sys.path.insert(0, str(AQUI.parent))
sys.path.insert(0, str(AQUI.parent / "projetos"))

import integracoes  # noqa: E402
from exportar_obra import CHAVE_PADRAO, URL_PADRAO, ErroExportacao, Supabase  # noqa: E402

# Fichas no formato do HTML legado: o código e o título de cada ficha vêm do próprio arquivo
# ("codigo" e "titulo" em cada tipo). Nada da empresa fica fixo aqui.
TIPOS_LEGADO = ("P", "V")
# P pilar, V viga, L laje, A ambiente (ficha por ambiente: alvenaria, reboco, pintura...)
TIPOS = ("P", "V", "L", "A")
# partes do pilar que um item pode ter (as mesmas do pacote da planta: pacote.TIPOS_DE_PARTE)
PARTES = ("consolo", "capitel")



INSTALACOES = ("esgoto", "agua", "eletrica")


class ErroFichas(Exception):
    pass


def _texto(v) -> str:
    return str(v or "").strip()


def de_legado(dados: dict) -> list[dict]:
    fichas = []
    for tipo in TIPOS_LEGADO:
        if tipo not in dados:
            continue
        codigo = _texto(dados[tipo].get("codigo"))
        titulo = _texto(dados[tipo].get("titulo") or dados[tipo].get("nome"))
        if not codigo:
            raise ErroFichas(f'A ficha "{tipo}" do arquivo não tem "codigo". Ponha o código da ficha no arquivo.')
        itens = [{"n": int(i["n"]), "etapa": _texto(i.get("etapa")), "titulo": _texto(i.get("titulo")),
                  "descricao": _texto(i.get("desc")), "dispositivo": _texto(i.get("disp")), "tolerancia": _texto(i.get("tol")),
                  **({"parte": _texto(i["parte"]).lower()} if _texto(i.get("parte")) else {}),
                  **({"furos": i["furos"]} if i.get("furos") is not None else {}),
                  **({"barras": i["barras"]} if i.get("barras") is not None else {}),
                  **({"concretagem": i["concretagem"]} if i.get("concretagem") is not None else {}),
                  **({"rastreio_concreto": i["rastreio_concreto"]} if i.get("rastreio_concreto") is not None else {}),
                  **({"instalacao": i["instalacao"]} if i.get("instalacao") is not None else {}),
                  **({"esquadrias": i["esquadrias"]} if i.get("esquadrias") is not None else {}),
                  **({"pontos": i["pontos"]} if i.get("pontos") is not None else {})}
                 for i in dados[tipo]["itens"]]
        fichas.append({"codigo": codigo, "titulo": titulo, "revisao": "0", "tipo_modelo": "ESTRUTURA",
                       "aplica_a": [tipo], "itens": itens, "origem": "legado"})
    return fichas


def normalizar(dados, aplica_a_padrao: list[str] | None = None) -> list[dict]:
    """aplica_a_padrao: para as fichas do arquivo que não dizem a que se aplicam (ex.: ["A"] num
    arquivo só de fichas por ambiente lidas de um sistema oficial, onde o título não fala em pilar ou viga)."""
    if isinstance(dados, dict) and any(k in dados for k in TIPOS_LEGADO):
        fichas = de_legado(dados)
    elif (leitor := integracoes.leitor_de_fichas(dados)) is not None:
        fichas = leitor(dados)
    elif isinstance(dados, list):
        fichas = dados
    else:
        raise ErroFichas("formato de arquivo de fichas desconhecido")
    for f in fichas:
        if not f.get("codigo") or not f.get("titulo") or not f.get("itens"):
            raise ErroFichas(f"ficha sem código, título ou itens: {f.get('codigo') or f.get('titulo')}")
        if not f.get("aplica_a") and aplica_a_padrao:
            f["aplica_a"] = list(aplica_a_padrao)
        if not f.get("aplica_a"):
            raise ErroFichas(f"{f['codigo']}: diga a que a ficha se aplica (\"aplica_a\": [\"P\"] pilar, [\"V\"] viga, [\"L\"] laje "
                             "ou [\"A\"] ambiente), ou use --aplica-a")
        if not set(f["aplica_a"]) <= set(TIPOS):
            raise ErroFichas(f"{f['codigo']}: \"aplica_a\" só aceita {', '.join(TIPOS)} (veio {f['aplica_a']})")
        furos = [i for i in f["itens"] if i.get("furos") is not None]
        for i in furos:
            if i["furos"] is not True:
                raise ErroFichas(f'{f["codigo"]} item {i.get("n")}: "furos" só aceita true (o item de furação, que os furos marcam)')
            if f["aplica_a"] != ["V"]:
                raise ErroFichas(f'{f["codigo"]} item {i.get("n")}: item de furação só em ficha de viga ("aplica_a": ["V"])')
        if len(furos) > 1:
            raise ErroFichas(f'{f["codigo"]}: só um item de furação ("furos": true) por ficha')
        barras = [i for i in f["itens"] if i.get("barras") is not None]
        for i in barras:
            if i["barras"] is not True:
                raise ErroFichas(f'{f["codigo"]} item {i.get("n")}: "barras" só aceita true (o item de armadura, que as barras marcam)')
            if f["aplica_a"] != ["L"]:
                raise ErroFichas(f'{f["codigo"]} item {i.get("n")}: item de armadura pelas barras só em ficha de laje ("aplica_a": ["L"])')
            if i.get("furos") or i.get("parte"):
                raise ErroFichas(f'{f["codigo"]} item {i.get("n")}: o item das barras não pode ser também de furos ou de parte')
        if len(barras) > 1:
            raise ErroFichas(f'{f["codigo"]}: só um item de armadura pelas barras ("barras": true) por ficha')
        for i in f["itens"]:
            disc = i.get("pontos")
            if disc is None:
                continue
            if disc not in ("hidro", "sanitario"):
                raise ErroFichas(f'{f["codigo"]} item {i.get("n")}: "pontos" só aceita "hidro" ou "sanitario" (os pontos que marcam o item)')
            if f["aplica_a"] != ["A"]:
                raise ErroFichas(f'{f["codigo"]} item {i.get("n")}: item dos pontos de instalação só em ficha de ambiente ("aplica_a": ["A"])')
            if i.get("furos") or i.get("barras") or i.get("parte") or i.get("esquadrias"):
                raise ErroFichas(f'{f["codigo"]} item {i.get("n")}: o item dos pontos não pode ser também de furos, barras, parte ou esquadrias')
        for i in f["itens"]:
            if i.get("concretagem") is not None and not isinstance(i["concretagem"], bool):
                raise ErroFichas(f'{f["codigo"]} item {i.get("n")}: "concretagem" só aceita true ou false (a etapa da concretagem)')
        rastreio = [i for i in f["itens"] if i.get("rastreio_concreto") is not None]
        for i in rastreio:
            if i["rastreio_concreto"] is not True:
                raise ErroFichas(f'{f["codigo"]} item {i.get("n")}: "rastreio_concreto" só aceita true '
                                 "(o item que o Concreto marca quando a peça tem caminhão)")
            if f["aplica_a"] not in (["P"], ["V"]):
                raise ErroFichas(f'{f["codigo"]} item {i.get("n")}: item do rastreio do concreto só em ficha de pilar ou de viga')
            if i.get("furos") or i.get("barras") or i.get("parte"):
                raise ErroFichas(f'{f["codigo"]} item {i.get("n")}: o item do rastreio não pode ser também de furos, de barras ou de parte')
        if len(rastreio) > 1:
            raise ErroFichas(f'{f["codigo"]}: só um item do rastreio do concreto ("rastreio_concreto": true) por ficha')
        vistas: set[str] = set()
        for i in f["itens"]:
            inst = i.get("instalacao")
            if inst is None:
                continue
            if inst not in INSTALACOES:
                raise ErroFichas(f'{f["codigo"]} item {i.get("n")}: "instalacao" só aceita "esgoto", "agua" ou "eletrica"')
            if "L" not in f["aplica_a"]:
                raise ErroFichas(f'{f["codigo"]} item {i.get("n")}: item de instalação na laje só em ficha de laje ("aplica_a": ["L"])')
            if i.get("furos") or i.get("barras") or i.get("parte") or i.get("rastreio_concreto"):
                raise ErroFichas(f'{f["codigo"]} item {i.get("n")}: o item de instalação não pode ser também de furos, de barras, de parte ou do rastreio')
            if inst in vistas:
                raise ErroFichas(f'{f["codigo"]}: só um item de "instalacao": "{inst}" por ficha')
            vistas.add(inst)
        for i in f["itens"]:
            if i.get("esquadrias") is None:
                continue
            if i["esquadrias"] is not True:
                raise ErroFichas(f'{f["codigo"]} item {i.get("n")}: "esquadrias" só aceita true (item que as esquadrias do ambiente marcam)')
            if f["aplica_a"] != ["A"]:
                raise ErroFichas(f'{f["codigo"]} item {i.get("n")}: item pelas esquadrias só em ficha de ambiente ("aplica_a": ["A"])')
            if i.get("furos") or i.get("barras") or i.get("parte"):
                raise ErroFichas(f'{f["codigo"]} item {i.get("n")}: o item das esquadrias não pode ser também de furos, barras ou parte')
        for i in f["itens"]:
            if i.get("parte") is None:
                continue
            if i["parte"] not in PARTES:
                raise ErroFichas(f'{f["codigo"]} item {i.get("n")}: "parte" só aceita {", ".join(PARTES)} (veio "{i["parte"]}")')
            if f["aplica_a"] != ["P"]:
                raise ErroFichas(f'{f["codigo"]} item {i.get("n")}: item de {i["parte"]} só em ficha de pilar ("aplica_a": ["P"])')
            if "concret" in _texto(i.get("etapa")).lower():
                raise ErroFichas(f'{f["codigo"]} item {i.get("n")}: a etapa de um item de {i["parte"]} não pode falar em concretagem '
                                 "(o app acharia que é a etapa da concretagem)")
        numeros = [i["n"] for i in f["itens"]]
        if len(set(numeros)) != len(numeros):
            raise ErroFichas(f"{f['codigo']}: número de item repetido")
    return fichas


def novas(fichas: list[dict], existentes: list[dict]) -> list[dict]:
    tem = {(e["codigo"], e["revisao"]) for e in existentes if not e.get("apagado")}
    return [f for f in fichas if (f["codigo"], str(f.get("revisao") or "0")) not in tem]


def publicar(srv, obra: dict, fichas: list[dict]) -> int:
    """Grava na obra as fichas que ainda não estão lá. Devolve quantas entraram."""
    faltam = novas(fichas, srv.obter("fichas_modelo", {"obra_id": f"eq.{obra['id']}"}))
    agora = dt.datetime.now(dt.timezone.utc).isoformat()
    srv.inserir("fichas_modelo", [
        {**srv._base(obra["id"]), "id": str(uuid.uuid4()), "codigo": f["codigo"], "titulo": f["titulo"],
         "revisao": str(f.get("revisao") or "0"), "tipo_modelo": f.get("tipo_modelo"), "aplica_a": f["aplica_a"],
         "itens": f["itens"], "origem": f.get("origem"), "criado_em_dispositivo": agora}
        for f in faltam
    ])
    return len(faltam)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Publica fichas (PVS) numa obra.")
    ap.add_argument("obra")
    ap.add_argument("arquivo")
    ap.add_argument("--so-conferir", action="store_true")
    ap.add_argument("--aplica-a", metavar="TIPOS", help="para as fichas do arquivo que não dizem a que se aplicam: "
                    "P, V, L ou A (ambiente); mais de um separado por vírgula")
    ap.add_argument("--email")
    ap.add_argument("--url", default=URL_PADRAO)
    ap.add_argument("--chave", default=CHAVE_PADRAO)
    args = ap.parse_args(argv)
    try:
        padrao = [t.strip().upper() for t in (args.aplica_a or "").split(",") if t.strip()] or None
        fichas = normalizar(json.loads(pathlib.Path(args.arquivo).read_text(encoding="utf-8")), padrao)
        for f in fichas:
            print(f"- {f['codigo']} rev. {f.get('revisao') or '0'} {f['titulo']}: {len(f['itens'])} itens, para {'/'.join(f['aplica_a'])}")
            if "V" in f["aplica_a"] and not any(i.get("furos") for i in f["itens"]):
                print("  sem item de furação (\"furos\": true): os furos das vigas ficam só para ver na planta")
            if "L" in f["aplica_a"] and not any(i.get("barras") for i in f["itens"]):
                print("  sem item de armadura pelas barras (\"barras\": true): as barras de laje ficam só para ver na planta")
        if args.so_conferir:
            return 0
        import sessao_local
        from publicar_planta import Servidor, entrar

        sb = Supabase(args.url, args.chave)
        entrar(sb, args.email)
        srv = Servidor(sb, sessao_local.dispositivo_id())
        obra = srv.obra(args.obra.upper())
        entraram = publicar(srv, obra, fichas)
        print(f"{entraram} ficha(s) nova(s) publicada(s); {len(fichas) - entraram} já estavam na obra.")
    except (ErroFichas, ErroExportacao) as e:
        print(f"PROBLEMA: {e}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
