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
  "furos_laje_separados": false                     opcional: sem as plantas de furos de laje (uma por camada: esgoto, água,
                                                   elétrica; o padrão quando há furos de laje); os furos ficam na aba Furos da forma
  "instalacoes": {"hidro": {"ifc": "../Hidro/modelo.ifc", "nivel": "2º PAVIMENTO"},   opcional: uma planta por disciplina
                  "sanitario", "eletrico", "spda": {"ifc": [...], "nivel": [...]},  com os pontos do modelo (instalacoes.py); só com a
                  "encaixe": {...},                                 folha única; encaixe = o dos furos, ou este à mão
                  "ambientes": {"ifc", "andar", "prancha"}}         opcional: o ambiente de cada ponto (a arquitetura do andar);
                  ou {"pacote": ".../Ambientes", "prancha", "escala", "ifc", "andar"}: pavimento sem IFC (25/11), salas do
                  pacote da planta de ambientes do PDF, prancha casada com as paredes de um andar tipo ("ifc"/"andar")
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

Blocos de fundação (blocos.py, com "fundacao" num pavimento.json só da fundação): as pranchas de locação viram uma
planta (setor "Blocos", disciplina "fundacao") em que cada bloco é um local "K" ("BL-P65", o nome do pilar que ele
carrega), conferido pela ficha de blocos de fundação. Os nomes dos pilares saem das formas já geradas (--so-gerar) de
outros pavimentos:
  "fundacao": {"locacao": "../Fundacao/*.FU.LO.*.pdf", "referencias": ["../pacotes/01_subsolo"], "trecho": "Blocos"}
Publicar pede --aceita-blocos (o tipo "K" em elementos é da migração 20261122180000_nucleo_elementos_s_k.sql).
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
import re
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
    if not cfg.get("formas") and not cfg.get("ambientes") and not cfg.get("plotada") and not cfg.get("fundacao"):
        raise ErroPublicacao(f"{caminho.name} não tem \"formas\" (estrutura), \"ambientes\" (arquitetura) nem \"fundacao\" (blocos)")

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
        # "fonte": "pdf" (pavimento sem IFC): as salas e os nomes saem só da prancha (ambientes_pdf.py)
        do_pdf = amb.get("fonte") == "pdf"
        for campo in ("prancha",) if do_pdf else ("ifc", "prancha"):
            achados = arquivos(amb.get(campo))
            if len(achados) != 1:
                raise ErroPublicacao(f"ambientes: \"{campo}\" tem que ser um arquivo só (achei {len(achados)})")
            amb[campo] = achados[0]
        for campo in ("nomes", "fichas_por_comodo"):
            if amb.get(campo):
                achados = arquivos(amb[campo])
                if len(achados) != 1:
                    raise ErroPublicacao(f"ambientes: \"{campo}\" tem que ser um arquivo só (achei {len(achados)})")
                amb[campo] = achados[0]
        if amb.get("fichas_por_comodo") and not amb.get("nomes") and not do_pdf:
            raise ErroPublicacao("ambientes: \"fichas_por_comodo\" precisa dos \"nomes\" dos cômodos")
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
    furacao = None
    if cfg.get("furacao"):
        bruto = cfg["furacao"] if isinstance(cfg["furacao"], dict) else {"pdf": cfg["furacao"]}
        achados = arquivos(bruto.get("pdf"))
        if not achados:
            raise ErroPublicacao("furacao: nenhuma prancha de furação achada (\"pdf\")")
        furacao = {"pdfs": achados, "escala": float(bruto.get("escala") or 75), "alinhamento": bruto.get("alinhamento") or {},
                   "tipo_de": bruto.get("tipo_de")}
    inst = None
    if cfg.get("instalacoes"):
        bruto = dict(cfg["instalacoes"])
        inst = {"encaixe": bruto.pop("encaixe", None), "disciplinas": {}}
        amb_inst = bruto.pop("ambientes", None)
        if amb_inst:
            # 23/11 (5.1 a 5.3): o ambiente de cada ponto. O mesmo bloco "ambientes" da planta de ambientes do
            # pavimento, ou o caminho do pavimento.json dela (o modelo de arquitetura e a prancha casada)
            if isinstance(amb_inst, str):
                arq_amb = (caminho.parent / amb_inst) if not pathlib.Path(amb_inst).is_absolute() else pathlib.Path(amb_inst)
                try:
                    amb_inst = json.loads(arq_amb.read_text(encoding="utf-8"))["ambientes"]
                except (OSError, KeyError, ValueError) as e:
                    raise ErroPublicacao(f"instalacoes: \"ambientes\": não li {arq_amb.name} ({e})") from e
            if not isinstance(amb_inst, dict) or not all(amb_inst.get(k) for k in ("ifc", "andar", "prancha")):
                raise ErroPublicacao("instalacoes: \"ambientes\" precisa do \"ifc\", do \"andar\" e da \"prancha\" da arquitetura")
            if amb_inst.get("pacote"):
                # 25/11: pavimento sem IFC de arquitetura (mezanino, pilotis, subsolo): as salas vêm do pacote da
                # planta de ambientes tirada do PDF; "ifc" e "andar" são de um andar tipo, só para casar a prancha
                # com o modelo (o núcleo e os pilares se repetem)
                pac = (caminho.parent / amb_inst["pacote"]) if not pathlib.Path(amb_inst["pacote"]).is_absolute() else pathlib.Path(amb_inst["pacote"])
                if pac.is_dir():
                    pac = pac / "manifest.json"
                if not pac.is_file():
                    raise ErroPublicacao(f"instalacoes: \"ambientes\": não achei o pacote {pac}")
                amb_inst = {**amb_inst, "pacote": str(pac)}
            inst["ambientes"] = amb_inst
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
            if valor.get("pdf"):  # fundo das pranchas da disciplina, coladas pelos pilares (como a furação)
                pdfs = arquivos(valor["pdf"])
                if not pdfs:
                    raise ErroPublicacao(f"instalacoes: {disc}: nenhuma prancha achada (\"pdf\")")
                inst["disciplinas"][disc].update({"pdfs": pdfs, "escala": float(valor.get("escala") or 75),
                                                  "alinhamento": valor.get("alinhamento") or {}})
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
    fundacao = None
    if cfg.get("fundacao"):
        bruto = dict(cfg["fundacao"])
        locacao = arquivos(bruto.get("locacao"))
        if not locacao:
            raise ErroPublicacao("fundacao: nenhuma prancha de locação achada (\"locacao\")")
        refs = []
        for r in bruto.get("referencias") or []:
            pasta = pathlib.Path(r)
            pasta = pasta if pasta.is_absolute() else base / pasta
            if not (pasta / "relatorio.json").is_file():
                raise ErroPublicacao(f"fundacao: cada \"referencias\" é a pasta gerada (--so-gerar) de um pavimento (falta {pasta / 'relatorio.json'})")
            refs.append(str(pasta))
        if not refs:
            raise ErroPublicacao("fundacao: falta \"referencias\" (as pastas geradas dos pavimentos de onde saem os nomes dos pilares)")
        fundacao = {**bruto, "locacao": locacao, "referencias": refs}
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
        "fundacao": fundacao,
        "det_pilares_obra": arquivos(cfg.get("det_pilares_obra")),
        "manter_sem_detalhe": [t for t in cfg.get("manter_sem_detalhe") or [] if t in ("P", "V")],
        "det_consolos": arquivos(cfg.get("det_consolos")),
        "det_macicos": arquivos(cfg.get("det_macicos")),
        "furos": fur,
        "barras_laje": barras,
        "instalacoes": inst,
        "furacao": furacao,
        "camadas_separadas": cfg.get("camadas_separadas", True) is not False,
        "furos_laje_separados": cfg.get("furos_laje_separados", True) is not False,
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


def ambiente_pelo_id(pontos: dict | None, ids: dict[tuple[str, str], str]) -> dict | None:
    """O "ambiente" do ponto sai do pipeline com o nome do ambiente ("201-03"); no pacote vai o id dele em
    elementos (tipo A), o mesmo que a ficha de ambiente usa (pedido do 10, 23/11). Ambiente sem id (a planta de
    ambientes do pavimento ainda não publicada) e ponto sem ambiente vão sem o campo."""
    if not pontos:
        return pontos
    saida = {}
    for pid, p in pontos.items():
        p = dict(p)
        nome = p.pop("ambiente", None)
        if nome and ids.get(("A", nome)):
            p["ambiente"] = ids[("A", nome)]
        saida[pid] = p
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
        if p.get("sem_fichas"):
            reg["sem_fichas"] = p["sem_fichas"]
        if p.get("grade"):
            reg["grade"] = p["grade"]  # quadrado da grade de escavação (blocos.py, item 1.2)
        if p["tipo"] == "F":
            if p.get("viga"):
                reg["viga"] = ids[("V", p["viga"])]
            if p.get("pilar"):
                reg["pilar"] = ids[("P", p["pilar"])]
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
        elif p["tipo"] not in ("A", "F", "E", "M", "K", "S"):  # ambiente, furo, esquadria, parede e bloco não têm prancha de detalhe
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
    if forma.get("furos_separados"):
        cab["furos_separados"] = True
    if forma.get("fichas_da_grade") is not None:
        cab["fichas_da_grade"] = forma["fichas_da_grade"]  # só essas fichas valem nos quadrados da escavação
    if forma.get("disciplina") in (*mod_inst.DISCIPLINAS, "furacao"):
        cab["disciplina"] = forma["disciplina"]
    if forma.get("furos_laje"):
        cab["furos_laje"] = forma["furos_laje"]
    if forma.get("furos_laje_separados"):
        cab["furos_laje_separados"] = True
    pontos = ambiente_pelo_id(forma.get("pontos"), ids)
    manifest, binario = pacote.montar(cab, forma["tiles"], elementos, dets, forma.get("barras"), pontos)
    rel = {
        "trecho": cab.get("trecho"),
        "prancha": forma["prancha"],
        "pilares": sum(1 for p in forma["pecas"] if p["tipo"] == "P"),
        "vigas": sum(1 for p in forma["pecas"] if p["tipo"] == "V"),
        "furos": sum(1 for p in forma["pecas"] if p["tipo"] == "F"),
        "esquadrias": sum(1 for p in forma["pecas"] if p["tipo"] == "E"),
        "paredes": sum(1 for p in forma["pecas"] if p["tipo"] == "M"),
        "blocos": sum(1 for p in forma["pecas"] if p["tipo"] == "K"),
        "estacas": sum(1 for p in forma["pecas"] if p["tipo"] == "S"),
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
    # só a planta de estrutura (a de furação, armadura ou instalações do mesmo pavimento não conta)
    trechos = [t for t in rel.get("trechos") or [] if (t.get("disciplina") or DISCIPLINA) == DISCIPLINA]
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
    if forma.get("furos_laje"):
        return sum(1 for p in forma["pecas"] if mod_furos.camada_do_furo(p) == forma["furos_laje"])
    return len(forma["pecas"])


def por_furos_de_laje(cfg: dict, formas: list[dict]) -> list[dict]:
    """Uma planta por camada de furos de laje (esgoto, água, elétrica; furos.folhas_de_furos_de_laje),
    acrescentada a formas. Por padrão sim quando há furos de laje; "furos_laje_separados": false no
    pavimento.json deixa os furos só na aba Furos da forma."""
    if not cfg.get("furos") or cfg.get("furos_laje_separados") is False:
        return []
    fm = next((f for f in formas if (f.get("disciplina") or DISCIPLINA) == DISCIPLINA), None)
    if fm is None:
        return []
    folhas = mod_furos.folhas_de_furos_de_laje(fm)
    if folhas:
        print("Montando os furos de laje em plantas próprias, uma por camada:")
        for f in folhas:
            print(f"  {f['trecho']}: {quantos_locais(f)} furos")
    formas.extend(folhas)
    return folhas


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
        conferir = mod_inst.a_conferir(pontos, fm["pecas"]) if disc == "spda" else None
        folha = mod_inst.folha_da_disciplina(fm, disc, pontos)
        rel[disc] = mod_inst.resumo(pontos, fora)
        if conferir:
            rel[disc]["a_conferir"] = conferir
            if conferir["descida_longe_de_pilar"] or conferir["fora_da_estrutura"]:
                print(f"  a conferir: {len(conferir['descida_longe_de_pilar'])} descidas longe de pilar; "
                      f"{len(conferir['fora_da_estrutura'])} pontos longe de toda a estrutura saíram da planta (lista no relatorio.json)")
        c = cfg["instalacoes"]["disciplinas"][disc]
        if c.get("pdfs"):
            rel[disc]["pranchas"] = fundo_das_pranchas(folha, fm, c)
        formas.append(folha)
        print(f"  {mod_inst.DISCIPLINAS[disc]}: {len(pontos)} pontos na folha"
              + (f"; {len(fora)} fora da folha (lista no relatorio.json; encaixe errado ou ponto de outro pavimento)" if fora else ""))
    return rel


def fundo_das_pranchas(folha: dict, fm: dict, c: dict) -> list[dict]:
    """Troca o fundo da planta da disciplina (a forma) pelas pranchas da disciplina, encaixadas pelos pilares como
    as de furação (furacao_fundo.py). Sem prancha encaixada, o fundo continua o da forma. Devolve o resumo."""
    import armadura_laje
    import folha_unica
    import furacao_fundo

    print(f"  lendo as pranchas da disciplina: {len(c['pdfs'])}")
    try:
        lidas = [furacao_fundo.ler_prancha(p, c["escala"]) for p in c["pdfs"]]
    except furacao_fundo.ErroFuracao as e:
        raise ErroPublicacao(f"instalacoes: {e}") from e
    alinhadas, resumo = furacao_fundo.alinhar_pranchas(fm["pecas"], lidas, c.get("alinhamento") or {})
    for r in resumo:
        a = r["alinhamento"]
        print(f"    {r['prancha']}: " + (f"{a['pontos']} de {a['total']} pilares batem (erro até {a['residuo_max_cm']} cm)"
                                           + (f"; pilar em cinza {a['tom_do_pilar']}" if a.get("tom_do_pilar") is not None else "") if a["ok"]
                                           else f"NÃO ENCAIXOU ({a['motivo']}); fica fora do fundo"))
    if not alinhadas:
        print("    nenhuma prancha encaixou: o fundo fica o da forma")
        return resumo
    if len(alinhadas) == 1:
        nome = alinhadas[0]["nome"]
        revisao = nome.rsplit("-", 1)[-1] if "-R" in nome else "R00"
    else:
        nome, revisao = folha_unica.nome_da_folha([p["nome"] for p in alinhadas])
    folha.update({"prancha": nome, "revisao": revisao, "tiles": armadura_laje.tiles_da_camada(alinhadas, fm["niveis"]),
                  "origens": [{"prancha": p["nome"], "transformacao": p["transformacao"]} for p in alinhadas]})
    print(f"    {len(alinhadas)} pranchas coladas no fundo")
    return resumo


def por_furacao(cfg: dict, formas: list[dict]) -> dict | None:
    """A planta de furação (furacao_fundo.py), acrescentada a formas: o fundo das pranchas de furação,
    encaixadas pelos pilares, com os furos da forma. Precisa de "furos" (os furos vêm do modelo)."""
    if not cfg.get("furacao"):
        return None
    import furacao_fundo

    estrutura = [fm for fm in formas if (fm.get("disciplina") or DISCIPLINA) == DISCIPLINA]
    if len(estrutura) != 1:
        raise ErroPublicacao("furacao: só com a planta do pavimento numa folha só (\"folha_unica\": true ou \"plotada\")")
    fm = estrutura[0]
    print(f"Lendo as pranchas de furação: {len(cfg['furacao']['pdfs'])}")
    try:
        lidas = [furacao_fundo.ler_prancha(p, cfg["furacao"]["escala"]) for p in cfg["furacao"]["pdfs"]]
    except furacao_fundo.ErroFuracao as e:
        raise ErroPublicacao(f"furacao: {e}") from e
    alinhadas, resumo = furacao_fundo.alinhar_pranchas(fm["pecas"], lidas, cfg["furacao"]["alinhamento"])
    for r in resumo:
        a = r["alinhamento"]
        print(f"  {r['prancha']}: " + (f"{a['pontos']} de {a['total']} pilares batem (erro até {a['residuo_max_cm']} cm)"
                                         + (f"; pilar em cinza {a['tom_do_pilar']}" if a.get("tom_do_pilar") is not None else "") if a["ok"]
                                         else f"NÃO ENCAIXOU ({a['motivo']}); fica fora do fundo"))
    folha = furacao_fundo.folha_de_furacao(fm, alinhadas)
    if folha:
        formas.append(folha)
    else:
        print("  sem planta de furação (nenhuma prancha encaixou ou o pavimento não tem furos)")
    pt_por_cm = 72 / 2.54 / 50
    conferir = furacao_fundo.a_conferir(fm["pecas"], pt_por_cm)
    conferir["sem_desenho"] = furacao_fundo.sem_desenho(fm["pecas"], furacao_fundo.simbolos_de_furo(alinhadas), pt_por_cm) if alinhadas else []
    tipo_de = cfg["furacao"].get("tipo_de")
    if folha and tipo_de:
        furacao_fundo.marcar_tipo(folha["pecas"], tipo_de, conferir["sem_desenho"])
        print(f"  furos do {tipo_de} (tipo): {len(folha['pecas']) - len(conferir['sem_desenho'])} batem com a prancha deste pavimento,"
              f" {len(conferir['sem_desenho'])} sem desenho (marcados a conferir)")
    elif conferir["sem_desenho"]:
        print(f"  {len(conferir['sem_desenho'])} furos do modelo sem símbolo na prancha de furação")
    if any(conferir.values()):
        print(f"  a conferir (ficam na planta; lista no relatorio.json): {len(conferir['fora_do_contorno'])} furos fora do contorno da forma,"
              f" {len(conferir['mesmo_ponto'])} pontos com furos repetidos ({sum(len(g) for g in conferir['mesmo_ponto'])} furos),"
              f" {len(conferir['em_fila'])} filas de furos ({sum(len(c['furos']) for c in conferir['em_fila'])} furos)")
    return {"pranchas": resumo, "furos": len(folha["pecas"]) if folha else 0, "a_conferir": conferir}


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

# O arquivo de uma planta nunca muda: cada publicação vai para uma pasta nova ({obra}/fvs/plantas/{planta_id}/,
# id novo a cada revisão) e o envio recusa sobrescrever (x-upsert false). Então pode ficar guardado por um
# ano no navegador e no CDN. Sem este cabeçalho o armazenamento gravava "no-cache" (24/11/2026: a organização
# passou do limite de dados do plano grátis do Supabase).
CACHE_DA_PLANTA = "public, max-age=31536000, immutable"


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
                                     headers=self.sb._cabecalhos({"Content-Type": tipo, "x-upsert": "false",
                                                                    "cache-control": CACHE_DA_PLANTA}))
        try:
            with urllib.request.urlopen(req, timeout=300) as r:
                r.read()
        except urllib.error.HTTPError as e:
            corpo = e.read()[:300].decode("utf-8", "replace")
            raise ErroPublicacao(f"envio de {nome} recusado (HTTP {e.code}): {corpo}") from e
        linha = {**self._base(obra_id), "id": str(uuid.uuid4()), "caminho": caminho, "nome_original": nome,
                 "hash": pacote.sha256(dados), "tamanho": len(dados), "tipo": tipo}
        return self.inserir("arquivos", [linha])[0]["id"]


def arquivo_de_sessao(url: str, padrao: pathlib.Path) -> pathlib.Path:
    """O login guardado de cada servidor: o da obra (URL_PADRAO) no arquivo de sempre; outro servidor (o de
    testes, 23/11) num arquivo próprio, para não renovar nem apagar o login da obra (o vigia usa o mesmo)."""
    if url.rstrip("/") == URL_PADRAO.rstrip("/"):
        return padrao
    ref = re.sub(r"[^a-z0-9]", "", url.split("//")[-1].split(".")[0].lower()) or "outro"
    return padrao.with_name(f"sessao_supabase_{ref}.json")


_RAIZ = pathlib.Path(__file__).resolve().parents[2]
# o .env da raiz; numa cópia de trabalho (.claude/worktrees/<nome>), o da pasta principal do repositório
ENV = _RAIZ / ".env" if (_RAIZ / ".env").exists() or _RAIZ.parent.name != "worktrees" else _RAIZ.parents[2] / ".env"


def conta_de_teste(url: str, env: pathlib.Path = ENV) -> tuple[str, str] | None:
    """(e-mail, senha) da conta de teste, se o .env da raiz (fora do git) tem SUPABASE_TESTES_URL igual a este
    servidor, SUPABASE_TESTES_USUARIO e SUPABASE_TESTES_SENHA (23/11/2026, pedido do Professor: o servidor de
    testes entra com a conta de teste, sem a sessão guardada do PC). Nunca vale para o servidor da obra."""
    try:
        linhas = env.read_text(encoding="utf-8").splitlines()
    except OSError:
        return None
    v = {}
    for ln in linhas:
        k, _, val = ln.partition("=")
        if _ and not k.strip().startswith("#"):
            v[k.strip()] = val.strip().strip("'\"")
    alvo = (v.get("SUPABASE_TESTES_URL") or "").rstrip("/")
    if not alvo or alvo != url.rstrip("/") or alvo == URL_PADRAO.rstrip("/"):
        return None
    if not v.get("SUPABASE_TESTES_USUARIO") or not v.get("SUPABASE_TESTES_SENHA"):
        return None
    return v["SUPABASE_TESTES_USUARIO"], v["SUPABASE_TESTES_SENHA"]


def entrar(sb: Supabase, email: str | None) -> None:
    import sessao_local  # do módulo Projetos: guarda o login no PC (fora do repositório)

    conta = conta_de_teste(sb.url)
    if conta:  # servidor de testes com a conta de teste do .env: não lê nem grava login guardado
        sb.entrar_com_senha(*conta)
        print("Entrou no servidor de testes com a conta de teste do .env.")
        return

    sessao_local.ARQUIVO_SESSAO = arquivo_de_sessao(sb.url, sessao_local.PASTA / "sessao_supabase.json")
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
        if r.get("fichas_por_comodo"):
            fc = r["fichas_por_comodo"]
            fora = fc["tipos_fora_da_tabela"]
            print(f"  fichas por cômodo: {fc['com_regra']} ambientes com regra"
                  + (f"; tipos fora da tabela (todas as fichas valem): {', '.join(f'{k} ({v})' for k, v in fora.items())}" if fora else ""))
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
    if cfg.get("fundacao"):
        formas.append(ler_fundacao(cfg["fundacao"]))
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
        if cfg["instalacoes"].get("ambientes"):
            import ambientes as mod_amb

            c_amb = cfg["instalacoes"]["ambientes"]
            try:
                if c_amb.get("pacote"):
                    geometrias = ambientes_do_pacote_casado(c_amb)
                else:
                    b = mod_amb.base_da_planta(c_amb)
                    geometrias = {a["nome"]: b["ambientes"][a["indice"]] for a in b["nomeados"]}
            except (mod_amb.ErroAmbientes, mod_inst.ErroInstalacoes) as e:
                raise ErroPublicacao(f"instalacoes: ambientes: {e}") from e
            for disc, lidos in detalhes["instalacoes"].items():
                r = mod_inst.ambiente_dos_pontos(lidos, geometrias)
                print(f"  {mod_inst.DISCIPLINAS[disc]}: {r['com_ambiente']} pontos num ambiente, {r['sem_ambiente']} fora")
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


COINCIDENCIA_MIN_OUTRO_ANDAR = 0.10  # prancha do pavimento casada com as paredes de um andar tipo (obra piloto: 0,15)


def ambientes_do_pacote_casado(c: dict) -> dict:
    """As salas do pacote da planta de ambientes tirada do PDF, nas coordenadas do modelo (metros). A prancha é
    casada com as paredes do andar tipo de "ifc"/"andar" (ambientes.casar_com_a_prancha): na obra piloto, o 2º, o
    3º e o 6º dão o mesmo encaixe no mezanino."""
    import ambientes as mod_amb
    import pymupdf as fitz
    from shapely import wkt

    escala = float(c.get("escala") or 200)
    dados = mod_amb.do_ifc_com_guarda(c["ifc"], str(c["andar"]))
    with fitz.open(c["prancha"]) as doc:
        t = mod_amb.casar_com_a_prancha(doc[0], wkt.loads(dados["paredes"]), escala)
    print(f"  ambientes do pacote {pathlib.Path(c['pacote']).parent.name}: prancha casada com o andar {c['andar']} "
          f"(coincidência {t['coincidencia']:.0%})")
    if t["coincidencia"] < COINCIDENCIA_MIN_OUTRO_ANDAR:
        raise mod_inst.ErroInstalacoes(f"a prancha não casou com o andar {c['andar']} (coincidência {t['coincidencia']:.0%}); "
                                       "confira a escala e o andar de referência")
    manifest = json.loads(pathlib.Path(c["pacote"]).read_text(encoding="utf-8"))
    return mod_inst.ambientes_do_pacote(manifest, mod_inst.prancha_para_modelo(t))


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


def ler_fundacao(cfg_fund: dict) -> dict:
    """A planta de blocos de fundação (blocos.py): cada bloco das pranchas de locação, um local "K"."""
    import blocos

    print(f"Lendo a locação: {len(cfg_fund['locacao'])} pranchas, nomes dos pilares de {len(cfg_fund['referencias'])} pavimentos gerados")
    try:
        return blocos.ler_planta(cfg_fund)
    except blocos.ErroBlocos as e:
        raise ErroPublicacao(f"fundação: {e}") from e


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
    # a planta de furação única, com as pranchas de furação no fundo (pedido do Nicolas de 21/11: "aba separada,
    # projeto dos furos completo"), substitui as plantas de furos de laje por camada (por_furos_de_laje)
    rel_furacao = por_furacao(cfg, formas)
    if args.so_gerar:
        saida = pathlib.Path(args.so_gerar).resolve()
        if dentro_de_repositorio(saida):
            raise ErroPublicacao("a pasta de saída está dentro de um repositório git: dado de obra não entra no repositório")
        # Sem servidor não há id de verdade: usa ids fixos, calculados do nome. Assim o mesmo pilar tem o
        # mesmo id nos trechos em que aparece, pavimentos diferentes não se misturam e gerar de novo
        # não muda os ids (as marcações de teste na bancada continuam valendo).
        ids = {(p["tipo"], p["nome"]): id_local(cfg["obra"], cfg["pavimento"], p["tipo"], p["nome"]) for fm in formas for p in fm["pecas"]}
        # o ambiente dos pontos de instalações: o id fixo do ambiente (o mesmo da planta de ambientes gerada)
        ids |= {("A", p["ambiente"]): id_local(cfg["obra"], cfg["pavimento"], "A", p["ambiente"])
                for fm in formas for p in (fm.get("pontos") or {}).values() if p.get("ambiente")}
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
            if fm.get("disciplina") == "fundacao" and fm.get("resumo"):
                rel["fundacao"] = fm["resumo"]
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
            "pecas_unicas": {t: len({k[1] for k in ids if k[0] == t}) for t in ("P", "V", "A", "F", "M", "K", "S")},
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
        if rel_furacao is not None:
            resumo["furacao"] = rel_furacao
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
    for disc in ("armadura", "vedacao", "furacao", *mod_inst.DISCIPLINAS):
        if getattr(args, f"so_{disc}", False):
            formas = so_disciplina(formas, disc)
            break
    if getattr(args, "so_instalacoes", False):
        formas = [fm for d in mod_inst.DISCIPLINAS if any(f.get("disciplina") == d for f in formas) for fm in so_disciplina(formas, d)]
        if not formas:
            raise ErroPublicacao("--so-instalacoes: o pavimento.json não gerou nenhuma planta de instalações (falta \"instalacoes\"?)")
    return publicar_no_servidor(srv, cfg, detalhes, formas, args.aceita_ambientes, getattr(args, "aceita_paredes", False),
                                getattr(args, "aceita_blocos", False))


FALTA_PARA_A_DISCIPLINA = {"armadura": "\"barras_laje\"", "furacao": "\"furacao\" (as pranchas de furação) e \"furos\"",
                           "vedacao": "\"vedacao\" em \"ambientes\"",
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
                         aceita_paredes: bool = False, aceita_blocos: bool = False) -> list[dict]:
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
        if any(t in ("K", "S") for t, _, _ in novas) and not aceita_blocos:
            raise ErroPublicacao("blocos e estacas de fundação (tipos K e S) em \"elementos\" pedem a migração 20261122180000_nucleo_elementos_s_k.sql "
                                 "(núcleo). Use --aceita-blocos se ela já está no servidor.")
        if any(t not in ("P", "V", "L", "M", "K", "S") for t, _, _ in novas) and not aceita_ambientes:
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
    grupo_so.add_argument("--so-furacao", action="store_true",
                          help="publica só a planta de furação (fundo das pranchas de furação, com os furos); a forma fica como está no servidor")
    ap.add_argument("--aceita-paredes", action="store_true",
                    help="o servidor já aceita paredes (tipo M) em elementos (migração do núcleo aplicada)")
    ap.add_argument("--aceita-blocos", action="store_true",
                    help="o servidor já aceita blocos de fundação (tipo K) em elementos (migração do núcleo aplicada)")
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
        sem_prancha = (r.get("partes") or {}).get("macico_sem_prancha")
        if sem_prancha:
            avisos.append(f"ATENÇÃO: maciço na forma e em nenhuma prancha de maciços (sem capitel): {', '.join(sem_prancha)}")
        print(f"- {r['trecho']} ({r['prancha']}): {r['elementos']} locais ({r['pilares']} pilares, {r['vigas']} vigas), {r['mb']} MB"
              + (f"; substituiu a planta {r['substituiu']}" if r.get("substituiu") else ""))
        for a in avisos:
            print(f"    {a}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
