"""Obra fictícia EXE completa no SERVIDOR DE TESTES, para o app de testes ter o que abrir em todos os módulos.

Tudo aqui é inventado: a "prancha" é uma grade desenhada por este script (a mesma do publicar_demo.py), as
fichas têm texto genérico, as empresas e pessoas são de mentira ("Construtora Exemplo", "Empreiteira Alfa"...).
Nada de obra ou empresa real.

Trava: só grava no servidor de testes (tbscnqazrveiaoqgpgxs). Qualquer outro endereço é recusado, e o
servidor da obra de verdade nunca.

Os ids saem de nomes fixos (UUID v5): rodar duas vezes não duplica nada (on conflict do nothing / upsert).

Uso (no PC, na raiz do repositório):
    py pipeline/demo/carga_exe.py gerar PASTA --usuario UUID
        Só gera, sem rede: PASTA/carga.sql (as linhas, para o editor SQL ou o psql) e PASTA/storage/
        (as plantas e os PDFs, nos caminhos do bucket "obras"). --usuario: o id de um perfil que já existe
        no servidor de testes (vai em usuario_id, que o banco exige).
    py pipeline/demo/carga_exe.py enviar PASTA
        Envia PASTA/storage/ para o bucket "obras" do servidor de testes. Lê a chave secreta do servidor de
        TESTES em .env (SUPABASE_TESTES_SECRET=...), que nunca vai para o git nem aparece na tela.
        As linhas (carga.sql) entram antes, pelo editor SQL do Supabase ou pelo psql.

Opções de gerar: --hoje AAAA-MM-DD (datas relativas a esse dia; padrão: hoje), --convidar EMAIL (convite de
gestor na obra EXE para esse e-mail; o e-mail não fica em arquivo nenhum do repositório).

Precisa de: pip install pillow
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import pathlib
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid

AQUI = pathlib.Path(__file__).resolve().parent
RAIZ = AQUI.parent.parent
sys.path.insert(0, str(AQUI.parent / "fvs"))
sys.path.insert(0, str(AQUI.parent))
sys.path.insert(0, str(AQUI.parent / "projetos"))

import pacote  # noqa: E402
import publicar_demo  # noqa: E402
import publicar_planta  # noqa: E402

# ---------------------------------------------------------------------------
# Travas
# ---------------------------------------------------------------------------

PROJETO_TESTES = "tbscnqazrveiaoqgpgxs"
URL_TESTES = f"https://{PROJETO_TESTES}.supabase.co"
PROJETO_DA_OBRA = "zktsuwxgvvyufuihkndj"  # servidor da obra de verdade: nunca
BUCKET = "obras"
DISPOSITIVO = "00000000-0000-0000-0000-000000000000"  # o mesmo do editor SQL (contrato do núcleo)

OBRA = "EXE"
NOME_OBRA = "Obra Exemplo"
EMPRESA = "Construtora Exemplo"

# Espaço de nomes dos ids desta carga. Não mudar: muda todos os ids (e rodar de novo duplicaria a obra).
ESPACO = uuid.UUID("3d7c9a52-5b0e-4f7e-9b1a-0e5e8c1d2a77")
# O mesmo do app (concreto/lajes.ts): a laje criada aqui é a mesma que o app criaria no toque.
ESPACO_LAJES = uuid.UUID("6b0fc8e1-37dc-4d8b-a806-2564efba583b")


class ErroCarga(Exception):
    pass


def conferir_url(url: str) -> str:
    """Só o servidor de testes passa."""
    host = urllib.parse.urlparse(url).hostname or ""
    if PROJETO_DA_OBRA in url:
        raise ErroCarga("esse é o servidor da obra de verdade: esta carga nunca grava nele")
    if host != f"{PROJETO_TESTES}.supabase.co":
        raise ErroCarga(f"só grava no servidor de testes ({PROJETO_TESTES}); recusei {host or url}")
    return url.rstrip("/")


def uid(chave: str, codigo: str = OBRA) -> str:
    """Id fixo da linha. O código da obra entra no nome: obras diferentes nunca dividem um id."""
    return str(uuid.uuid5(ESPACO, f"{codigo}:{chave}"))


OBRA_ID = uid("obra")

# ---------------------------------------------------------------------------
# A obra
# ---------------------------------------------------------------------------

PAVIMENTOS = [("Térreo", 1), ("1º Pavimento", 2), ("Cobertura", 3)]
# Térreo e 1º Pavimento têm planta (dois trechos cada); a Cobertura fica sem planta, de propósito (o app
# precisa mostrar bem um pavimento ainda sem projeto).
PAVIMENTOS_COM_PLANTA = ["Térreo", "1º Pavimento"]
REVISAO = "R00"

FICHAS = [
    {
        "codigo": "EXE-PVS-001",
        "titulo": "Pilares (ficha de exemplo)",
        "revisao": "1",
        "tipo_modelo": "ESTRUTURA",
        "aplica_a": ["P"],
        "origem": "exemplo",
        "itens": [
            publicar_demo._item(1, "CONDIÇÕES DE INÍCIO", "Projeto na revisão vigente", "Visual", "Visual"),
            publicar_demo._item(2, "CONDIÇÕES DE INÍCIO", "Local limpo e desimpedido", "Visual", "Visual"),
            publicar_demo._item(3, "FÔRMA", "Locação conferida", "Trena", "3 mm", "Eixos conforme o projeto."),
            publicar_demo._item(4, "FÔRMA", "Prumo nas duas direções", "Prumo", "5 mm"),
            publicar_demo._item(5, "ARMAÇÃO", "Armadura e espaçadores", "Visual", "Conforme projeto"),
            publicar_demo._item(6, "CONCRETAGEM", "Concreto rastreado (caminhão anotado)", "Visual", "Conforme projeto"),
            publicar_demo._item(7, "DESFORMA", "Sem falhas de concretagem", "Visual", "Visual"),
        ],
    },
    {
        "codigo": "EXE-PVS-002",
        "titulo": "Vigas (ficha de exemplo)",
        "revisao": "1",
        "tipo_modelo": "ESTRUTURA",
        "aplica_a": ["V"],
        "origem": "exemplo",
        "itens": [
            publicar_demo._item(1, "CONDIÇÕES DE INÍCIO", "Escoramento conferido", "Visual", "Visual"),
            publicar_demo._item(2, "FÔRMA", "Fundo e laterais da fôrma", "Trena", "3 mm"),
            publicar_demo._item(3, "ARMAÇÃO", "Armadura e cobrimento", "Visual", "Conforme projeto"),
            publicar_demo._item(4, "CONCRETAGEM", "Adensamento", "Visual", "Visual"),
        ],
    },
    {
        "codigo": "EXE-PVS-003",
        "titulo": "Lajes (ficha de exemplo)",
        "revisao": "0",
        "tipo_modelo": "ESTRUTURA",
        "aplica_a": ["L"],
        "origem": "exemplo",
        "itens": [
            publicar_demo._item(1, "FÔRMA", "Assoalho nivelado", "Nível", "5 mm"),
            publicar_demo._item(2, "ARMAÇÃO", "Malha positiva e negativa", "Visual", "Conforme projeto"),
            publicar_demo._item(3, "INSTALAÇÕES", "Eletrodutos e passagens", "Visual", "Conforme projeto"),
            publicar_demo._item(4, "CONCRETAGEM", "Cura iniciada no mesmo dia", "Visual", "Visual"),
        ],
    },
]

# Documentos do controle de documentos (PBQP-H), os mesmos exemplos do app (documentos/exemplos.ts).
# (escopo, categoria, código, título, revisão, feito há N dias, vence em N dias ou None, responsável, situação)
DOCUMENTOS = [
    ("empresa", "sistema", "EXE-MQ", "Manual da Qualidade", "03", 270, None, "Coordenação da Qualidade", "vigente"),
    ("empresa", "sistema", "EXE-OBJ", "Objetivos e indicadores da qualidade", "02", 300, 52, "Diretoria", "vigente"),
    ("empresa", "procedimentos", "EXE-PS-01", "Controle de documentos e registros", "02", 120, None, "Coordenação da Qualidade", "vigente"),
    ("empresa", "procedimentos", "EXE-PS-03", "Não conformidade e ação corretiva", "00", 200, None, "Coordenação da Qualidade", "em_revisao"),
    ("empresa", "pes", "EXE-PES-05", "Fôrma, armação e concretagem de pilares", "01", 160, None, "Engenharia", "vigente"),
    ("empresa", "fvs", "EXE-FVS-05", "Verificação de pilares", "01", 160, None, "Engenharia", "vigente"),
    ("empresa", "fornecedores", "EXE-FOR-01", "Avaliação de fornecedores 2026", "00", 340, 20, "Suprimentos", "vigente"),
    ("obra", "pqo", "EXE-PQO", "Plano da Qualidade da Obra Exemplo", "01", 90, None, "Engenheiro da obra", "vigente"),
    ("obra", "controle_tecnologico", "EXE-PCT", "Plano de controle tecnológico", "00", 95, None, "Engenheiro da obra", "vigente"),
    ("obra", "equipamentos", "EXE-CAL-TR01", "Certificado de calibração · trena 5 m", "00", 380, -15, "Mestre de obras", "vigente"),
    ("obra", "outros", "EXE-ALV", "Alvará de construção", "00", 120, 420, "Escritório", "vigente"),
]

# Projetos (painel de revisões e distribuição): (sigla, disciplina, número, nome curto, título, revisões [(fase, nº, dias)])
PROJETOS = [
    ("ES", "Estrutura", "100", "FORTER", "FORMAS DO TÉRREO", [("EX", "00", 60), ("LO", "00", 40), ("LO", "01", 12)]),
    ("ES", "Estrutura", "101", "FOR1PAV", "FORMAS DO 1º PAVIMENTO", [("LO", "00", 30)]),
    ("ES", "Estrutura", "200", "PILTER", "PILARES DO TÉRREO", [("LO", "00", 45)]),
    ("AR", "Arquitetura", "001", "TERREO", "PLANTA BAIXA DO TÉRREO", [("EX", "02", 50), ("EX", "03", 8)]),
    ("HI", "Hidráulica", "001", "AGUAFRIA", "ÁGUA FRIA", [("LO", "00", 25)]),
]
EMPRESAS = ["Empreiteira Alfa", "Formas Delta", "Hidráulica Beta"]

# Fundações do Térreo: estacas (S) e blocos (K). Não têm desenho na planta: entram no caminhão à mão.
FUNDACOES = [("S", "E-P1.A", "D50"), ("S", "E-P1.B", "D50"), ("S", "E-P2.A", "D50"), ("S", "E-P2.B", "D50"),
             ("K", "BL-P1", "BL-04"), ("K", "BL-P2", "BL-04")]
SEM_DESENHO = ("L", "S", "K")  # laje, estaca, bloco: origem 'manual', fracao null


# ---------------------------------------------------------------------------
# Montagem (parte pura: sem rede; testada em pipeline/testes/test_demo_carga.py)
# ---------------------------------------------------------------------------

class Carga:
    def __init__(self, usuario: str, hoje: dt.date, codigo: str = OBRA):
        self.usuario = str(uuid.UUID(usuario))
        self.hoje = hoje
        self.codigo = codigo
        self.obra_id = uid("obra", codigo)
        self.linhas: dict[str, list[dict]] = {}
        self.arquivos: dict[str, bytes] = {}  # caminho no bucket -> conteúdo
        self.convites: list[dict] = []

    def dia(self, dias_antes: int) -> str:
        return (self.hoje - dt.timedelta(days=dias_antes)).isoformat()

    def hora(self, dias_antes: int, h: int, m: int = 0) -> str:
        return f"{self.dia(dias_antes)}T{h:02d}:{m:02d}:00-03:00"

    def uid(self, chave: str) -> str:
        return uid(chave, self.codigo)

    def linha(self, tabela: str, chave: str, campos: dict, dias_antes: int = 30, h: int = 9, m: int = 0) -> str:
        id_ = self.uid(f"{tabela}:{chave}")
        base = {"id": id_, "obra_id": self.obra_id, "usuario_id": self.usuario, "dispositivo_id": DISPOSITIVO,
                "criado_em_dispositivo": self.hora(dias_antes, h, m)}
        self.linhas.setdefault(tabela, []).append({**base, **campos})
        return id_

    def arquivo(self, chave: str, caminho_rel: str, dados: bytes, tipo: str, nome: str, dias_antes: int = 30) -> str:
        id_ = self.uid(f"arquivos:{chave}")
        caminho = f"{self.obra_id}/{caminho_rel.format(id=id_)}"
        self.arquivos[caminho] = dados
        self.linha("arquivos", chave, {"caminho": caminho, "nome_original": nome, "hash": pacote.sha256(dados),
                                       "tamanho": len(dados), "tipo": tipo}, dias_antes)
        return id_

    def total(self) -> int:
        return sum(len(v) for v in self.linhas.values())


def _caixa(pontos: list[list[float]], folga: float) -> list[list[float]]:
    xs = [p[0] for p in pontos]
    ys = [p[1] for p in pontos]
    x0, x1, y0, y1 = min(xs) - folga, max(xs) + folga, min(ys) - folga, max(ys) + folga
    return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]


def pdf_de_exemplo(linhas: list[str]) -> bytes:
    """Um PDF de uma página, com "DOCUMENTO DE EXEMPLO" (igual ao documentos/exemplos.ts do app)."""
    import unicodedata

    def limpo(s: str) -> str:
        s = "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")
        s = "".join(c if 32 <= ord(c) < 127 else "-" for c in s)
        return s.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")

    texto = ["BT", "/F1 22 Tf", "60 770 Td", f"({limpo(linhas[0])}) Tj", "/F1 13 Tf", "0 -34 Td"]
    for ln in linhas[1:]:
        texto += [f"({limpo(ln)}) Tj", "0 -22 Td"]
    texto += ["ET", "0.85 0.2 0.2 RG 4 w 50 60 m 545 60 l S"]
    fluxo = "\n".join(texto)
    objetos = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        f"<< /Length {len(fluxo)} >>\nstream\n{fluxo}\nendstream",
    ]
    pdf = "%PDF-1.4\n"
    pos = []
    for i, o in enumerate(objetos):
        pos.append(len(pdf))
        pdf += f"{i + 1} 0 obj\n{o}\nendobj\n"
    xref = len(pdf)
    pdf += f"xref\n0 {len(objetos) + 1}\n0000000000 65535 f \n" + "".join(f"{p:010d} 00000 n \n" for p in pos)
    pdf += f"trailer\n<< /Size {len(objetos) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n"
    return pdf.encode("ascii")


def nome_da_laje(trecho: str) -> str:
    return "Laje_" + "_".join(trecho.split())


def id_da_laje(pavimento_id: str, trecho: str) -> str:
    return str(uuid.uuid5(ESPACO_LAJES, f"{pavimento_id}|L|{nome_da_laje(trecho)}"))


def montar(usuario: str, hoje: dt.date, desenho, convidar: str | None = None, fundacoes: bool = True) -> Carga:
    c = Carga(usuario, hoje)

    # ---- núcleo: obra, pavimentos, acesso de quem carrega
    c.linhas["obras"] = [{"id": OBRA_ID, "codigo": OBRA, "nome": NOME_OBRA, "empresa": EMPRESA, "criado_por": c.usuario}]
    pav = {nome: c.linha("pavimentos", nome, {"nome": nome, "ordem": ordem}, 90) for nome, ordem in PAVIMENTOS}
    if convidar:
        c.convites.append({"id": uid("convite:gestor"), "obra_id": OBRA_ID, "nome": "Gestor da obra de testes",
                           "email": convidar.strip().lower(), "papel": "gestor"})

    # ---- FVS: fichas
    fichas = {}
    for f in FICHAS:
        fichas[f["aplica_a"][0]] = c.linha("fichas_modelo", f["codigo"], {k: f[k] for k in
                                           ("codigo", "titulo", "revisao", "tipo_modelo", "aplica_a", "origem", "itens")}, 90)

    # ---- plantas: setores, elementos, pacote da planta (manifest + pacote.bin no bucket)
    elementos: dict[tuple[str, str, str], str] = {}  # (pavimento, tipo, nome) -> id
    geometria: dict[tuple[str, str], dict[str, list]] = {}  # (pavimento, trecho) -> {elemento_id: polys}
    plantas: dict[tuple[str, str], tuple[str, str]] = {}  # (pavimento, trecho) -> (planta_id, setor_id)
    for n_pav, nome_pav in enumerate(PAVIMENTOS_COM_PLANTA):
        pav_id = pav[nome_pav]
        for n_tr, trecho in enumerate(publicar_demo.COLUNAS_DOS_TRECHOS):
            setor_id = c.linha("setores", f"{nome_pav}:{trecho}", {"pavimento_id": pav_id, "nome_projeto": trecho,
                                                                  "disciplina": "estrutura"}, 60)
            pecas = publicar_demo.pecas_do_trecho(trecho)
            for p in pecas:
                k = (nome_pav, p["tipo"], p["nome"])
                if k not in elementos:
                    elementos[k] = c.linha("elementos", "|".join(k), {"pavimento_id": pav_id, "tipo": p["tipo"],
                                                                      "nome": p["nome"], "secao": p["secao"]}, 60)
            laje = id_da_laje(pav_id, trecho)
            c.linhas.setdefault("elementos", []).append({"id": laje, "obra_id": OBRA_ID, "usuario_id": c.usuario, "dispositivo_id": DISPOSITIVO,
                                          "criado_em_dispositivo": c.hora(60, 9), "pavimento_id": pav_id, "tipo": "L",
                                          "nome": nome_da_laje(trecho), "secao": None})
            elementos[(nome_pav, "L", nome_da_laje(trecho))] = laje
            prancha = f"EXE.ES.LO.{100 + n_pav}.FOR{n_tr + 1}-{REVISAO}"
            ids = {(p["tipo"], p["nome"]): elementos[(nome_pav, p["tipo"], p["nome"])] for p in pecas}
            detalhes: dict = {"P": {}, "V": {}}
            for p in pecas:
                if p["tipo"] == "P" and p["nome"] not in detalhes["P"]:
                    detalhes["P"][p["nome"]] = {"chave": pacote.chave_de_detalhe("P", p["nome"]), "titulo": p["nome"],
                                                "prancha": f"EXE.ES.LO.200.PIL-{REVISAO}", "img": desenho.detalhe(p),
                                                "aco": desenho.aco(p)}
            forma = {"trecho": trecho, "prancha": prancha, "revisao": REVISAO, "largura": publicar_demo.LARGURA,
                     "altura": publicar_demo.ALTURA, "tile": publicar_demo.TILE, "niveis": list(publicar_demo.NIVEIS),
                     "tiles": desenho.tiles(pecas, prancha), "pecas": pecas}
            planta_id = uid(f"plantas:{nome_pav}:{trecho}:{REVISAO}")
            cab = {"planta_id": planta_id, "obra": OBRA, "pavimento": nome_pav, "trecho": trecho}
            man, binario, _ = publicar_planta.montar_trecho(forma, detalhes, ids, cab)
            base = f"fvs/plantas/{planta_id}"
            man_id = c.arquivo(f"{planta_id}:manifest", f"{base}/manifest.json", man, "application/json", "manifest.json", 60)
            pac_id = c.arquivo(f"{planta_id}:pacote", f"{base}/pacote.bin", binario, "application/octet-stream", "pacote.bin", 60)
            c.linhas.setdefault("plantas", []).append({"id": planta_id, "obra_id": OBRA_ID, "usuario_id": c.usuario, "dispositivo_id": DISPOSITIVO,
                                        "criado_em_dispositivo": c.hora(60, 10), "pavimento_id": pav_id, "setor_id": setor_id,
                                        "prancha": prancha, "revisao": REVISAO, "largura": forma["largura"],
                                        "altura": forma["altura"], "manifest_id": man_id, "pacote_id": pac_id,
                                        "elementos": publicar_planta.quantos_locais(forma), "substitui_id": None})
            plantas[(nome_pav, trecho)] = (planta_id, setor_id)
            geometria[(nome_pav, trecho)] = {ids[(p["tipo"], p["nome"])]: p["polys"] for p in pecas}

    # ---- FVS: registros (Térreo adiantado, 1º Pavimento começando)
    def fvs(pav_nome: str, trecho: str, tipo: str, nome: str, item: int, resultado: str, dias: int, h: int,
            rodada: int = 1, obs: str | None = None) -> None:
        planta_id, _ = plantas[(pav_nome, trecho)]
        c.linha("fvs_eventos", f"{pav_nome}:{tipo}{nome}:{item}:{rodada}:{resultado}",
                {"elemento_id": elementos[(pav_nome, tipo, nome)], "ficha_id": fichas[tipo], "item": item,
                 "resultado": resultado, "rodada": rodada, "observacao": obs, "planta_id": planta_id,
                 "verificado_por": "Mestre Joaquim"}, dias, h)

    n_itens = {f["aplica_a"][0]: len(f["itens"]) for f in FICHAS}
    for i in range(1, 13):  # P1 a P12 do Térreo: ficha inteira conforme
        for item in range(1, n_itens["P"] + 1):
            fvs("Térreo", "Trecho 1", "P", f"P{i}", item, "C", 35 - item, 8 + item % 6)
    # P13: prumo fora na 1ª rodada, conforme na 2ª
    for item in range(1, 4):
        fvs("Térreo", "Trecho 1", "P", "P13", item, "C", 33, 9)
    fvs("Térreo", "Trecho 1", "P", "P13", 4, "NC", 32, 10, obs="Prumo fora 12 mm na direção do eixo B. Fôrma reaprumada.")
    fvs("Térreo", "Trecho 1", "P", "P13", 4, "C", 31, 8, rodada=2, obs="Reaprumado e conferido.")
    # P14: NC em aberto (armadura)
    for item in range(1, 5):
        fvs("Térreo", "Trecho 1", "P", "P14", item, "C", 30, 9)
    fvs("Térreo", "Trecho 1", "P", "P14", 5, "NC", 29, 11, obs="Faltam espaçadores na face interna.")
    # vigas do Térreo: as quatro primeiras com fôrma e armação conferidas
    for v in ("V1", "V2", "V3", "V4"):
        for item in range(1, 4):
            fvs("Térreo", "Trecho 1", "V", v, item, "C", 20, 9 + item)
    # 1º Pavimento: só o começo dos pilares
    for i in (1, 2, 3):
        for item in (1, 2, 3):
            fvs("1º Pavimento", "Trecho 1", "P", f"P{i}", item, "C", 3, 9)

    # ---- Concreto: duas concretagens com caminhões, áreas e CPs
    def concretagem(chave: str, pav_nome: str, trecho: str, dias: int, local: str, alvo: str, fck: int,
                    grupos: list[list[tuple[str, str]]], cps: list[tuple[int, list[float]]], volumes: list[float]) -> None:
        planta_id, setor_id = plantas[(pav_nome, trecho)]
        ref = f"{setor_id}@{REVISAO}"
        conc = c.linha("concretagens", chave, {"pavimento_id": pav[pav_nome], "data": c.dia(dias), "local_descricao": local,
                                               "codigo_construpoint": None, "fornecedor": "Concreteira Exemplo",
                                               "fck_mpa": fck, "slump_cm": 12, "slump_tolerancia_cm": 2,
                                               "idades_dias": [7, 28], "cps_por_idade": 2,
                                               "observacao": "Concretagem de exemplo (obra fictícia EXE)."}, dias, 7)
        for i, pecas in enumerate(grupos):
            seq = i + 1
            cam = c.linha("caminhoes", f"{chave}:{seq}", {
                "concretagem_id": conc, "sequencia": seq, "nota_fiscal": f"{chave[-1]}55{seq:02d}", "volume_m3": volumes[i],
                "saida_usina": c.hora(dias, 7 + i, 10), "chegada_obra": c.hora(dias, 7 + i, 50),
                "inicio_descarga": c.hora(dias, 8 + i, 0), "fim_descarga": c.hora(dias, 8 + i, 40),
                "slump_medido_cm": [12, 13, 11.5, 12][i % 4], "agua_adicionada_l": 20 if seq == 2 else 0,
                "cps_moldados": 4, "observacao": None}, dias, 8 + i)
            ids = [elementos[(pav_nome, t, n)] for t, n in pecas]
            pts = [pt for e in ids if e in geometria[(pav_nome, trecho)] for poly in geometria[(pav_nome, trecho)][e] for pt in poly]
            if pts:
                c.linha("caminhao_areas", f"{chave}:{seq}", {"caminhao_id": cam, "planta_ref": ref,
                                                            "contorno": _caixa(pts, 18), "alvo": alvo}, dias, 8 + i)
            for (t, n), e in zip(pecas, ids):
                c.linha("caminhao_elementos", f"{chave}:{seq}:{n}", {"caminhao_id": cam, "elemento_id": e,
                                                                    "origem": "manual" if t in SEM_DESENHO else "desenho",
                                                                    "fracao": None if t in SEM_DESENHO else 1, "incluido": True}, dias, 8 + i)
            for idade, valores in cps:
                if dias < idade:
                    continue  # ainda não chegou a idade: o app mostra "a romper"
                for n_cp, mpa in enumerate(valores[i * 2:i * 2 + 2], start=1):
                    c.linha("cp_resultados", f"{chave}:{seq}:{idade}:{n_cp}", {
                        "caminhao_id": cam, "idade_dias": idade, "numero_cp": n_cp, "data_ensaio": c.dia(dias - idade),
                        "resistencia_mpa": mpa, "origem": "manual", "observacao": None}, dias - idade, 15)

    p = lambda *ns: [("P", f"P{n}") for n in ns]  # noqa: E731
    concretagem("conc:1", "Térreo", "Trecho 1", 30, "Térreo \\ Trecho 1 \\ Pilares", "pilares", 30,
                [p(1, 2, 7, 8), p(3, 4, 9, 10), p(5, 6, 11, 12)],
                [(7, [22.1, 23.0, 21.4, 22.8, 23.5, 22.2]), (28, [31.2, 32.0, 30.4, 31.8, 27.1, 28.0])], [8, 8, 6])
    concretagem("conc:2", "Térreo", "Trecho 1", 6, "Térreo \\ Trecho 1 \\ Vigas e laje", "vigas_laje", 30,
                [[("V", "V1"), ("V", "V2"), ("V", "V3")], [("V", "V4"), ("L", nome_da_laje("Trecho 1"))]],
                [(7, [21.0, 21.6, 22.3, 20.9])], [8, 8])

    # ---- Fundações (pedido do 24 · FUND): estacas (S) e blocos (K) no Térreo, sem desenho, ligados ao caminhão
    # à mão. Precisa da migração 20261122180000_nucleo_elementos_s_k.sql (já no servidor de testes);
    # --sem-fundacoes tira, para um banco que ainda não aceita S e K.
    if fundacoes:
        pav_fund = PAVIMENTOS[0][0]
        for tipo, nome, secao in FUNDACOES:
            elementos[(pav_fund, tipo, nome)] = c.linha("elementos", f"{pav_fund}|{tipo}|{nome}", {
                "pavimento_id": pav[pav_fund], "tipo": tipo, "nome": nome, "secao": secao}, 60)
        concretagem("conc:fund", pav_fund, "Trecho 1", 45, "Térreo \\ Fundações", "pilares", 30,
                    [[(t, n) for t, n, _ in FUNDACOES if t == "S"], [(t, n) for t, n, _ in FUNDACOES if t == "K"]],
                    [(7, [21.8, 22.4, 22.0, 23.1]), (28, [31.5, 32.2, 30.9, 31.4])], [8.5, 8.5])

    # ---- Projetos: documentos, revisões, empresas, quem recebe e entregas
    docs = {}
    for sigla, disc, numero, curto, titulo, revs in PROJETOS:
        codigo = f"{OBRA}.{sigla}.{numero}.{curto}"
        d = c.linha("documentos", codigo, {"codigo": codigo, "disciplina_sigla": sigla, "disciplina": disc, "numero": numero,
                                           "nome_curto": curto, "titulo": titulo, "pasta_autodoc": f"{disc}/{revs[-1][0]}",
                                           "link_pasta": None}, 60)
        ult = len(revs) - 1
        ids_rev = []
        for i, (fase, n, dias) in enumerate(revs):
            ids_rev.append(c.linha("revisoes", f"{codigo}:{fase}{n}", {
                "documento_id": d, "fase": fase, "numero": n, "titulo": titulo, "status_autodoc": "Aprovado",
                "obsoleta": i < ult, "data_obsoleta": c.hora(revs[i + 1][2], 9) if i < ult else None,
                "cadastrada_em_autodoc": c.hora(dias, 9), "cadastrada_por": "Projetista Exemplo",
                "atualizada_em_autodoc": c.hora(dias, 9), "extensoes": "pdf", "vista_em": c.dia(dias)}, dias))
        docs[codigo] = (d, ids_rev)
    emp = {n: c.linha("empresas", n, {"nome": n, "contato": None, "ativa": True}, 60) for n in EMPRESAS}
    for disciplina, empresa, colab in (("ESTRUTURAL", "Formas Delta", "Ana"), ("ESTRUTURAL", "Empreiteira Alfa", ""),
                                       ("HIDRAULICO", "Hidráulica Beta", "Maria")):
        c.linha("distribuicao_destinatarios", f"{disciplina}:{empresa}", {
            "disciplina": disciplina, "pasta": "", "empresa": empresa, "colaborador": colab, "copias": 1, "ativo": True,
            "desde": c.dia(60), "substitui_id": None}, 60)
    # entregas: a Formas Delta pegou a R00 das formas do Térreo e não pegou a R01 (aparece desatualizada)
    d_for, r_for = docs["EXE.ES.100.FORTER"]
    c.linha("distribuicao_eventos", "for-r00-delta", {"tipo": "entrega", "empresa_id": emp["Formas Delta"], "colaborador": "Ana",
                                                      "documento_id": d_for, "revisao_id": r_for[1], "entrega_id": None,
                                                      "data_evento": c.dia(38), "foto_id": None, "observacao": None}, 38)
    d_hi, r_hi = docs["EXE.HI.001.AGUAFRIA"]
    c.linha("distribuicao_eventos", "hi-r00-beta", {"tipo": "entrega", "empresa_id": emp["Hidráulica Beta"], "colaborador": "Maria",
                                                    "documento_id": d_hi, "revisao_id": r_hi[0], "entrega_id": None,
                                                    "data_evento": c.dia(20), "foto_id": None, "observacao": None}, 20)

    # ---- Documentos (PBQP-H), cada um com o PDF de exemplo
    for escopo, cat, codigo, titulo, rev, feito, vence, resp, situacao in DOCUMENTOS:
        data = c.dia(feito)
        pdf = pdf_de_exemplo(["DOCUMENTO DE EXEMPLO", f"{codigo}  rev. {rev}", titulo,
                              f"{EMPRESA} · {'Obra Exemplo (EXE)' if escopo == 'obra' else 'todas as obras'}",
                              f"Data da revisao: {'/'.join(reversed(data.split('-')))}", f"Responsavel: {resp}", "",
                              "Arquivo ficticio, gerado para o servidor de testes."])
        arq = c.arquivo(f"doc:{codigo}:{rev}", "documentos/{id}.pdf", pdf, "application/pdf", f"{codigo}_rev{rev}.pdf", feito)
        c.linha("doc_documentos", f"{codigo}:{rev}", {
            "escopo": escopo, "categoria": cat, "codigo": codigo, "titulo": titulo, "revisao": rev, "data_revisao": data,
            "validade": None if vence is None else c.dia(-vence), "responsavel": resp, "situacao": situacao,
            "arquivo_id": arq, "observacao": None, "substitui_id": None, "cancelado": False}, feito)

    # ---- Diário de obra e relatórios: dois dias fechados e o de ontem aberto
    c.linha("diario_cadastro", "cadastro", {"endereco": "Rua Exemplo, 100 - Cidade Exemplo", "contratante": "Incorporadora Exemplo",
                                            "responsavel_tecnico": "Eng. Responsável Exemplo", "art": "EXE-0000000",
                                            "data_inicio": c.dia(120), "prazo_fim": c.dia(-480)}, 120)
    for dias, n_rdo, tarde in ((3, 1, "nublado"), (2, 2, "chuva_forte"), (1, None, "sol")):
        c.linha("diario_clima", f"{dias}:manha", {"data": c.dia(dias), "periodo": "manha", "tempo": "sol", "condicao": "praticavel"}, dias, 7)
        c.linha("diario_clima", f"{dias}:tarde", {"data": c.dia(dias), "periodo": "tarde", "tempo": tarde,
                                                  "condicao": "impraticavel" if tarde == "chuva_forte" else "praticavel"}, dias, 13)
        for funcao, q in (("Encarregado", 1), ("Carpinteiro", 6), ("Armador", 4), ("Servente", 5)):
            c.linha("diario_efetivo", f"{dias}:{funcao}", {"data": c.dia(dias), "empresa": EMPRESA, "funcao": funcao,
                                                           "quantidade": q, "observacao": None, "substitui_id": None}, dias, 7)
        c.linha("diario_equipamentos", f"{dias}:grua", {"data": c.dia(dias), "nome": "Grua", "quantidade": 1,
                                                        "situacao": "parado" if tarde == "chuva_forte" else "operando",
                                                        "observacao": None, "substitui_id": None}, dias, 7)
        c.linha("diario_servicos", f"{dias}:forma", {"data": c.dia(dias), "descricao": "Fôrma dos pilares P1 a P6 (1º Pavimento)",
                                                     "empresa": EMPRESA, "situacao": "concluido" if dias == 1 else "em_andamento",
                                                     "avanco_pct": {3: 40, 2: 70, 1: 100}[dias], "local_texto": "1º Pavimento",
                                                     "observacao": None, "substitui_id": None}, dias, 16)
        c.linha("diario_ocorrencias", f"{dias}:relato", {"data": c.dia(dias), "tipo": "relato",
                                                         "descricao": "Chuva forte à tarde; equipes recolhidas." if tarde == "chuva_forte"
                                                         else "Dia normal de trabalho, sem intercorrências.",
                                                         "horas_paradas": 2.5 if tarde == "chuva_forte" else None,
                                                         "local_texto": None, "substitui_id": None}, dias, 17)
        if n_rdo:
            c.linha("diario_fechamentos", f"{dias}", {"data": c.dia(dias), "acao": "fechado", "numero": n_rdo, "observacao": None}, dias, 18)
    c.linha("diario_materiais", "aco", {"data": c.dia(3), "material": "Aço CA-50 (barras 10 e 12,5 mm)", "quantidade": 2400,
                                        "unidade": "kg", "fornecedor": "Siderúrgica Exemplo", "nota_fiscal": "10234",
                                        "observacao": None, "substitui_id": None}, 3, 10)
    r1 = c.linha("relatorios", "problema", {"tipo": "problema", "data": c.dia(1), "titulo": "Vazamento de nata na fôrma da V2",
                                            "descricao": "Frestas no fundo da fôrma. Calafetar antes da concretagem.",
                                            "gravidade": "alta", "responsavel": "Mestre Joaquim", "prazo": c.dia(-2),
                                            "local_texto": "Térreo", "itens": [], "substitui_id": None}, 1, 15)
    c.linha("relatorio_andamentos", "problema:1", {"relatorio_id": r1, "situacao": "em_andamento",
                                                   "comentario": "Calafetação começou."}, 1, 16)
    c.linha("relatorios", "seguranca", {"tipo": "seguranca", "data": c.dia(2), "titulo": "Vistoria de segurança · Térreo",
                                        "descricao": "Vistoria semanal.", "gravidade": "baixa", "responsavel": "Técnica de segurança Carla",
                                        "prazo": None, "local_texto": "Térreo", "substitui_id": None,
                                        "itens": [{"item": "Uso de EPI pelas equipes", "resultado": "ok"},
                                                  {"item": "Guarda-corpo e proteção de periferia", "resultado": "atencao"},
                                                  {"item": "Aberturas de piso protegidas", "resultado": "ok"}]}, 2, 11)
    return c


# ---------------------------------------------------------------------------
# Saída: SQL (linhas) e pasta storage/ (arquivos)
# ---------------------------------------------------------------------------

# Ordem de entrada (chaves estrangeiras primeiro).
ORDEM = ["obras", "pavimentos", "fichas_modelo", "setores", "elementos", "arquivos", "plantas", "fvs_eventos",
         "concretagens", "caminhoes", "caminhao_areas", "caminhao_elementos", "cp_resultados",
         "documentos", "revisoes", "empresas", "distribuicao_destinatarios", "distribuicao_eventos",
         "doc_documentos", "diario_cadastro", "diario_clima", "diario_efetivo", "diario_equipamentos", "diario_servicos",
         "diario_ocorrencias", "diario_fechamentos", "diario_materiais", "relatorios", "relatorio_andamentos"]


def _sql_json(dados) -> str:
    texto = json.dumps(dados, ensure_ascii=False, separators=(",", ":"))
    if "$carga$" in texto:
        raise ErroCarga("texto com $carga$ não pode ir no SQL")
    return f"$carga${texto}$carga$"


def gerar_sql(c: Carga) -> str:
    faltam = set(c.linhas) - set(ORDEM)
    if faltam:
        raise ErroCarga(f"tabela fora da ORDEM: {sorted(faltam)}")
    # a carga só escreve linhas da obra EXE: toda linha leva o obra_id dela, e o "on conflict do nothing"
    # nunca altera linha que já existe. Outras obras no mesmo servidor (ex.: a cópia da obra piloto que o
    # Professor pôs no servidor de testes em 23/11) ficam intocadas, por isso não barram a carga.
    for tabela, linhas in c.linhas.items():
        for ln in linhas:
            dona = ln["id"] if tabela == "obras" else ln.get("obra_id")
            if dona != c.obra_id:
                raise ErroCarga(f"{tabela} {ln.get('id')}: linha fora da obra {c.codigo}")
    for caminho in c.arquivos:
        if not caminho.startswith(c.obra_id + "/"):
            raise ErroCarga(f"arquivo fora da obra {c.codigo}: {caminho}")
    partes = [f"-- Carga da obra {c.codigo} (pipeline/demo/carga_exe.py). SÓ no servidor de testes.",
              "-- Rodar de novo não duplica: on conflict (id) do nothing.", "begin;",
              # trava também no banco: recusa se o id ou o código desta obra já forem de outra obra
              f"do $$ begin if exists (select 1 from public.obras where (id = '{c.obra_id}' and codigo <> '{c.codigo}') "
              f"or (codigo = '{c.codigo}' and id <> '{c.obra_id}')) then "
              f"raise exception 'o id ou o código da obra {c.codigo} já são de outra obra: carga recusada'; end if; end $$;"]
    for tabela in ORDEM:
        linhas = c.linhas.get(tabela, [])
        grupos: dict[tuple[str, ...], list[dict]] = {}
        for ln in linhas:
            grupos.setdefault(tuple(ln), []).append(ln)
        for cols, lns in grupos.items():
            lista = ", ".join(cols)
            # o que é igual em todas as linhas (obra, usuário, dispositivo...) vai uma vez só: o SQL fica
            # pequeno o bastante para o editor SQL e para a ferramenta do Supabase
            comuns = {k: v for k, v in lns[0].items() if len(lns) > 1 and all(ln[k] == v for ln in lns)}
            linhas_json = [{k: v for k, v in ln.items() if k not in comuns} for ln in lns]
            fonte = (f"(select jsonb_agg(x || {_sql_json(comuns)}::jsonb) from jsonb_array_elements({_sql_json(linhas_json)}::jsonb) x)"
                     if comuns else f"{_sql_json(lns)}::jsonb")
            partes.append(f"insert into public.{tabela} ({lista})\nselect {lista} from "
                          f"jsonb_populate_recordset(null::public.{tabela}, {fonte})\non conflict (id) do nothing;")
    partes.append(f"insert into public.acessos (usuario_id, obra_id, papel) values ('{c.usuario}', '{c.obra_id}', 'gestor') "
                  "on conflict do nothing;")
    for cv in c.convites:
        partes.append("insert into public.convites (id, obra_id, nome, email, papel)\nselect id, obra_id, nome, email, papel from "
                      f"jsonb_populate_recordset(null::public.convites, {_sql_json([cv])}::jsonb)\non conflict do nothing;")
    partes.append("commit;")
    return "\n".join(partes) + "\n"


def gravar(c: Carga, pasta: pathlib.Path) -> None:
    pasta.mkdir(parents=True, exist_ok=True)
    (pasta / "carga.sql").write_text(gerar_sql(c), encoding="utf-8")
    for caminho, dados in c.arquivos.items():
        alvo = pasta / "storage" / caminho
        alvo.parent.mkdir(parents=True, exist_ok=True)
        alvo.write_bytes(dados)
    resumo = {t: len(c.linhas.get(t, [])) for t in ORDEM}
    (pasta / "resumo.json").write_text(json.dumps({"obra_id": c.obra_id, "codigo": c.codigo, "linhas": resumo, "arquivos": len(c.arquivos),
                                                   "convites": len(c.convites)}, ensure_ascii=False, indent=1), encoding="utf-8")


# ---------------------------------------------------------------------------
# Envio dos arquivos (rede: só o servidor de testes)
# ---------------------------------------------------------------------------

def chave_do_env(raiz: pathlib.Path = RAIZ) -> str:
    env = raiz / ".env"
    if env.exists():
        for ln in env.read_text(encoding="utf-8").splitlines():
            k, _, v = ln.partition("=")
            if k.strip() == "SUPABASE_TESTES_SECRET" and v.strip():
                return v.strip().strip('"').strip("'")
    raise ErroCarga("falta SUPABASE_TESTES_SECRET=... no .env da raiz do repositório (chave secreta do servidor de TESTES)")


def enviar(pasta: pathlib.Path, chave: str, url: str = URL_TESTES) -> int:
    url = conferir_url(url)
    raiz = pasta / "storage"
    arquivos = sorted(p for p in raiz.rglob("*") if p.is_file())
    if not arquivos:
        raise ErroCarga(f"nada em {raiz}: rode antes o \"gerar\"")
    obra_id = OBRA_ID
    if (pasta / "resumo.json").exists():  # a pasta de outra obra (carga_pacote.py) diz de quem é
        obra_id = json.loads((pasta / "resumo.json").read_text(encoding="utf-8"))["obra_id"]
    for n, arq in enumerate(arquivos, start=1):
        caminho = arq.relative_to(raiz).as_posix()
        if not caminho.startswith(obra_id + "/"):
            raise ErroCarga(f"arquivo fora da obra da carga: {caminho}")
        tipo = {".json": "application/json", ".pdf": "application/pdf"}.get(arq.suffix, "application/octet-stream")
        req = urllib.request.Request(f"{url}/storage/v1/object/{BUCKET}/{urllib.parse.quote(caminho)}", data=arq.read_bytes(),
                                     method="POST", headers={"apikey": chave, "Authorization": f"Bearer {chave}",
                                                             "Content-Type": tipo, "x-upsert": "true"})
        try:
            with urllib.request.urlopen(req, timeout=300) as r:
                r.read()
        except urllib.error.HTTPError as e:
            raise ErroCarga(f"envio de {caminho} recusado (HTTP {e.code}): {e.read()[:200].decode('utf-8', 'replace')}") from e
        print(f"  {n}/{len(arquivos)} {caminho}")
    return len(arquivos)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Obra fictícia EXE completa no servidor de testes.")
    sub = ap.add_subparsers(dest="acao", required=True)
    g = sub.add_parser("gerar", help="gera carga.sql e storage/ numa pasta (sem rede)")
    g.add_argument("pasta")
    g.add_argument("--usuario", required=True, help="id de um perfil que já existe no servidor de testes")
    g.add_argument("--hoje", help="AAAA-MM-DD (padrão: hoje)")
    g.add_argument("--convidar", help="e-mail para um convite de gestor na obra EXE")
    g.add_argument("--sem-fundacoes", action="store_true", help="sem estacas e blocos (banco sem a migração S/K)")
    e = sub.add_parser("enviar", help="envia storage/ ao bucket do servidor de testes")
    e.add_argument("pasta")
    e.add_argument("--url", default=URL_TESTES)
    args = ap.parse_args(argv)
    try:
        if args.acao == "gerar":
            hoje = dt.date.fromisoformat(args.hoje) if args.hoje else dt.date.today()
            c = montar(args.usuario, hoje, publicar_demo.Desenho(), args.convidar, not args.sem_fundacoes)
            gravar(c, pathlib.Path(args.pasta))
            print(f"Obra EXE ({OBRA_ID}): {c.total()} linhas em {len(c.linhas)} tabelas, {len(c.arquivos)} arquivos.")
            print(f"Agora: carga.sql no editor SQL do servidor de TESTES; depois: carga_exe.py enviar {args.pasta}")
        else:
            conferir_url(args.url)
            n = enviar(pathlib.Path(args.pasta), chave_do_env(), args.url)
            print(f"{n} arquivo(s) no bucket \"{BUCKET}\" do servidor de testes.")
    except (ErroCarga, publicar_demo.ErroDemo, publicar_planta.ErroPublicacao, pacote.ErroPacote, ValueError) as ex:
        print(f"PROBLEMA: {ex}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
