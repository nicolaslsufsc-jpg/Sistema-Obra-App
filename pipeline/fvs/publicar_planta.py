"""Publica no Sistema Obra a planta de forma de um pavimento, um pacote por trecho (módulo FVS).

Uso (no PC, na raiz do repositório):
    py pipeline/fvs/publicar_planta.py pavimento.json
    py pipeline/fvs/publicar_planta.py pavimento.json --so-gerar "C:\\...\\saida"   (não publica: só grava os pacotes)
    py pipeline/fvs/publicar_planta.py pavimento.json --folha-unica                 (o pavimento inteiro numa planta só, sem trechos)
    py pipeline/fvs/publicar_planta.py pavimento.json --folha-unica --so-instalacoes   (só as plantas de hidro, sanitário, elétrico e SPDA)

pavimento.json (fica fora do repositório, junto das pranchas):
{
  "obra": "EXE",
  "pavimento": "3º Pavimento",                      nome exato do pavimento cadastrado na obra
  "formas": [{"trecho": "Trecho 1", "pdf": "Formas 3 tipo/EXE.ES.LO.129.FOR3PAVTIP-R03 - ....pdf"}, ...],
  "det_pilares": "Pilares 3 tipo/*.pdf",            lista de arquivos ou um padrão
  "det_vigas": "Vigas 3 tipo/*.pdf",
  "folha_unica": true,                              opcional: junta as formas numa folha só (pipeline/fvs/folha_unica.py)
  "plotada": {"pdf": "forma_plotada.pdf", "escala": 2.5}   opcional: o Model do DWG já plotado num PDF (pipeline/fvs/plotar_dwg.py)
  "det_pilares_obra": "../Pilares/*.pdf"             opcional: todas as pranchas de pilar da obra; o pilar sem detalhe nas do
                                                    pavimento é procurado nelas pelo lance (arranque do pavimento de cima)
  "manter_sem_detalhe": ["V"]                       opcional: tipos cuja falta de detalhe é prancha que não dá para baixar
                                                    ("Em Análise"); essas peças ficam na planta, sem detalhe
  "det_consolos": "../Consolos/*CON2PAVTIP*.pdf"     opcional: pranchas "DETALHAMENTO DOS CONSOLOS" do pavimento
  "det_macicos": "../Lajes/*LAJ2PAVTOX*.pdf"         opcional: pranchas "LAJE ... - MACIÇOS" do pavimento (os capitéis)
  "furos": {"ifc": "../Furacao/modelo.ifc",          opcional: furos de viga e de laje do modelo de furação (só com a folha única)
            "nivel": "2º PAVIMENTO (NO)",            o "Level" dos furos deste pavimento no modelo (ou uma lista)
            "encaixe": {...},                        opcional: o encaixe do relatorio.json, para fixar ou corrigir à mão
            "referencia": "../pacotes/03_pilotis",   opcional: a pasta gerada (--so-gerar) de outro pavimento com furos do
                                                    mesmo modelo; o encaixe sai do dela pelos pilares em comum (furos.py)
            "de_outro_pavimento": [{"nivel": "TÉRREO (NO)", "pasta": "../pacotes/02_terreo"}]}
                                                    opcional: furos de viga do nível de outro pavimento que ele (a pasta
                                                    gerada dele) não pôs em viga; entram aqui só os que caem numa viga
                                                    desta forma (viga deste pavimento desenhada lá só como referência).
                                                    Com isso, "nivel" pode ficar vazio.
  "barras_laje": {"longitudinal_inferior": "../Lajes/*.46[4-8].*.pdf",   opcional: pranchas de armação da laje, por camada
                  "alinhamento": {"<prancha>": {"matriz": [a, b, c, d], "t": [tx, ty]}}}   opcional: encaixe à mão
  "camadas_separadas": false                       opcional: sem as plantas de armadura (uma por direção, o padrão
                                                   quando há barras_laje; armadura_laje.py); as barras ficam na aba da forma
  "instalacoes": {"hidro": {"ifc": "../Hidro/modelo.ifc", "nivel": "2º PAVIMENTO"},   opcional: uma planta por disciplina
                  "sanitario", "eletrico", "spda": {"ifc": [...], "nivel": [...]},  com os pontos do modelo (instalacoes.py); só com a
                  "encaixe": {...}}                                 folha única; encaixe = o dos furos, ou este à mão
}
Caminhos relativos valem a partir da pasta do pavimento.json.

Pilar ou viga sem detalhe não existe no pavimento e sai da planta (pedido do Nicolas, 17/11/2026). O
pilar cujo detalhe só passa pelo pavimento ou é de outro lance também sai; o que nasce no pavimento
fica só com o detalhe, sem ficha (lances.py). O relatorio.json lista o que saiu e por quê.

Consolo e capitel (item 2 de 17/11/2026, partes.py): viram "partes" do pilar com ficha. O consolo sai
da forma (camada "consolo" com o rótulo "CONSOLO Pxx"); o capitel, da lista de pilares das pranchas
de maciços. O detalhe de cada um vem das pranchas de "det_consolos" e "det_macicos".

Esquadrias (esquadrias.py, com "esquadrias": true em "ambientes"): cada porta ou janela do IFC de
arquitetura vira um local "E" dentro do ambiente; a porta entre dois cômodos, um local de cada lado.

Modulação (modulacao.py, com "modulacao": {"pranchas": [...], "escala": 50} em "ambientes"): o recorte da
planta de 1ª fiada do apartamento vira o detalhe de cada cômodo dele (uma imagem por apartamento).
Outros projetos ("projetos": [{"titulo": "Paginação de piso", "pranchas": [...], "escala": 50, "fichas": [...]}]
em "ambientes"): o mesmo recorte, colorido, em "projetos" do ambiente; o app mostra cada um só nas fichas
listadas (paginação de piso no piso, impermeabilização no piso e no reboco...).

Modulação de paredes (vedacao.py, com "vedacao": true ou {"prancha": ..., "escala": 50} em "ambientes"): uma
planta a mais do pavimento (setor "Modulação", disciplina "vedacao"), em que cada parede de alvenaria do IFC é
um local "M" ("303-M01"), conferido pela ficha de alvenaria. O fundo é a prancha de 1ª fiada, ou a de arquitetura.
"paredes" em "vedacao" escolhe quais entram: "todas" (padrão), "area_comum" ou "apartamentos".

Furos de viga (fatia 1 da conferência por elemento, furos.py): cada furo do modelo de furação vira um
local "F" da planta, ligado à viga onde cai. O relatorio.json lista os que não caíram em viga. Os furos
de laje (item 4, 19/11/2026) viram locais "F" sem viga ("FL1"...); a área de laje de cada um é achada no app.

Barras de laje (barras_laje.py): cada traço das pranchas de armação vira uma barra do pacote ("barras"),
alinhada na folha pelos pilares. A prancha que não alinha com segurança fica fora e vai para
conflitos_de_alinhamento.json/.csv, na pasta de saída.

O que faz, para cada trecho: lê a prancha de forma (pilares e vigas com contorno e rótulo) e os
detalhamentos, monta o pacote (pipeline/fvs/pacote.py), cria no servidor as peças que faltam em
"elementos" e o setor do trecho, envia manifest.json e pacote.bin para
{obra_id}/fvs/plantas/{planta_id}/ e registra a planta. Se o trecho já tinha planta, a nova
substitui a anterior (os registros antigos continuam apontando para a revisão que foi usada).

Login: o mesmo do app (código por e-mail), guardado no PC como no módulo Projetos. Precisa ser
admin ou gestor da obra. Sem chave secreta.
"""

from __future__ import annotations

import argparse
import base64
import datetime as dt
import glob
import json
import pathlib
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid

AQUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))
sys.path.insert(0, str(AQUI.parent))
sys.path.insert(0, str(AQUI.parent / "projetos"))

import pacote  # noqa: E402
import furos as mod_furos  # noqa: E402
import partes  # noqa: E402
import instalacoes as mod_inst  # noqa: E402
from exportar_obra import BUCKET, CHAVE_PADRAO, URL_PADRAO, ErroExportacao, Supabase, dentro_de_repositorio  # noqa: E402

DISCIPLINA = "estrutura"


class ErroPublicacao(Exception):
    pass


# ---------------------------------------------------------------------------
# Parte pura (testada em pipeline/testes/test_fvs_pacote.py)
# ---------------------------------------------------------------------------

def ler_config(caminho: pathlib.Path) -> dict:
    cfg = json.loads(caminho.read_text(encoding="utf-8"))
    base = caminho.parent
    for campo in ("obra", "pavimento"):
        if not cfg.get(campo):
            raise ErroPublicacao(f"falta \"{campo}\" em {caminho.name}")
    if not cfg.get("formas") and not cfg.get("ambientes") and not cfg.get("plotada"):
        raise ErroPublicacao(f"{caminho.name} não tem \"formas\" (estrutura) nem \"ambientes\" (arquitetura)")

    def arquivos(valor) -> list[str]:
        itens = valor if isinstance(valor, list) else [valor] if valor else []
        saida: list[str] = []
        for it in itens:
            p = pathlib.Path(it)
            p = p if p.is_absolute() else base / p
            achados = sorted(glob.glob(str(p))) if any(c in str(p) for c in "*?[") else [str(p)]
            saida += achados
        return saida

    formas = []
    for f in cfg.get("formas") or []:
        if not f.get("trecho") or not f.get("pdf"):
            raise ErroPublicacao("cada forma precisa de \"trecho\" e \"pdf\"")
        pdfs = arquivos(f["pdf"])
        if len(pdfs) != 1:
            raise ErroPublicacao(f"{f['trecho']}: o pdf da forma tem que ser um arquivo só (achei {len(pdfs)})")
        formas.append({"trecho": f["trecho"].strip(), "pdf": pdfs[0]})
    trechos = [f["trecho"] for f in formas]
    if len(set(trechos)) != len(trechos):
        raise ErroPublicacao("trecho repetido no pavimento.json")
    amb = None
    if cfg.get("ambientes"):
        amb = dict(cfg["ambientes"])
        for campo in ("ifc", "prancha"):
            achados = arquivos(amb.get(campo))
            if len(achados) != 1:
                raise ErroPublicacao(f"ambientes: \"{campo}\" tem que ser um arquivo só (achei {len(achados)})")
            amb[campo] = achados[0]
        if amb.get("nomes"):
            achados = arquivos(amb["nomes"])
            if len(achados) != 1:
                raise ErroPublicacao(f"ambientes: \"nomes\" tem que ser um arquivo só (achei {len(achados)})")
            amb["nomes"] = achados[0]
        if amb.get("modulacao"):
            mod = dict(amb["modulacao"])
            mod["pranchas"] = arquivos(mod.get("pranchas"))
            if not mod["pranchas"]:
                raise ErroPublicacao("ambientes: \"modulacao\" sem prancha nenhuma (confira \"pranchas\")")
            amb["modulacao"] = mod
        if amb.get("projetos"):
            if not isinstance(amb["projetos"], list):
                raise ErroPublicacao("ambientes: \"projetos\" tem que ser uma lista")
            projetos = []
            for i, pj in enumerate(amb["projetos"]):
                pj = dict(pj)
                pj["pranchas"] = arquivos(pj.get("pranchas"))
                if not pj["pranchas"]:
                    raise ErroPublicacao(f"ambientes: projeto {i + 1} ({pj.get('titulo') or 'sem título'}) sem prancha nenhuma (confira \"pranchas\")")
                projetos.append(pj)
            amb["projetos"] = projetos
        if amb.get("vedacao"):
            ved = dict(amb["vedacao"]) if isinstance(amb["vedacao"], dict) else {}
            if ved.get("prancha"):
                achados = arquivos(ved["prancha"])
                if len(achados) != 1:
                    raise ErroPublicacao(f"ambientes: \"vedacao\": \"prancha\" tem que ser um arquivo só, a 1ª fiada do pavimento inteiro (achei {len(achados)})")
                ved["prancha"] = achados[0]
            if ved.get("paredes", "todas") not in ("todas", "area_comum", "apartamentos"):
                raise ErroPublicacao(f"ambientes: \"vedacao\": \"paredes\" é \"todas\", \"area_comum\" ou \"apartamentos\" (veio \"{ved['paredes']}\")")
            amb["vedacao"] = ved or True
    fur = None
    if cfg.get("furos"):
        fur = dict(cfg["furos"])
        achados = arquivos(fur.get("ifc"))
        if len(achados) != 1:
            raise ErroPublicacao(f"furos: \"ifc\" tem que ser um arquivo só (achei {len(achados)})")
        fur["ifc"] = achados[0]
        niveis = fur.get("nivel")
        fur["nivel"] = [n for n in (niveis if isinstance(niveis, list) else [niveis]) if n]
        outros = []
        for o in fur.get("de_outro_pavimento") or []:
            if not isinstance(o, dict) or not o.get("nivel") or not o.get("pasta"):
                raise ErroPublicacao("furos: cada item de \"de_outro_pavimento\" precisa de \"nivel\" e \"pasta\"")
            pasta = pathlib.Path(o["pasta"])
            pasta = pasta if pasta.is_absolute() else base / pasta
            if not (pasta / "relatorio.json").is_file():
                raise ErroPublicacao(f"furos: \"de_outro_pavimento\" tem que apontar a pasta gerada do outro pavimento (falta {pasta / 'relatorio.json'})")
            outros.append({"nivel": o["nivel"], "pasta": str(pasta)})
        fur["de_outro_pavimento"] = outros
        if not fur["nivel"] and not outros:
            raise ErroPublicacao("furos: falta \"nivel\" (o nível dos furos deste pavimento no modelo)")
        if fur.get("referencia"):
            ref = pathlib.Path(fur["referencia"])
            ref = ref if ref.is_absolute() else base / ref
            if not (ref / "relatorio.json").is_file():
                raise ErroPublicacao(f"furos: \"referencia\" tem que ser a pasta gerada de outro pavimento (falta {ref / 'relatorio.json'})")
            fur["referencia"] = str(ref)
    inst = None
    if cfg.get("instalacoes"):
        bruto = dict(cfg["instalacoes"])
        inst = {"encaixe": bruto.pop("encaixe", None), "disciplinas": {}}
        for disc, valor in bruto.items():
            if disc not in mod_inst.DISCIPLINAS:
                raise ErroPublicacao(f"instalacoes: disciplina desconhecida \"{disc}\" (use {', '.join(mod_inst.DISCIPLINAS)})")
            if not isinstance(valor, dict) or not valor.get("ifc") or not valor.get("nivel"):
                raise ErroPublicacao(f"instalacoes: {disc} precisa de \"ifc\" e \"nivel\"")
            ifcs = arquivos(valor["ifc"])
            if not ifcs or not all(pathlib.Path(i).is_file() for i in ifcs):
                raise ErroPublicacao(f"instalacoes: {disc}: modelo não achado ({valor['ifc']})")
            niveis = valor["nivel"] if isinstance(valor["nivel"], list) else [valor["nivel"]]
            inst["disciplinas"][disc] = {"ifc": ifcs, "nivel": niveis}
    barras = None
    if cfg.get("barras_laje"):
        import barras_laje

        bruto = dict(cfg["barras_laje"])
        manuais = bruto.pop("alinhamento", None) or {}
        barras = {"camadas": {}, "alinhamento": manuais}
        for camada, valor in bruto.items():
            if camada not in barras_laje.CAMADAS:
                raise ErroPublicacao(f"barras_laje: camada desconhecida \"{camada}\" (use {', '.join(barras_laje.CAMADAS)})")
            achados = arquivos(valor.get("pdf") if isinstance(valor, dict) else valor)
            if not achados:
                raise ErroPublicacao(f"barras_laje: nenhuma prancha achada para {camada}")
            barras["camadas"][camada] = {"pdfs": achados, "camada_pdf": valor.get("camada_pdf") if isinstance(valor, dict) else None}
    plotada = None
    if cfg.get("plotada"):
        achados = arquivos(cfg["plotada"].get("pdf"))
        if len(achados) != 1:
            raise ErroPublicacao(f"plotada: \"pdf\" tem que ser um arquivo só (achei {len(achados)})")
        plotada = {"pdf": achados[0], "escala": float(cfg["plotada"].get("escala") or 1.0), "nome": cfg["plotada"].get("nome")}
    return {
        "obra": cfg["obra"].strip().upper(),
        "pavimento": cfg["pavimento"].strip(),
        "formas": formas,
        "det_pilares": arquivos(cfg.get("det_pilares")),
        "det_vigas": arquivos(cfg.get("det_vigas")),
        "ambientes": amb,
        "folha_unica": bool(cfg.get("folha_unica")),
        "plotada": plotada,
        "det_pilares_obra": arquivos(cfg.get("det_pilares_obra")),
        "manter_sem_detalhe": [t for t in cfg.get("manter_sem_detalhe") or [] if t in ("P", "V")],
        "det_consolos": arquivos(cfg.get("det_consolos")),
        "det_macicos": arquivos(cfg.get("det_macicos")),
        "furos": fur,
        "barras_laje": barras,
        "instalacoes": inst,
        "camadas_separadas": cfg.get("camadas_separadas", True) is not False,
    }


def pecas_a_criar(existentes: list[dict], lidas: list[tuple[str, str, str]]) -> list[tuple[str, str, str]]:
    """Peças lidas (tipo, nome, seção) que ainda não existem em "elementos" do pavimento.
    Pilar que aparece em dois trechos é uma peça só (contrato do núcleo)."""
    tem = {(e["tipo"], e["nome"]) for e in existentes if not e.get("apagado")}
    novas: dict[tuple[str, str], str] = {}
    for tipo, nome, secao in lidas:
        if (tipo, nome) not in tem and (tipo, nome) not in novas:
            novas[(tipo, nome)] = secao
    return [(t, n, s) for (t, n), s in sorted(novas.items())]


def planta_vigente(plantas: list[dict], setor_id: str) -> str | None:
    """A planta do trecho que nenhuma outra substituiu (a mais recente, se houver mais de uma)."""
    do_setor = [p for p in plantas if p["setor_id"] == setor_id and not p.get("apagado")]
    substituidas = {p.get("substitui_id") for p in plantas if p.get("substitui_id")}
    vivas = [p for p in do_setor if p["id"] not in substituidas]
    if not vivas:
        return None
    return max(vivas, key=lambda p: p.get("criado_em_servidor") or p.get("criado_em_dispositivo") or "")["id"]


MOTIVO = {"passa": "detalhe só passa pelo pavimento", "fora": "detalhe de outro lance"}


def separar_pecas(formas: list[dict], detalhes: dict, manter_sem_detalhe=()) -> list[dict]:
    """Tira das formas os pilares e vigas que não existem no pavimento: sem detalhe, ou pilar cujo detalhe
    só passa pelo pavimento ou é de outro lance. Devolve a lista do que saiu, com o motivo. Muda formas."""
    fora: dict[tuple[str, str], dict] = {}
    for fm in formas:
        ficam = []
        for p in fm["pecas"]:
            if p["tipo"] not in ("P", "V"):
                ficam.append(p)
                continue
            d = detalhes.get(p["tipo"], {}).get(p["nome"])
            if d is None:
                motivo = None if p["tipo"] in manter_sem_detalhe else "sem detalhe nas pranchas lidas"
            else:
                motivo = MOTIVO.get(d.get("situacao"))
                if motivo and d.get("lance"):
                    motivo += f" ({d['lance']})"
            if motivo:
                fora.setdefault((p["tipo"], p["nome"]), {"tipo": p["tipo"], "nome": p["nome"], "secao": p.get("secao") or "", "motivo": motivo})
            else:
                ficam.append(p)
        fm["pecas"] = ficam
    return [fora[k] for k in sorted(fora)]


def detalhes_anteriores(pasta: pathlib.Path) -> dict[str, tuple[str, str]]:
    """Do pacote que já está na pasta: elemento -> (sha256 da imagem do detalhe, data da última correção)."""
    try:
        m, pedacos = pacote.ler((pasta / "manifest.json").read_bytes(), (pasta / "pacote.bin").read_bytes())
    except (OSError, ValueError, pacote.ErroPacote):
        return {}
    saida = {}
    for eid, e in m.get("elementos", {}).items():
        img = pedacos.get("d:" + e["detalhe"]) if e.get("detalhe") else None
        if img is not None:
            saida[eid] = (pacote.sha256(img), e.get("detalhe_corrigido_em") or "")
    return saida


def montar_trecho(forma: dict, detalhes: dict, ids: dict[tuple[str, str], str], cabecalho: dict,
                  anterior: dict[str, tuple[str, str]] | None = None, hoje: str | None = None) -> tuple[bytes, bytes, dict]:
    """Pacote de um trecho. ids: (tipo, nome) -> elementos.id. Devolve (manifest, pacote, relatório).

    anterior (de detalhes_anteriores): peça cuja imagem de detalhe mudou ganha detalhe_corrigido_em = hoje.
    As marcações não mudam: são do elemento, não da imagem (nada reabre)."""
    elementos: dict[str, dict] = {}
    dets: dict[str, dict] = {}
    sem_contorno, sem_detalhe, corrigidos = [], [], []
    rel_partes = por_partes(forma["pecas"], detalhes)
    for p in forma["pecas"]:
        eid = ids[(p["tipo"], p["nome"])]
        reg = {k: p[k] for k in ("tipo", "nome", "secao", "rotulo", "polys")}
        d = detalhes.get(p["tipo"], {}).get(p["nome"])
        if p.get("grupo"):
            reg["grupo"] = p["grupo"]
        if p.get("comodo"):
            reg["comodo"] = p["comodo"]
        if p["tipo"] == "F":
            if p.get("viga"):
                reg["viga"] = ids[("V", p["viga"])]
            reg["furo"] = p["furo"]
        if p["tipo"] == "E":
            reg["ambiente"] = ids[("A", p["ambiente"])]
            reg["esquadria"] = p["esquadria"]
        if p["tipo"] == "A" and detalhes.get("A_projetos", {}).get(p["nome"]):
            # paginação de piso, impermeabilização...: um recorte a mais por projeto, com as fichas em que aparece
            reg["projetos"] = []
            for dp in detalhes["A_projetos"][p["nome"]]:
                reg["projetos"].append(dp["chave"])
                dets.setdefault(dp["chave"], {"titulo": dp["titulo"], "prancha": dp["prancha"], "img": dp["img"], "aco": None,
                                              **({"fichas": dp["fichas"]} if dp.get("fichas") else {})})
        if d:
            reg["detalhe"] = d["chave"]
            if d.get("situacao") == "nasce":
                reg["so_detalhe"] = True  # arranque: o pilar deste pavimento é o de baixo; ficha no de cima
            if anterior and eid in anterior:
                sha_antes, corrigido = anterior[eid]
                if sha_antes != pacote.sha256(d["img"]):
                    corrigido = hoje or dt.date.today().isoformat()
                    corrigidos.append(p["nome"])
                if corrigido:
                    reg["detalhe_corrigido_em"] = corrigido
            dets.setdefault(d["chave"], {"titulo": d["titulo"], "prancha": d["prancha"], "img": d["img"], "aco": d["aco"]})
        elif p["tipo"] not in ("A", "F", "E", "M"):  # ambiente, furo, esquadria e parede não têm prancha de detalhe
            sem_detalhe.append(p["nome"])
        if p.get("partes"):
            reg["partes"] = []
            for pt in p["partes"]:
                item = {"tipo": pt["tipo"], "polys": pt["polys"]}
                dp = pt.get("detalhe")
                if dp:
                    item["detalhe"] = dp["chave"]
                    dets.setdefault(dp["chave"], {"titulo": dp["titulo"], "prancha": dp["prancha"], "img": dp["img"], "aco": dp.get("aco")})
                reg["partes"].append(item)
        if not p["polys"]:
            sem_contorno.append(p["nome"])
        elementos[eid] = reg
    cab = dict(cabecalho)
    cab.update({k: forma[k] for k in ("prancha", "revisao", "largura", "altura", "tile", "niveis")})
    if forma.get("camadas_separadas"):
        cab["camadas_separadas"] = True
    if forma.get("camada"):
        cab["camada"] = forma["camada"]
    if forma.get("disciplina") in mod_inst.DISCIPLINAS:
        cab["disciplina"] = forma["disciplina"]
    manifest, binario = pacote.montar(cab, forma["tiles"], elementos, dets, forma.get("barras"), forma.get("pontos"))
    rel = {
        "trecho": cab.get("trecho"),
        "prancha": forma["prancha"],
        "pilares": sum(1 for p in forma["pecas"] if p["tipo"] == "P"),
        "vigas": sum(1 for p in forma["pecas"] if p["tipo"] == "V"),
        "furos": sum(1 for p in forma["pecas"] if p["tipo"] == "F"),
        "esquadrias": sum(1 for p in forma["pecas"] if p["tipo"] == "E"),
        "paredes": sum(1 for p in forma["pecas"] if p["tipo"] == "M"),
        "barras": len(forma.get("barras") or {}),
        "elementos": quantos_locais(forma),
        "disciplina": forma.get("disciplina") or DISCIPLINA,
        "sem_contorno": sorted(sem_contorno),
        "sem_detalhe": sorted(sem_detalhe),
        "detalhe_corrigido": sorted(corrigidos),
        "mb": round((len(manifest) + len(binario)) / 1e6, 2),
    }
    if any(rel_partes.values()):
        rel["partes"] = rel_partes
    return manifest, binario, rel


def ids_em_viga(pasta: str) -> set[str]:
    """Os modelo_id dos furos de viga ("F" com viga) dos pacotes de uma pasta gerada (--so-gerar)."""
    pasta_p = pathlib.Path(pasta)
    rel = json.loads((pasta_p / "relatorio.json").read_text(encoding="utf-8"))
    ids: set[str] = set()
    for t in rel.get("trechos") or []:
        man = json.loads((pasta_p / t["pasta"] / "manifest.json").read_text(encoding="utf-8"))
        ids |= {str(e["furo"]["modelo_id"]) for e in man["elementos"].values()
                if e.get("tipo") == "F" and e.get("viga") and (e.get("furo") or {}).get("modelo_id")}
    return ids


def furos_do_outro_pavimento(ifc: str, outro: dict) -> list[dict]:
    """Furos de viga do nível de outro pavimento que a pasta gerada dele não pôs em viga (furos.furos_de_outro_pavimento)."""
    lidos = mod_furos.ler_ifc(ifc, [outro["nivel"]])
    return mod_furos.furos_de_outro_pavimento(lidos, ids_em_viga(outro["pasta"]), pathlib.Path(outro["pasta"]).name)


def encaixe_da_referencia(pasta: str, pecas: list[dict]) -> dict:
    """O encaixe dos furos pelos pilares em comum com outro pavimento já gerado (--so-gerar) com furos do mesmo
    modelo: o relatorio.json dele dá o encaixe (modelo -> folha dele) e o manifest.json, os pilares."""
    pasta_ref = pathlib.Path(pasta)
    rel = json.loads((pasta_ref / "relatorio.json").read_text(encoding="utf-8"))
    enc_ref = (rel.get("furos") or {}).get("encaixe")
    if not enc_ref:
        raise mod_furos.ErroFuros(f"o pavimento de referência ({pasta_ref.name}) não tem furos encaixados")
    if enc_ref.get("duvidoso"):
        raise mod_furos.ErroFuros(f"o encaixe dos furos do pavimento de referência ({pasta_ref.name}) é duvidoso")
    trechos = rel.get("trechos") or []
    if len(trechos) != 1:
        raise mod_furos.ErroFuros(f"o pavimento de referência ({pasta_ref.name}) tem que estar numa folha só")
    man = json.loads((pasta_ref / trechos[0]["pasta"] / "manifest.json").read_text(encoding="utf-8"))
    pil_ref = mod_furos.pilares_da_planta(list(man["elementos"].values()))
    enc = mod_furos.encaixe_pela_referencia(enc_ref, pil_ref, mod_furos.pilares_da_planta(pecas))
    enc["referencia"] = pasta_ref.name
    return enc


def por_furos(cfg: dict, detalhes: dict, formas: list[dict]) -> dict | None:
    """Os furos de viga lidos do modelo (detalhes["furos"]) viram locais "F" da forma. Só com uma planta de
    estrutura por pavimento (folha única): por trecho, o mesmo furo cairia em dois pacotes."""
    if not cfg.get("furos"):
        return None
    estrutura = [fm for fm in formas if (fm.get("disciplina") or DISCIPLINA) == DISCIPLINA]
    if len(estrutura) != 1:
        raise ErroPublicacao("furos: só com a planta do pavimento numa folha só (\"folha_unica\": true ou \"plotada\")")
    fm = estrutura[0]
    try:
        encaixe = cfg["furos"].get("encaixe")
        if encaixe is None and cfg["furos"].get("referencia"):
            encaixe = encaixe_da_referencia(cfg["furos"]["referencia"], fm["pecas"])
        rel = mod_furos.juntar_furos(fm, detalhes.get("furos") or [], float(cfg["furos"].get("escala") or 50), encaixe)
    except mod_furos.ErroFuros as e:
        raise ErroPublicacao(f"furos: {e}") from e
    enc = rel.get("encaixe") or {}
    if enc.get("metodo") == "pilares":
        print(f"  encaixe dos furos pelos pilares de {enc['referencia']}: {enc['pilares']} pilares em comum,"
              f" erro de até {enc['erro_cm']:g} cm" + (f" ({len(enc['pilares_fora'])} pilares não bateram)" if enc.get("pilares_fora") else ""))
    if rel.get("em_parede"):
        print(f"  {rel['em_parede']} furos em parede ou cortina (peça de 2 m ou mais de altura no modelo): fora das vigas, no relatorio.json")
    print(f"  furos: {rel['em_viga']} de {rel['furos']} em {rel['vigas_com_furo']} vigas"
          + (f" (encaixe: {enc.get('dentro')} dentro de viga; outra orientação, no máximo {enc.get('segundo')})" if enc.get("dentro") is not None else "")
          + (f"; {len(rel['sem_viga'])} fora de viga (lista no relatorio.json)" if rel["sem_viga"] else "")
          + (f"; {len(rel['de_outro_pavimento'])} vindos de outro pavimento" if rel.get("de_outro_pavimento") else "")
          + (f"; {rel['em_laje']} furos de laje (a área de cada um é achada no app)" if rel.get("em_laje") else ""))
    if enc.get("duvidoso"):
        print("  ATENÇÃO: encaixe dos furos duvidoso. Confira na tela antes de publicar, ou passe \"encaixe\" no pavimento.json.")
    return rel


def quantos_locais(forma: dict) -> int:
    """O que a planta tem para tocar: as peças; na planta de armadura (sem peças), as barras."""
    if forma.get("disciplina") == "armadura":
        return sum(1 for b in (forma.get("barras") or {}).values() if b["camada"] == forma.get("camada"))
    if forma.get("disciplina") in mod_inst.DISCIPLINAS:
        return len(forma.get("pontos") or {})
    return len(forma["pecas"])


def por_armadura(cfg: dict, detalhes: dict, formas: list[dict], rel_barras: dict | None) -> list[dict]:
    """Uma planta por direção da armadura de laje (armadura_laje.py), acrescentada a formas. Por padrão sim
    quando há barras; "camadas_separadas": false no pavimento.json deixa as barras só na aba da forma."""
    if not rel_barras or cfg.get("camadas_separadas") is False:
        return []
    import armadura_laje

    fm = next(f for f in formas if (f.get("disciplina") or DISCIPLINA) == DISCIPLINA)
    print("Montando a armadura de laje em plantas próprias, uma por direção:")
    folhas = armadura_laje.folhas_de_armadura(fm, detalhes.get("barras") or [], rel_barras["pranchas"])
    formas.extend(folhas)
    return folhas


def por_instalacoes(cfg: dict, detalhes: dict, formas: list[dict], rel_furos: dict | None) -> dict | None:
    """Uma planta por disciplina de instalações (instalacoes.py), acrescentada a formas: o fundo da folha de
    forma e os pontos do modelo, levados à folha pelo encaixe dos furos (ou "encaixe" à mão)."""
    if not cfg.get("instalacoes"):
        return None
    estrutura = [fm for fm in formas if (fm.get("disciplina") or DISCIPLINA) == DISCIPLINA]
    if len(estrutura) != 1:
        raise ErroPublicacao("instalacoes: só com a planta do pavimento numa folha só (\"folha_unica\": true ou \"plotada\")")
    fm = estrutura[0]
    enc = cfg["instalacoes"].get("encaixe") or ((rel_furos or {}).get("encaixe") if rel_furos else None)
    if not enc:
        raise ErroPublicacao("instalacoes: sem encaixe. Ponha \"furos\" no pavimento.json (o encaixe dos pontos é o dos furos) "
                             "ou \"encaixe\" em \"instalacoes\"")
    if enc.get("duvidoso") and not cfg["instalacoes"].get("encaixe"):
        raise ErroPublicacao("instalacoes: o encaixe dos furos é duvidoso; confira e passe \"encaixe\" à mão")
    rel = {}
    print("Montando as instalações em plantas próprias, uma por disciplina:")
    for disc in mod_inst.DISCIPLINAS:
        if disc not in cfg["instalacoes"]["disciplinas"]:
            continue
        pontos, fora = mod_inst.pontos_na_folha((detalhes.get("instalacoes") or {}).get(disc) or [], enc, disc, fm["largura"], fm["altura"],
                                               cfg["obra"], cfg["pavimento"])
        formas.append(mod_inst.folha_da_disciplina(fm, disc, pontos))
        rel[disc] = mod_inst.resumo(pontos, fora)
        print(f"  {mod_inst.DISCIPLINAS[disc]}: {len(pontos)} pontos na folha"
              + (f"; {len(fora)} fora da folha (lista no relatorio.json; encaixe errado ou ponto de outro pavimento)" if fora else ""))
    return rel


def por_barras(cfg: dict, detalhes: dict, formas: list[dict]) -> dict | None:
    """As barras das pranchas de armação (detalhes["barras"]) alinhadas na folha de forma: ficam em
    forma["barras"] ({id: barra}). Só com a folha única, como os furos. Roda antes de tirar da planta as
    peças sem detalhe: todo pilar desenhado ajuda a alinhar. Devolve {conflitos, pranchas}."""
    if not cfg.get("barras_laje"):
        return None
    import barras_laje

    estrutura = [fm for fm in formas if (fm.get("disciplina") or DISCIPLINA) == DISCIPLINA]
    if len(estrutura) != 1:
        raise ErroPublicacao("barras_laje: só com a planta do pavimento numa folha só (\"folha_unica\": true ou \"plotada\")")
    fm = estrutura[0]
    barras, conflitos, resumo = barras_laje.juntar_barras(fm["pecas"], detalhes.get("barras") or [], cfg["barras_laje"].get("alinhamento"))
    fm["barras"] = {}
    for b in barras:
        bid = id_local(cfg["obra"], cfg["pavimento"], "B", b.pop("chave"))
        fm["barras"][bid] = b
    for r in resumo:
        a = r["alinhamento"]
        estado = "ok" if a["ok"] else "FORA (conflito)"
        print(f"  {r['prancha']} ({r['camada']}): {r['barras']} barras, {r['com_posicao']} com posição; alinhamento {estado}: "
              f"{a['pontos']} de {a['total']} pilares, erro máx. {a['residuo_max_cm']} cm" + (f" — {a['motivo']}" if a.get("motivo") else "")
              + (f"; pilares pelo {r['pilares_por']}" if r.get("pilares_por", "contorno do pilar") != "contorno do pilar" else "")
              + (f"; {r['repetidas']} já vinham de outra prancha (emenda)" if r.get("repetidas") else ""))
    if conflitos:
        print(f"  ATENÇÃO: {len(conflitos)} prancha(s) de armação não alinharam e ficaram fora (conflitos_de_alinhamento.csv)")
    return {"conflitos": conflitos, "pranchas": resumo, "barras": len(fm["barras"])}


def por_partes(pecas: list[dict], detalhes: dict) -> dict:
    """Consolos (lidos na forma, em p["consolo"]) e capitéis (detalhes["partes"]["com_capitel"]) viram
    "partes" dos pilares com ficha. Muda as peças; devolve o relatório de partes.py."""
    info = detalhes.get("partes") or {}
    for p in pecas:
        p.pop("partes", None)
        d = detalhes.get("P", {}).get(p["nome"]) if p["tipo"] == "P" else None
        if d and d.get("situacao") == "nasce":
            p["so_detalhe"] = True
    consolos = {p["nome"]: p["consolo"] for p in pecas if p.get("consolo")}
    rel = partes.distribuir_partes(pecas, consolos, set(info.get("com_capitel") or ()),
                                   {"consolo": info.get("consolo") or {}, "capitel": info.get("capitel") or {}})
    for p in pecas:
        p.pop("so_detalhe", None)
    return rel


ESPACO_DE_IDS = uuid.UUID("6f1c2b7e-0f5d-4d0e-9a53-5b1f0c7f5a11")


def id_local(obra: str, pavimento: str, tipo: str, nome: str) -> str:
    """Id fixo para o modo --so-gerar (bancada e conferência), calculado do nome."""
    return str(uuid.uuid5(ESPACO_DE_IDS, f"{obra}|{pavimento}|{tipo}|{nome}"))


def usuario_do_token(token: str) -> str:
    """O id do usuário (sub) dentro do token de login."""
    try:
        meio = token.split(".")[1]
        dados = json.loads(base64.urlsafe_b64decode(meio + "=" * (-len(meio) % 4)))
        return str(uuid.UUID(dados["sub"]))
    except (IndexError, KeyError, ValueError) as e:
        raise ErroPublicacao("não consegui ler o usuário do login") from e


# ---------------------------------------------------------------------------
# Servidor
# ---------------------------------------------------------------------------

class Servidor:
    def __init__(self, sb: Supabase, dispositivo: str):
        self.sb = sb
        self.dispositivo = dispositivo
        self.usuario = usuario_do_token(sb.token or "")

    def _base(self, obra_id: str) -> dict:
        return {
            "obra_id": obra_id,
            "usuario_id": self.usuario,
            "dispositivo_id": self.dispositivo,
            "criado_em_dispositivo": dt.datetime.now(dt.timezone.utc).isoformat(),
        }

    def obter(self, tabela: str, filtros: dict[str, str]) -> list[dict]:
        return self.sb.linhas(tabela, filtros)

    def inserir(self, tabela: str, linhas: list[dict]) -> list[dict]:
        if not linhas:
            return []
        return self.sb.json("POST", f"/rest/v1/{tabela}", linhas, {"Prefer": "return=representation"})

    def obra(self, codigo: str) -> dict:
        achadas = self.obter("obras", {"codigo": f"eq.{codigo}"})
        if not achadas:
            raise ErroPublicacao(f"obra {codigo} não encontrada (ou seu login não tem acesso a ela)")
        return achadas[0]

    def pavimento(self, obra_id: str, nome: str) -> dict:
        pavs = [p for p in self.obter("pavimentos", {"obra_id": f"eq.{obra_id}"}) if not p.get("apagado")]
        achado = [p for p in pavs if p["nome"].strip().lower() == nome.lower()]
        if not achado:
            nomes = ", ".join(p["nome"] for p in sorted(pavs, key=lambda p: p["ordem"]))
            raise ErroPublicacao(f"pavimento \"{nome}\" não existe na obra. Pavimentos cadastrados: {nomes}")
        return achado[0]

    def setor(self, obra_id: str, pavimento_id: str, trecho: str, disciplina: str = DISCIPLINA) -> dict:
        todos = self.obter("setores", {"obra_id": f"eq.{obra_id}", "pavimento_id": f"eq.{pavimento_id}"})
        for s in todos:
            if not s.get("apagado") and s["nome_projeto"].strip().lower() == trecho.lower() and s["disciplina"] == disciplina:
                return s
        return self.inserir("setores", [{**self._base(obra_id), "id": str(uuid.uuid4()), "pavimento_id": pavimento_id,
                                         "nome_projeto": trecho, "disciplina": disciplina}])[0]

    def enviar_arquivo(self, obra_id: str, caminho: str, dados: bytes, tipo: str, nome: str) -> str:
        url = f"{self.sb.url}/storage/v1/object/{BUCKET}/{urllib.parse.quote(caminho)}"
        self.sb._renovar_se_preciso()
        req = urllib.request.Request(url, data=dados, method="POST",
                                     headers=self.sb._cabecalhos({"Content-Type": tipo, "x-upsert": "false"}))
        try:
            with urllib.request.urlopen(req, timeout=300) as r:
                r.read()
        except urllib.error.HTTPError as e:
            corpo = e.read()[:300].decode("utf-8", "replace")
            raise ErroPublicacao(f"envio de {nome} recusado (HTTP {e.code}): {corpo}") from e
        linha = {**self._base(obra_id), "id": str(uuid.uuid4()), "caminho": caminho, "nome_original": nome,
                 "hash": pacote.sha256(dados), "tamanho": len(dados), "tipo": tipo}
        return self.inserir("arquivos", [linha])[0]["id"]


def entrar(sb: Supabase, email: str | None) -> None:
    import sessao_local  # do módulo Projetos: guarda o login no PC (fora do repositório)

    sessao = sessao_local.carregar_sessao()
    if sessao:
        sb.refresh_token = sessao["refresh_token"]
        try:
            sb.renovar()
            sessao_local.guardar_sessao(sb.refresh_token, sessao.get("email"))
            return
        except ErroExportacao as e:
            print(f"O login guardado venceu ({e}).")
            sessao_local.esquecer_sessao()
    email = (email or input("Seu e-mail do app: ")).strip()
    print(f"Enviando o código para {email}...")
    sb.entrar(email, lambda: input("Código que chegou por e-mail: "))
    sessao_local.guardar_sessao(sb.refresh_token, email)


def ler_pranchas(cfg: dict) -> tuple[dict, list[dict]]:
    """Lê os PDFs do pavimento. Devolve (detalhes por tipo e nome, plantas lidas)."""
    detalhes: dict = {"P": {}, "V": {}}
    formas = []
    if cfg["formas"] or cfg.get("plotada"):
        import estrutura  # precisa de pymupdf: só importa quando vai ler PDF

        print(f"Lendo detalhamentos: {len(cfg['det_pilares'])} pranchas de pilares, {len(cfg['det_vigas'])} de vigas...")
        detalhes = estrutura.ler_detalhes(cfg["det_pilares"], cfg["det_vigas"], cfg["pavimento"])
        print(f"  {len(detalhes['P'])} pilares e {len(detalhes['V'])} vigas com detalhe")
        if cfg.get("plotada"):
            import folha_unica

            print(f"Lendo o Model plotado: {pathlib.Path(cfg['plotada']['pdf']).name}")
            formas.append(folha_unica.ler_plotada(cfg["plotada"]["pdf"], cfg["plotada"]["escala"], cfg["plotada"].get("nome")))
        elif cfg.get("folha_unica"):
            import folha_unica

            print(f"Juntando {len(cfg['formas'])} pranchas numa folha só...")
            try:
                formas.append(folha_unica.ler_folha_unica(cfg["formas"]))
            except folha_unica.ErroFolhaUnica as e:
                raise ErroPublicacao(f"folha única: {e}") from e
        else:
            for f in cfg["formas"]:
                print(f"Lendo {f['trecho']}: {pathlib.Path(f['pdf']).name}")
                lida = estrutura.ler_forma(f["pdf"])
                lida["trecho"] = f["trecho"]
                formas.append(lida)
    if cfg.get("ambientes"):
        import ambientes  # precisa de ifcopenshell e shapely

        print(f"Lendo ambientes: {pathlib.Path(cfg['ambientes']['prancha']).name}")
        try:
            base_amb = ambientes.base_da_planta(cfg["ambientes"])
            lida = ambientes.ler_planta(cfg["ambientes"], base_amb)
        except ambientes.ErroAmbientes as e:
            raise ErroPublicacao(f"ambientes: {e}") from e
        r = lida["resumo"]
        print(f"  {r['ambientes']} ambientes em {len(r['apartamentos'])} apartamentos e {r['area_comum']} de área comum (modelo x prancha: {r['coincidencia']:.0%})")
        if r.get("nomes"):
            n = r["nomes"]
            print(f"  nomes dos cômodos: {n['com_nome']} com nome, {sum(n['sem_nome'].values())} só com o número"
                  + (f"; {len(n['do_tipo_sem_par'])} cômodos do tipo sem par num apartamento (lista no relatorio.json)" if n["do_tipo_sem_par"] else ""))
        if r.get("esquadrias"):
            e = r["esquadrias"]
            print(f"  esquadrias: {e['em_ambiente']} de {e['esquadrias']} em ambiente ({e['em_dois_ambientes']} entre dois), {e['locais']} locais"
                  + (f"; {len(e['sem_ambiente'])} sem ambiente (lista no relatorio.json)" if e["sem_ambiente"] else ""))
        if r.get("modulacao"):
            mo = r["modulacao"]
            print(f"  modulação: {mo['com_modulacao']} ambientes com recorte ({mo['recortes']} recortes de {mo['pranchas']} pranchas)"
                  + (f"; {len(mo['sem_modulacao'])} sem (lista no relatorio.json)" if mo["sem_modulacao"] else "")
                  + (f"; não casaram: {', '.join(mo['nao_casaram'])}" if mo["nao_casaram"] else ""))
        for pj in r.get("projetos") or []:
            print(f"  {pj['titulo']}: {pj['com_recorte']} ambientes com recorte ({pj['recortes']} recortes de {pj['pranchas']} pranchas, {pj['kb']} KB)"
                  + (f"; {len(pj['sem_recorte'])} sem (lista no relatorio.json)" if pj["sem_recorte"] else "")
                  + (f"; não casaram: {', '.join(pj['nao_casaram'])}" if pj["nao_casaram"] else ""))
        detalhes.setdefault("A", {}).update(lida.pop("detalhes_a", None) or {})
        detalhes.setdefault("A_projetos", {}).update(lida.pop("projetos_a", None) or {})
        formas.append(lida)
        if cfg["ambientes"].get("vedacao"):
            formas.append(ler_vedacao(cfg["ambientes"], base_amb))
    if cfg.get("det_consolos") or cfg.get("det_macicos"):
        import partes as pt

        detalhes["partes"] = {
            "consolo": pt.ler_detalhes_de_partes(cfg.get("det_consolos") or [], "consolo"),
            "capitel": pt.ler_detalhes_de_partes(cfg.get("det_macicos") or [], "capitel"),
            "com_capitel": pt.nomes_com_capitel(cfg.get("det_macicos") or []),
        }
        print(f"  {len(detalhes['partes']['consolo'])} consolos com detalhe e {len(detalhes['partes']['com_capitel'])} pilares com capitel nas pranchas de maciços")
    if cfg.get("furos"):
        print(f"Lendo os furos de viga: {pathlib.Path(cfg['furos']['ifc']).name}")
        try:
            detalhes["furos"] = mod_furos.ler_ifc(cfg["furos"]["ifc"], cfg["furos"]["nivel"]) if cfg["furos"]["nivel"] else []
            n_laje = sum(1 for f in detalhes["furos"] if f.get("laje"))
            if cfg["furos"]["nivel"]:
                print(f"  {len(detalhes['furos']) - n_laje} furos de viga e {n_laje} de laje no nível {', '.join(cfg['furos']['nivel'])}")
            for o in cfg["furos"].get("de_outro_pavimento") or []:
                vindos = furos_do_outro_pavimento(cfg["furos"]["ifc"], o)
                detalhes["furos"] += vindos
                print(f"  {len(vindos)} furos de viga do nível {o['nivel']} que {pathlib.Path(o['pasta']).name} não pôs em viga (entram só os que caírem numa viga daqui)")
        except mod_furos.ErroFuros as e:
            raise ErroPublicacao(f"furos: {e}") from e
    if cfg.get("instalacoes"):
        detalhes["instalacoes"] = {}
        for disc, c in cfg["instalacoes"]["disciplinas"].items():
            lidos: list[dict] = []
            try:
                for ifc in c["ifc"]:
                    lidos += mod_inst.ler_ifc(ifc, c["nivel"], disc)
            except mod_inst.ErroInstalacoes as e:
                raise ErroPublicacao(f"instalacoes: {e}") from e
            detalhes["instalacoes"][disc] = lidos
            print(f"  {mod_inst.DISCIPLINAS[disc]}: {len(lidos)} pontos no nível {', '.join(c['nivel'])}")
    if cfg.get("barras_laje"):
        import barras_laje

        detalhes["barras"] = []
        for camada, c in cfg["barras_laje"]["camadas"].items():
            print(f"Lendo as barras de laje ({barras_laje.NOME_DA_CAMADA[camada].lower()}): {len(c['pdfs'])} pranchas")
            for pdf in c["pdfs"]:
                try:
                    detalhes["barras"].append(barras_laje.ler_prancha(pdf, camada, c.get("camada_pdf")))
                except barras_laje.ErroBarras as e:
                    raise ErroPublicacao(f"barras_laje: {e}") from e
    if cfg.get("det_pilares_obra") and formas:
        import estrutura

        nomes = {p["nome"] for fm in formas for p in fm["pecas"] if p["tipo"] == "P"}
        achados = estrutura.completar_pilares(detalhes, nomes, cfg["det_pilares_obra"], cfg["pavimento"])
        if achados:
            print(f"  {len(achados)} pilares com detalhe achado nas pranchas de outros pavimentos (pelo lance)")
    return detalhes, formas


def ler_vedacao(cfg_amb: dict, base_amb: dict) -> dict:
    """A planta de modulação do pavimento (vedacao.py): cada parede de alvenaria do IFC, um local "M"."""
    import vedacao

    try:
        lida = vedacao.ler_planta(cfg_amb, base_amb)
    except vedacao.ErroVedacao as e:
        raise ErroPublicacao(f"vedação: {e}") from e
    r = lida["resumo"]
    escolha = {"area_comum": " (só área comum)", "apartamentos": " (só apartamentos)"}.get(r.get("quais"), "")
    print(f"  modulação{escolha}: {r['paredes']} paredes de alvenaria ({r['metros']:g} m) em {len(r['por_apartamento'])} unidades,"
          f" fundo da prancha de {r['fundo']} (modelo x prancha: {r['coincidencia']:.0%})"
          + (f"; {r['curtas_fora']} pedaços com menos de 10 cm ficaram fora" if r.get("curtas_fora") else "")
          + (f"; {r['fora_pela_escolha']} paredes ficaram fora pela escolha" if r.get("fora_pela_escolha") else ""))
    return lida


def publicar(cfg: dict, args) -> list[dict]:
    detalhes, formas = ler_pranchas(cfg)
    return publicar_lidas(cfg, detalhes, formas, args)


def publicar_lidas(cfg: dict, detalhes: dict, formas: list[dict], args) -> list[dict]:
    """Grava em pasta (--so-gerar) ou publica no servidor, a partir das plantas já lidas."""
    relatorios = []
    rel_barras = por_barras(cfg, detalhes, formas)
    por_armadura(cfg, detalhes, formas, rel_barras)
    fora = separar_pecas(formas, detalhes, cfg.get("manter_sem_detalhe") or ())
    if fora:
        print(f"  {len(fora)} peças não existem no pavimento e saíram da planta (lista no relatorio.json)")
    rel_furos = por_furos(cfg, detalhes, formas)
    rel_inst = por_instalacoes(cfg, detalhes, formas, rel_furos)
    if args.so_gerar:
        saida = pathlib.Path(args.so_gerar).resolve()
        if dentro_de_repositorio(saida):
            raise ErroPublicacao("a pasta de saída está dentro de um repositório git: dado de obra não entra no repositório")
        # Sem servidor não há id de verdade: usa ids fixos, calculados do nome. Assim o mesmo pilar tem o
        # mesmo id nos trechos em que aparece, pavimentos diferentes não se misturam e gerar de novo
        # não muda os ids (as marcações de teste na bancada continuam valendo).
        ids = {(p["tipo"], p["nome"]): id_local(cfg["obra"], cfg["pavimento"], p["tipo"], p["nome"]) for fm in formas for p in fm["pecas"]}
        for fm in formas:
            planta_id = id_local(cfg["obra"], cfg["pavimento"], "planta", f"{fm['trecho']}|{fm['prancha']}")
            cab = {"planta_id": planta_id, "obra": cfg["obra"], "pavimento": cfg["pavimento"], "trecho": fm["trecho"]}
            pasta = saida / fm["trecho"].replace(" ", "_")
            man, binario, rel = montar_trecho(fm, detalhes, ids, cab, detalhes_anteriores(pasta))
            pasta.mkdir(parents=True, exist_ok=True)
            (pasta / "manifest.json").write_bytes(man)
            (pasta / "pacote.bin").write_bytes(binario)
            rel.update({"planta_id": planta_id, "pasta": pasta.name, "largura": fm["largura"], "altura": fm["altura"], "revisao": fm["revisao"],
                        "manifest": {"sha256": pacote.sha256(man), "tamanho": len(man)},
                        "pacote": {"sha256": pacote.sha256(binario), "tamanho": len(binario)}})
            if fm.get("origens"):
                rel["origens"] = fm["origens"]
            if fm.get("disciplina") == "vedacao" and fm.get("resumo"):
                rel["vedacao"] = fm["resumo"]
            if fm.get("disciplina") == "arquitetura" and fm.get("resumo"):
                resumo_amb = dict(fm["resumo"])
                modelo = resumo_amb.pop("modelo_de_nomes", None)
                rel["ambientes"] = resumo_amb  # apartamentos, tipos e o que a tabela de nomes não cobriu
                if modelo:
                    # a tabela de nomes para preencher (ou completar), ao lado do pacote
                    (pasta / "nomes_para_preencher.json").write_text(json.dumps(modelo, ensure_ascii=False, indent=1), encoding="utf-8")
                    print(f"  tabela de nomes para preencher: {pasta / 'nomes_para_preencher.json'}")
            relatorios.append(rel)
            print(f"  {fm['trecho']}: {rel['elementos']} locais ({rel['pilares']} pilares, {rel['vigas']} vigas), {rel['mb']} MB -> {pasta}")
        secoes = {(p["tipo"], p["nome"]): p["secao"] for fm in formas for p in fm["pecas"]}
        resumo = {
            "obra": cfg["obra"],
            "pavimento": cfg["pavimento"],
            "pecas": [{"id": i, "tipo": t, "nome": n, "secao": secoes.get((t, n)) or ""} for (t, n), i in sorted(ids.items())],
            "pecas_unicas": {t: len({k[1] for k in ids if k[0] == t}) for t in ("P", "V", "A", "F", "M")},
            "pranchas_de_detalhe": {"P": len(cfg["det_pilares"]), "V": len(cfg["det_vigas"])},
            "pecas_com_detalhe": {t: len(detalhes[t]) for t in ("P", "V")},
            "fora_do_pavimento": fora,
            "so_detalhe": sorted(p["nome"] for fm in formas for p in fm["pecas"] if (detalhes.get(p["tipo"], {}).get(p["nome"]) or {}).get("situacao") == "nasce"),
            "detalhes_sem_peca": {t: sorted(set(detalhes[t]) - {k[1] for k in ids if k[0] == t}) for t in ("P", "V")},
            "trechos": relatorios,
        }
        if rel_furos is not None:
            resumo["furos"] = rel_furos
        if rel_inst is not None:
            resumo["instalacoes"] = rel_inst
        if rel_barras is not None:
            from alinhamento import relatorio as rel_alinhamento

            resumo["barras_laje"] = rel_barras
            rel_alinhamento.gravar(saida, rel_barras["conflitos"])
        (saida / "relatorio.json").write_text(json.dumps(resumo, ensure_ascii=False, indent=1), encoding="utf-8")
        return relatorios

    import sessao_local

    sb = Supabase(args.url, args.chave)
    entrar(sb, args.email)
    srv = Servidor(sb, sessao_local.dispositivo_id())
    # --so-armadura, --so-vedacao, --so-hidro, --so-sanitario: um de cada vez (grupo exclusivo no main)
    for disc in ("armadura", "vedacao", *mod_inst.DISCIPLINAS):
        if getattr(args, f"so_{disc}", False):
            formas = so_disciplina(formas, disc)
            break
    if getattr(args, "so_instalacoes", False):
        formas = [fm for d in mod_inst.DISCIPLINAS if any(f.get("disciplina") == d for f in formas) for fm in so_disciplina(formas, d)]
        if not formas:
            raise ErroPublicacao("--so-instalacoes: o pavimento.json não gerou nenhuma planta de instalações (falta \"instalacoes\"?)")
    return publicar_no_servidor(srv, cfg, detalhes, formas, args.aceita_ambientes, getattr(args, "aceita_paredes", False))


FALTA_PARA_A_DISCIPLINA = {"armadura": "\"barras_laje\"", "vedacao": "\"vedacao\" em \"ambientes\"",
                           **{d: "\"instalacoes\"" for d in mod_inst.DISCIPLINAS}}


def so_disciplina(formas: list[dict], disciplina: str) -> list[dict]:
    """--so-armadura, --so-vedacao, --so-hidro, --so-sanitario: só as plantas dessa disciplina (a armadura de laje,
    uma por direção; a de modulação; a de pontos de instalações). A forma e os ambientes do pavimento ficam como estão no servidor (nenhuma revisão nova, nenhuma
    peça deles criada)."""
    so = [fm for fm in formas if fm.get("disciplina") == disciplina]
    if not so:
        raise ErroPublicacao(f"--so-{disciplina}: o pavimento.json não gerou nenhuma planta de {disciplina}"
                             f" (falta {FALTA_PARA_A_DISCIPLINA.get(disciplina, 'a configuração')}?)")
    return so


def so_armadura(formas: list[dict]) -> list[dict]:
    """--so-armadura: só as plantas de armadura de laje (so_disciplina)."""
    return so_disciplina(formas, "armadura")


def publicar_no_servidor(srv, cfg: dict, detalhes: dict, formas: list[dict], aceita_ambientes: bool = False,
                         aceita_paredes: bool = False) -> list[dict]:
    relatorios = []
    obra = srv.obra(cfg["obra"])
    pav = srv.pavimento(obra["id"], cfg["pavimento"])
    existentes = srv.obter("elementos", {"obra_id": f"eq.{obra['id']}", "pavimento_id": f"eq.{pav['id']}"})
    lidas = [(p["tipo"], p["nome"], p["secao"]) for fm in formas for p in fm["pecas"]]
    novas = pecas_a_criar(existentes, lidas)
    if novas:
        print(f"Criando {len(novas)} peças novas em elementos...")
        if any(t == "M" for t, _, _ in novas) and not aceita_paredes:
            raise ErroPublicacao("o servidor ainda não aceita paredes (tipo M) em \"elementos\": falta aplicar a migração "
                                 "20261120200000_nucleo_elementos_m.sql (núcleo). Use --aceita-paredes depois que ela entrar.")
        if any(t not in ("P", "V", "L", "M") for t, _, _ in novas) and not aceita_ambientes:
            raise ErroPublicacao("o servidor ainda não aceita ambientes nem furos em \"elementos\" (pedido ao núcleo em docs/modulos/1_fvs_status.md). "
                                 "Publique sem eles, ou use --aceita-ambientes depois que a migração do núcleo entrar.")
        criadas = srv.inserir("elementos", [
            {**srv._base(obra["id"]), "id": str(uuid.uuid4()), "pavimento_id": pav["id"], "tipo": t, "nome": n, "secao": s or None}
            for t, n, s in novas
        ])
        existentes += criadas
    ids = {(e["tipo"], e["nome"]): e["id"] for e in existentes if not e.get("apagado")}
    plantas = srv.obter("plantas", {"obra_id": f"eq.{obra['id']}", "pavimento_id": f"eq.{pav['id']}"})
    for fm in formas:
        setor = srv.setor(obra["id"], pav["id"], fm["trecho"], fm.get("disciplina") or DISCIPLINA)
        anterior = planta_vigente(plantas, setor["id"])
        planta_id = str(uuid.uuid4())
        cab = {"planta_id": planta_id, "obra": cfg["obra"], "pavimento": pav["nome"], "trecho": fm["trecho"]}
        man, binario, rel = montar_trecho(fm, detalhes, ids, cab)
        base = f"{obra['id']}/fvs/plantas/{planta_id}"
        print(f"Enviando {fm['trecho']} ({rel['mb']} MB)...")
        man_id = srv.enviar_arquivo(obra["id"], f"{base}/manifest.json", man, "application/json", "manifest.json")
        pac_id = srv.enviar_arquivo(obra["id"], f"{base}/pacote.bin", binario, "application/octet-stream", "pacote.bin")
        srv.inserir("plantas", [{**srv._base(obra["id"]), "id": planta_id, "pavimento_id": pav["id"], "setor_id": setor["id"],
                                 "prancha": fm["prancha"], "revisao": fm["revisao"], "largura": fm["largura"],
                                 "altura": fm["altura"], "manifest_id": man_id, "pacote_id": pac_id,
                                 "elementos": quantos_locais(fm), "substitui_id": anterior}])
        rel["planta_id"] = planta_id
        rel["substituiu"] = anterior
        relatorios.append(rel)
    return relatorios


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Publica a planta de forma de um pavimento (FVS).")
    ap.add_argument("config", help="pavimento.json (fora do repositório, junto das pranchas)")
    ap.add_argument("--so-gerar", metavar="PASTA", help="só grava os pacotes nesta pasta, sem publicar")
    ap.add_argument("--folha-unica", action="store_true", help="o pavimento inteiro numa planta só, sem trechos")
    ap.add_argument("--aceita-ambientes", action="store_true", help="o servidor já aceita ambientes em elementos (migração do núcleo aplicada)")
    grupo_so = ap.add_mutually_exclusive_group()
    grupo_so.add_argument("--so-armadura", action="store_true",
                          help="publica só as plantas de armadura de laje; a forma e os ambientes ficam como estão no servidor")
    grupo_so.add_argument("--so-vedacao", action="store_true",
                          help="publica só a planta de modulação (paredes de alvenaria); a forma e os ambientes ficam como estão no servidor")
    ap.add_argument("--aceita-paredes", action="store_true",
                    help="o servidor já aceita paredes (tipo M) em elementos (migração do núcleo aplicada)")
    for disc, nome in mod_inst.DISCIPLINAS.items():
        grupo_so.add_argument(f"--so-{disc}", action="store_true",
                              help=f"publica só a planta de {nome.lower()}; a forma e o resto do pavimento ficam como estão no servidor")
    grupo_so.add_argument("--so-instalacoes", action="store_true",
                          help="publica só as plantas de instalações (todas as disciplinas de \"instalacoes\"), lendo as pranchas uma vez")
    ap.add_argument("--email")
    ap.add_argument("--url", default=URL_PADRAO)
    ap.add_argument("--chave", default=CHAVE_PADRAO)
    args = ap.parse_args(argv)
    try:
        cfg = ler_config(pathlib.Path(args.config))
        cfg["folha_unica"] = cfg["folha_unica"] or args.folha_unica
        rels = publicar(cfg, args)
    except (ErroPublicacao, ErroExportacao, pacote.ErroPacote) as e:
        print(f"PROBLEMA: {e}")
        return 1
    print("\nResumo:")
    for r in rels:
        avisos = []
        if r["sem_contorno"]:
            avisos.append(f"sem contorno (só o nome é tocável): {', '.join(r['sem_contorno'])}")
        if r["sem_detalhe"]:
            avisos.append(f"sem detalhe: {', '.join(r['sem_detalhe'])}")
        print(f"- {r['trecho']} ({r['prancha']}): {r['elementos']} locais ({r['pilares']} pilares, {r['vigas']} vigas), {r['mb']} MB"
              + (f"; substituiu a planta {r['substituiu']}" if r.get("substituiu") else ""))
        for a in avisos:
            print(f"    {a}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
