"""Outra obra completa no SERVIDOR DE TESTES, lida de um pacote de obra (pasta com obra.json) FORA do repositório.

É a mesma carga da obra EXE (carga_exe.py), com as mesmas travas, mas os dados vêm de fora: a obra pública de
demonstração (creche padrão FNDE) ou qualquer outra. O repositório só tem o leitor; o pacote (json, imagens das
pranchas, PDFs) fica na pasta da obra, fora do git.

Travas (as de carga_exe.py):
- só grava no servidor de testes (tbscnqazrveiaoqgpgxs); o servidor da obra de verdade nunca;
- toda linha e todo arquivo são da obra do pacote; o SQL recusa se o id ou o código dela já forem de outra obra;
- o código da obra não pode ser EXE (essa é a do carga_exe.py) e precisa ser curto, maiúsculo, sem espaço;
- ids fixos (UUID v5 com o código da obra): rodar duas vezes não duplica.

Uso (no PC, na raiz do repositório):
    py pipeline/demo/carga_pacote.py gerar PACOTE SAIDA --usuario UUID [--hoje AAAA-MM-DD]
    py pipeline/demo/carga_exe.py enviar SAIDA        (o envio é o mesmo da EXE; a SAIDA diz de que obra é)

O pacote (PACOTE/obra.json; os caminhos de arquivo são relativos a PACOTE):
{
  "versao": 1,
  "obra": {"codigo": "CPT2", "nome": "...", "empresa": "...", "credito": "FNDE/MEC"},
  "pavimentos": [{"nome": "Térreo", "ordem": 1}],
  "fichas": "exemplo",                      (as genéricas EXE-PVS-001/002/003 do carga_exe.py) ou [ficha, ...]
  "plantas": [{"pavimento": "Térreo", "trecho": "Planta inteira", "prancha": "...", "revisao": "R03",
               "imagem": "plantas/terreo.png", "largura": 2000, "altura": 1300,
               "pecas": [{"tipo": "P", "nome": "P1", "secao": "20x40", "polys": [[[x, y], ...]], "rotulo": [x, y]}]}],
  "elementos": [{"pavimento": "Térreo", "tipo": "S", "nome": "E1", "secao": "D30"}],   (sem desenho: S, K, L;
                                            a laje com contorno pode ir na planta, tipo L)
  "concretagens": [{"chave": "fund", "pavimento": "Térreo", "planta": "Planta inteira", "dias_antes": 30,
                    "local": "...", "alvo": "pilares", "fck": 25,
                    "caminhoes": [{"volume_m3": 8, "pecas": [["P", "P1"]], "cps": {"7": [20.1, 21.0], "28": [26, 27]}}]}],
  "projetos": [{"sigla": "ES", "disciplina": "Estrutura", "numero": "01", "nome_curto": "FORMAS",
                "titulo": "...", "codigo": "...", "revisoes": [{"fase": "EX", "numero": "03", "dias_antes": 40}]}],
  "documentos": [{"categoria": "outros", "codigo": "...", "titulo": "...", "revisao": "R03", "dias_antes": 40,
                  "responsavel": "...", "pdf": "docs/memorial.pdf"}],
  "diario": true                            (três dias de diário e dois relatórios de exemplo)
}
Em planta, "credito" (da obra) vai escrito no rodapé da imagem, sem cortar nem mexer na prancha.

Precisa de: pip install pillow
"""

from __future__ import annotations

import argparse
import datetime as dt
import io
import json
import pathlib
import re
import sys

AQUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))

import carga_exe as ce  # noqa: E402
from carga_exe import ErroCarga  # noqa: E402

VERSAO = 1
TIPOS = ("P", "V", "L", "S", "K")
SEM_DESENHO = ce.SEM_DESENHO
ALVOS = ("pilares", "vigas_laje")


# ---------------------------------------------------------------------------
# Leitura e conferência do pacote (sem rede)
# ---------------------------------------------------------------------------

def caixa_do_rotulo(pc: dict) -> list:
    """O app usa o rótulo como caixa [x0, y0, x1, y1] (enquadrar e pôr o nome). O pacote pode trazer só o ponto [x, y]:
    vira a caixa de 28 x 10 em volta dele, como os ambientes; sem rótulo, a caixa do contorno."""
    r = pc.get("rotulo")
    if r and len(r) == 4:
        return [float(v) for v in r]
    if r and len(r) == 2:
        return [r[0] - 14, r[1] - 5, r[0] + 14, r[1] + 5]
    xs = [x for poly in pc["polys"] for x, _ in poly]
    ys = [y for poly in pc["polys"] for _, y in poly]
    return [min(xs), min(ys), max(xs), max(ys)]


def _exigir(cond: bool, msg: str) -> None:
    if not cond:
        raise ErroCarga(f"pacote: {msg}")


def ler_pacote(pasta: pathlib.Path) -> dict:
    """Lê PASTA/obra.json e confere tudo o que dá para conferir antes de montar."""
    arq = pasta / "obra.json"
    _exigir(arq.exists(), f"falta {arq}")
    p = json.loads(arq.read_text(encoding="utf-8"))
    _exigir(p.get("versao") == VERSAO, f"versão {p.get('versao')!r}; este leitor é da versão {VERSAO}")
    obra = p.get("obra") or {}
    cod = obra.get("codigo", "")
    _exigir(bool(re.fullmatch(r"[A-Z][A-Z0-9-]{1,19}", cod)), f"código da obra {cod!r}: maiúsculas, números e hífen, até 20")
    _exigir(cod != ce.OBRA, "o código EXE é da obra fictícia do carga_exe.py; use outro")
    _exigir(bool(obra.get("nome")) and bool(obra.get("empresa")), "obra sem nome ou sem empresa")

    pavs = p.get("pavimentos") or []
    _exigir(bool(pavs), "nenhum pavimento")
    nomes_pav = [v["nome"] for v in pavs]
    _exigir(len(set(nomes_pav)) == len(nomes_pav), "pavimento repetido")

    pecas: set[tuple[str, str, str]] = set()
    trechos: set[tuple[str, str]] = set()
    for pl in p.get("plantas") or []:
        _exigir(pl["pavimento"] in nomes_pav, f"planta em pavimento que não existe: {pl['pavimento']}")
        k = (pl["pavimento"], pl["trecho"])
        _exigir(k not in trechos, f"planta repetida: {k}")
        trechos.add(k)
        _exigir((pasta / pl["imagem"]).exists(), f"falta a imagem {pl['imagem']}")
        _exigir(pl["largura"] > 0 and pl["altura"] > 0, f"planta {k} sem tamanho")
        for pc in pl["pecas"]:
            _exigir(pc["tipo"] in ("P", "V", "L"), f"{pc['nome']}: na planta só P, V e L com desenho (S e K vão em \"elementos\")")
            _exigir(bool(re.fullmatch(r"\S+", pc["nome"])), f"peça {pc['nome']!r}: nome sem espaço (regra do núcleo)")
            pecas.add((pl["pavimento"], pc["tipo"], pc["nome"]))
    for el in p.get("elementos") or []:
        _exigir(el["pavimento"] in nomes_pav, f"elemento em pavimento que não existe: {el['pavimento']}")
        _exigir(bool(re.fullmatch(r"\S+", el["nome"])), f"elemento {el['nome']!r}: nome sem espaço (regra do núcleo)")
        _exigir(el["tipo"] in SEM_DESENHO, f"{el['nome']}: em \"elementos\" só {', '.join(SEM_DESENHO)}")
        k = (el["pavimento"], el["tipo"], el["nome"])
        _exigir(k not in pecas, f"peça repetida: {k}")
        pecas.add(k)

    for cc in p.get("concretagens") or []:
        _exigir(cc["pavimento"] in nomes_pav, f"concretagem {cc['chave']}: pavimento {cc['pavimento']} não existe")
        _exigir(cc.get("alvo", "pilares") in ALVOS, f"concretagem {cc['chave']}: alvo {cc.get('alvo')!r}")
        if cc.get("planta"):
            _exigir((cc["pavimento"], cc["planta"]) in trechos, f"concretagem {cc['chave']}: planta {cc['planta']} não existe")
        _exigir(bool(cc["caminhoes"]), f"concretagem {cc['chave']} sem caminhão")
        for cam in cc["caminhoes"]:
            for t, n in cam["pecas"]:
                _exigir((cc["pavimento"], t, n) in pecas, f"concretagem {cc['chave']}: peça {t} {n} não existe")
    # as regras da tabela documentos (supabase/migrations/20261103234000_projetos.sql), antes de chegar no banco
    for pj in p.get("projetos") or []:
        cod_pj = codigo_do_projeto(cod, pj)
        _exigir(bool(re.fullmatch(r"[A-Z0-9]+\.[A-Z]{2,3}\.[0-9]{3,4}\.[A-Z0-9]{1,10}", cod_pj))
                and cod_pj.endswith(f".{pj['sigla']}.{pj['numero']}.{pj['nome_curto']}"),
                f"projeto {cod_pj!r}: código OBRA.SIG.NNN.CURTO (sigla 2-3 letras, número 3-4 dígitos, sem hífen)")
        _exigir(bool(pj["revisoes"]), f"projeto {cod_pj} sem revisão")
        for r in pj["revisoes"]:
            _exigir(bool(re.fullmatch(r"[A-Z]{2}", r["fase"])) and bool(re.fullmatch(r"[0-9]{2}", r["numero"])),
                    f"projeto {cod_pj}: revisão {r['fase']}{r['numero']} (fase 2 letras, número 2 dígitos)")
    for d in p.get("documentos") or []:
        _exigir((pasta / d["pdf"]).exists(), f"falta o PDF {d['pdf']}")
        _exigir(bool(re.fullmatch(r"[a-z][a-z_]{1,39}", d.get("categoria", "outros"))), f"documento {d['codigo']}: categoria")
    return p


def codigo_do_projeto(codigo_obra: str, pj: dict) -> str:
    return pj.get("codigo") or f"{codigo_obra.replace('-', '')}.{pj['sigla']}.{pj['numero']}.{pj['nome_curto']}"


# ---------------------------------------------------------------------------
# Imagem da prancha -> tiles do app (a prancha inteira, sem recorte)
# ---------------------------------------------------------------------------

def tiles_da_imagem(imagem: pathlib.Path, largura: int, altura: int, credito: str = "") -> dict[str, bytes]:
    """Os tiles {"z/x/y": webp} da imagem inteira, nos mesmos níveis e tamanho do publicar_demo.

    A imagem é esticada para largura x altura (coordenadas da planta) vezes 2 ** (nível mais fino). Nada é
    cortado: a prancha entra inteira, e o crédito vai numa faixa branca acrescentada embaixo."""
    from PIL import Image, ImageDraw, ImageFont

    pd = ce.publicar_demo
    e = 2 ** max(pd.NIVEIS)
    im = Image.open(imagem).convert("RGB").resize((largura * e, altura * e), Image.LANCZOS)
    if credito:
        faixa = 28 * e
        nova = Image.new("RGB", (im.width, im.height + faixa), "white")
        nova.paste(im, (0, 0))
        try:
            fonte = ImageFont.load_default(size=16 * e)
        except TypeError:  # Pillow antigo
            fonte = ImageFont.load_default()
        ImageDraw.Draw(nova).text((12 * e, im.height + 6 * e), f"Fonte: {credito}", fill="#111111", font=fonte)
        im = nova
    saida = {}
    for z in pd.NIVEIS:
        f = (2 ** z) / e
        atual = im if f == 1 else im.resize((max(1, round(im.width * f)), max(1, round(im.height * f))), Image.LANCZOS)
        for ty in range(0, atual.height, pd.TILE):
            for tx in range(0, atual.width, pd.TILE):
                t = Image.new("RGB", (pd.TILE, pd.TILE), "white")
                t.paste(atual.crop((tx, ty, min(tx + pd.TILE, atual.width), min(ty + pd.TILE, atual.height))), (0, 0))
                if t.convert("L").getextrema()[0] > 250:
                    continue  # tile em branco: o app desenha branco sem precisar dele
                b = io.BytesIO()
                t.save(b, "WEBP", lossless=True, method=4)
                saida[f"{z}/{tx // pd.TILE}/{ty // pd.TILE}"] = b.getvalue()
    return saida


def altura_com_credito(altura: int, credito: str) -> int:
    return altura + (28 if credito else 0)


# ---------------------------------------------------------------------------
# Montagem
# ---------------------------------------------------------------------------

def montar(pacote_obra: dict, pasta: pathlib.Path, usuario: str, hoje: dt.date, tiles=tiles_da_imagem) -> ce.Carga:
    p = pacote_obra
    obra = p["obra"]
    c = ce.Carga(usuario, hoje, obra["codigo"])
    credito = obra.get("credito", "")

    c.linhas["obras"] = [{"id": c.obra_id, "codigo": c.codigo, "nome": obra["nome"], "empresa": obra["empresa"],
                          "criado_por": c.usuario}]
    pav = {v["nome"]: c.linha("pavimentos", v["nome"], {"nome": v["nome"], "ordem": v["ordem"]}, 90) for v in p["pavimentos"]}

    fichas = ce.FICHAS if p.get("fichas", "exemplo") == "exemplo" else p["fichas"]
    for f in fichas:
        c.linha("fichas_modelo", f["codigo"], {k: f[k] for k in
                                               ("codigo", "titulo", "revisao", "tipo_modelo", "aplica_a", "origem", "itens")}, 90)

    elementos: dict[tuple[str, str, str], str] = {}
    plantas: dict[tuple[str, str], tuple[str, str]] = {}
    geometria: dict[tuple[str, str], dict[str, list]] = {}
    for pl in p.get("plantas") or []:
        nome_pav, trecho, rev = pl["pavimento"], pl["trecho"], pl.get("revisao", "R00")
        pav_id = pav[nome_pav]
        setor_id = c.linha("setores", f"{nome_pav}:{trecho}", {"pavimento_id": pav_id, "nome_projeto": trecho,
                                                              "disciplina": pl.get("disciplina", "estrutura")}, 60)
        pecas = [{"tipo": pc["tipo"], "nome": pc["nome"], "secao": pc.get("secao"), "polys": pc["polys"],
                  "rotulo": caixa_do_rotulo(pc)} for pc in pl["pecas"]]
        for pc in pecas:
            k = (nome_pav, pc["tipo"], pc["nome"])
            if k not in elementos:
                elementos[k] = c.linha("elementos", "|".join(k), {"pavimento_id": pav_id, "tipo": pc["tipo"],
                                                                  "nome": pc["nome"], "secao": pc["secao"]}, 60)
        ids = {(pc["tipo"], pc["nome"]): elementos[(nome_pav, pc["tipo"], pc["nome"])] for pc in pecas}
        alt = altura_com_credito(pl["altura"], credito)
        forma = {"trecho": trecho, "prancha": pl["prancha"], "revisao": rev, "largura": pl["largura"], "altura": alt,
                 "tile": ce.publicar_demo.TILE, "niveis": list(ce.publicar_demo.NIVEIS),
                 "tiles": tiles(pasta / pl["imagem"], pl["largura"], pl["altura"], credito), "pecas": pecas}
        planta_id = c.uid(f"plantas:{nome_pav}:{trecho}:{rev}")
        cab = {"planta_id": planta_id, "obra": c.codigo, "pavimento": nome_pav, "trecho": trecho}
        man, binario, _ = ce.publicar_planta.montar_trecho(forma, {}, ids, cab)
        base = f"fvs/plantas/{planta_id}"
        man_id = c.arquivo(f"{planta_id}:manifest", f"{base}/manifest.json", man, "application/json", "manifest.json", 60)
        pac_id = c.arquivo(f"{planta_id}:pacote", f"{base}/pacote.bin", binario, "application/octet-stream", "pacote.bin", 60)
        c.linhas.setdefault("plantas", []).append({
            "id": planta_id, "obra_id": c.obra_id, "usuario_id": c.usuario, "dispositivo_id": ce.DISPOSITIVO,
            "criado_em_dispositivo": c.hora(60, 10), "pavimento_id": pav_id, "setor_id": setor_id, "prancha": pl["prancha"],
            "revisao": rev, "largura": forma["largura"], "altura": forma["altura"], "manifest_id": man_id, "pacote_id": pac_id,
            "elementos": ce.publicar_planta.quantos_locais(forma), "substitui_id": None})
        plantas[(nome_pav, trecho)] = (planta_id, setor_id)
        geometria[(nome_pav, trecho)] = {ids[(pc["tipo"], pc["nome"])]: pc["polys"] for pc in pecas}

    for el in p.get("elementos") or []:
        k = (el["pavimento"], el["tipo"], el["nome"])
        elementos[k] = c.linha("elementos", "|".join(k), {"pavimento_id": pav[el["pavimento"]], "tipo": el["tipo"],
                                                          "nome": el["nome"], "secao": el.get("secao")}, 60)

    for cc in p.get("concretagens") or []:
        dias = cc["dias_antes"]
        conc = c.linha("concretagens", cc["chave"], {
            "pavimento_id": pav[cc["pavimento"]], "data": c.dia(dias), "local_descricao": cc["local"],
            "codigo_construpoint": None, "fornecedor": cc.get("fornecedor", "Concreteira Exemplo"), "fck_mpa": cc["fck"],
            "slump_cm": cc.get("slump_cm", 12), "slump_tolerancia_cm": cc.get("slump_tolerancia_cm", 2),
            "idades_dias": [7, 28], "cps_por_idade": 2, "observacao": cc.get("observacao", "Concretagem de EXEMPLO.")}, dias, 7)
        ref = None
        if cc.get("planta"):
            ref = f"{plantas[(cc['pavimento'], cc['planta'])][1]}@{_rev_da_planta(p, cc)}"
        for i, cam in enumerate(cc["caminhoes"]):
            seq = i + 1
            cid = c.linha("caminhoes", f"{cc['chave']}:{seq}", {
                "concretagem_id": conc, "sequencia": seq, "nota_fiscal": cam.get("nota_fiscal", f"{seq:04d}"),
                "volume_m3": cam["volume_m3"], "saida_usina": c.hora(dias, 7 + i, 10), "chegada_obra": c.hora(dias, 7 + i, 50),
                "inicio_descarga": c.hora(dias, 8 + i, 0), "fim_descarga": c.hora(dias, 8 + i, 40),
                "slump_medido_cm": cam.get("slump_medido_cm", 12), "agua_adicionada_l": cam.get("agua_adicionada_l", 0),
                "cps_moldados": 4, "observacao": None}, dias, 8 + i)
            ids = [elementos[(cc["pavimento"], t, n)] for t, n in cam["pecas"]]
            geo = geometria.get((cc["pavimento"], cc.get("planta")), {})
            pts = [pt for e in ids if e in geo for poly in geo[e] for pt in poly]
            if ref and pts:
                c.linha("caminhao_areas", f"{cc['chave']}:{seq}", {"caminhao_id": cid, "planta_ref": ref,
                                                                  "contorno": ce._caixa(pts, 18), "alvo": cc.get("alvo", "pilares")},
                        dias, 8 + i)
            for (t, n), e in zip(cam["pecas"], ids):
                desenho = t not in SEM_DESENHO and e in geo
                c.linha("caminhao_elementos", f"{cc['chave']}:{seq}:{t}{n}", {
                    "caminhao_id": cid, "elemento_id": e, "origem": "desenho" if desenho else "manual",
                    "fracao": 1 if desenho else None, "incluido": True}, dias, 8 + i)
            for idade, valores in (cam.get("cps") or {}).items():
                idade = int(idade)
                if dias < idade:
                    continue  # ainda não chegou a idade: o app mostra "a romper"
                for n_cp, mpa in enumerate(valores, start=1):
                    c.linha("cp_resultados", f"{cc['chave']}:{seq}:{idade}:{n_cp}", {
                        "caminhao_id": cid, "idade_dias": idade, "numero_cp": n_cp, "data_ensaio": c.dia(dias - idade),
                        "resistencia_mpa": mpa, "origem": "manual", "observacao": None}, dias - idade, 15)

    for pj in p.get("projetos") or []:
        codigo = codigo_do_projeto(c.codigo, pj)
        revs = pj["revisoes"]
        d = c.linha("documentos", codigo, {"codigo": codigo, "disciplina_sigla": pj["sigla"], "disciplina": pj["disciplina"],
                                           "numero": pj["numero"], "nome_curto": pj["nome_curto"], "titulo": pj["titulo"],
                                           "pasta_autodoc": f"{pj['disciplina']}/{revs[-1]['fase']}", "link_pasta": pj.get("link")}, 60)
        for i, r in enumerate(revs):
            ult = i == len(revs) - 1
            c.linha("revisoes", f"{codigo}:{r['fase']}{r['numero']}", {
                "documento_id": d, "fase": r["fase"], "numero": r["numero"], "titulo": pj["titulo"],
                "status_autodoc": "Aprovado", "obsoleta": not ult,
                "data_obsoleta": None if ult else c.hora(revs[i + 1]["dias_antes"], 9),
                "cadastrada_em_autodoc": c.hora(r["dias_antes"], 9), "cadastrada_por": pj.get("autor", obra["empresa"]),
                "atualizada_em_autodoc": c.hora(r["dias_antes"], 9), "extensoes": "pdf", "vista_em": c.dia(r["dias_antes"])},
                r["dias_antes"])

    for doc in p.get("documentos") or []:
        dias = doc.get("dias_antes", 30)
        dados = (pasta / doc["pdf"]).read_bytes()
        arq = c.arquivo(f"doc:{doc['codigo']}:{doc['revisao']}", "documentos/{id}.pdf", dados, "application/pdf",
                        pathlib.Path(doc["pdf"]).name, dias)
        c.linha("doc_documentos", f"{doc['codigo']}:{doc['revisao']}", {
            "escopo": "obra", "categoria": doc.get("categoria", "outros"), "codigo": doc["codigo"], "titulo": doc["titulo"],
            "revisao": doc["revisao"], "data_revisao": c.dia(dias), "validade": None, "responsavel": doc["responsavel"],
            "situacao": "vigente", "arquivo_id": arq, "observacao": doc.get("observacao"), "substitui_id": None,
            "cancelado": False}, dias)

    if p.get("diario"):
        _diario_de_exemplo(c, p["pavimentos"][0]["nome"])
    return c


def _rev_da_planta(p: dict, cc: dict) -> str:
    for pl in p["plantas"]:
        if (pl["pavimento"], pl["trecho"]) == (cc["pavimento"], cc["planta"]):
            return pl.get("revisao", "R00")
    raise ErroCarga(f"concretagem {cc['chave']}: planta {cc['planta']} não existe")


def _diario_de_exemplo(c: ce.Carga, local: str) -> None:
    """Três dias de diário (dois fechados) e dois relatórios, todos marcados como EXEMPLO."""
    for dias, n_rdo, tarde in ((3, 1, "nublado"), (2, 2, "chuva_forte"), (1, None, "sol")):
        c.linha("diario_clima", f"{dias}:manha", {"data": c.dia(dias), "periodo": "manha", "tempo": "sol", "condicao": "praticavel"}, dias, 7)
        c.linha("diario_clima", f"{dias}:tarde", {"data": c.dia(dias), "periodo": "tarde", "tempo": tarde,
                                                  "condicao": "impraticavel" if tarde == "chuva_forte" else "praticavel"}, dias, 13)
        for funcao, q in (("Encarregado", 1), ("Carpinteiro", 4), ("Armador", 3), ("Servente", 4)):
            c.linha("diario_efetivo", f"{dias}:{funcao}", {"data": c.dia(dias), "empresa": "Construtora Exemplo", "funcao": funcao,
                                                           "quantidade": q, "observacao": "EXEMPLO", "substitui_id": None}, dias, 7)
        c.linha("diario_ocorrencias", f"{dias}:relato", {
            "data": c.dia(dias), "tipo": "relato",
            "descricao": "EXEMPLO: chuva forte à tarde; equipes recolhidas." if tarde == "chuva_forte"
            else "EXEMPLO: dia normal de trabalho.", "horas_paradas": 2.5 if tarde == "chuva_forte" else None,
            "local_texto": None, "substitui_id": None}, dias, 17)
        if n_rdo:
            c.linha("diario_fechamentos", f"{dias}", {"data": c.dia(dias), "acao": "fechado", "numero": n_rdo, "observacao": None}, dias, 18)
    r1 = c.linha("relatorios", "problema", {"tipo": "problema", "data": c.dia(1), "titulo": "EXEMPLO: fôrma com fresta",
                                            "descricao": "Relatório de exemplo, não é desta obra.", "gravidade": "media",
                                            "responsavel": "Mestre de obras", "prazo": c.dia(-2), "local_texto": local,
                                            "itens": [], "substitui_id": None}, 1, 15)
    c.linha("relatorio_andamentos", "problema:1", {"relatorio_id": r1, "situacao": "em_andamento",
                                                   "comentario": "EXEMPLO: correção começou."}, 1, 16)
    c.linha("relatorios", "seguranca", {"tipo": "seguranca", "data": c.dia(2), "titulo": "EXEMPLO: vistoria de segurança",
                                        "descricao": "Vistoria de exemplo.", "gravidade": "baixa", "responsavel": "Técnico de segurança",
                                        "prazo": None, "local_texto": local, "substitui_id": None,
                                        "itens": [{"item": "Uso de EPI pelas equipes", "resultado": "ok"},
                                                  {"item": "Proteção de periferia", "resultado": "atencao"}]}, 2, 11)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Obra de um pacote (obra.json, fora do repositório) no servidor de testes.")
    sub = ap.add_subparsers(dest="acao", required=True)
    g = sub.add_parser("gerar", help="gera carga.sql e storage/ (sem rede)")
    g.add_argument("pacote", help="pasta com obra.json")
    g.add_argument("saida")
    g.add_argument("--usuario", required=True, help="id de um perfil que já existe no servidor de testes")
    g.add_argument("--hoje", help="AAAA-MM-DD (padrão: hoje)")
    args = ap.parse_args(argv)
    try:
        pasta = pathlib.Path(args.pacote)
        hoje = dt.date.fromisoformat(args.hoje) if args.hoje else dt.date.today()
        c = montar(ler_pacote(pasta), pasta, args.usuario, hoje)
        ce.gravar(c, pathlib.Path(args.saida))
        print(f"Obra {c.codigo} ({c.obra_id}): {c.total()} linhas em {len(c.linhas)} tabelas, {len(c.arquivos)} arquivos.")
        print(f"Agora: carga.sql no editor SQL do servidor de TESTES; depois: carga_exe.py enviar {args.saida}")
    except (ErroCarga, ce.publicar_planta.ErroPublicacao, ce.pacote.ErroPacote, ValueError, KeyError) as ex:
        print(f"PROBLEMA: {ex}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
