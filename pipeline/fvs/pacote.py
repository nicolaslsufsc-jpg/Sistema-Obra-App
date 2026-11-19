"""Pacote de planta da FVS: um trecho (uma prancha de forma) pronto para uso offline no app.

Dois arquivos, no armazenamento em {obra_id}/fvs/plantas/{planta_id}/:
    manifest.json   o que tem no pacote (JSON, UTF-8)
    pacote.bin      todas as imagens (tiles da planta, detalhes e tabelas de aço) uma depois da outra

O manifest diz onde cada imagem começa e quantos bytes tem dentro do pacote.bin ("pedacos").
Assim o app baixa só dois arquivos por trecho e corta as imagens sem precisar de biblioteca de zip.

Formato do manifest (versão 1). Coordenadas em pontos do PDF, x para a direita, y para baixo
(o mesmo do HTML legado e do Concreto, app/src/concreto/planta.ts):
{
  "formato": 1,
  "planta_id": "...", "obra": "EXE", "pavimento": "3º Pavimento", "trecho": "Trecho 1",
  "prancha": "EXE.ES.LO.129.FOR3PAVTIP-R03", "revisao": "R03",
  "largura": 2384.0, "altura": 1684.0, "tile": 512, "niveis": [-2, -1, 0, 1],
  "elementos": {"<elementos.id>": {"tipo": "P", "nome": "P32", "secao": "19x60",
                                   "rotulo": [x0, y0, x1, y1], "polys": [[[x, y], ...]],
                                   "detalhe": "P_P32"}},
               (ambiente: "tipo": "A", "nome": "303-04", "secao": "12,1 m²", "grupo": "Apto 303", opcional "comodo": "Suíte 01", sem detalhe)
               (pilar com consolo ou capitel: "partes": [{"tipo": "consolo", "polys": [[[x, y], ...]], "detalhe": "C_CONSOLO_P32"}])
               (furo de viga: "tipo": "F", "nome": "V12-F1", "viga": "<id da viga>", "furo": {"forma": "circular", "diametro": 10,
                "topo": 25, "fundo": 273, "disciplinas": ["Hidráulica"]}, sem detalhe; pipeline/fvs/furos.py)
  "detalhes": {"P_P32": {"titulo": "P32", "prancha": "EXE.ES.LO.285.PIL3PAVTIP-R00", "aco": true}},
  "barras": {"<id da barra>": {"camada": "longitudinal_inferior", "posicao": "N25", "texto": "N25 1ø10 C=850",
             "prancha": "EXE.ES.LO.466.LAJ2PAVTIP-R00", "linha": [[x, y], ...]}}   opcional (pipeline/fvs/barras_laje.py)
  "pedacos": {"t:0/1/2": [inicio, tamanho], "d:P_P32": [..], "a:P_P32": [..]}
}
"t:" = tile z/x/y (WebP), "d:" = imagem do detalhe (WebP), "a:" = tabela de aço (WebP).

Só biblioteca padrão: testado em pipeline/testes/test_fvs_pacote.py.
"""

from __future__ import annotations

import hashlib
import json
import re

FORMATO = 1
# P pilar, V viga, L laje, A ambiente (planta de arquitetura; pipeline/fvs/ambientes.py)
TIPOS = ("P", "V", "L", "A", "F")
# Partes do pilar concretadas com a laje (pipeline/fvs/partes.py): itens na ficha do pilar, toque próprio na planta.
TIPOS_DE_PARTE = ("consolo", "capitel")
CAMPOS_DO_FURO = ("forma", "diametro", "largura", "altura", "topo", "fundo", "disciplinas", "modelo_id")
# Barras de aço da laje (pipeline/fvs/barras_laje.py): as quatro camadas das pranchas de armação.
CAMADAS_DE_BARRAS = ("transversal_superior", "transversal_inferior", "longitudinal_superior", "longitudinal_inferior")
CAMPOS_DA_BARRA = ("posicao", "texto", "bitola", "comprimento", "quantidade", "espacamento", "prancha")
# Chave de detalhe vira nome de pedaço: só letras, números, _ e -.
CHAVE_SEGURA = re.compile(r"^[A-Za-z0-9_-]{1,120}$")
RE_TILE = re.compile(r"^-?\d+/\d+/\d+$")


class ErroPacote(Exception):
    pass


def chave_de_detalhe(tipo: str, titulo: str) -> str:
    """"P" + "P39=P40" -> "P_P39_P40" (nome seguro para o pedaço)."""
    bruto = f"{tipo}_{titulo}"
    return re.sub(r"[^A-Za-z0-9_-]", "_", bruto)[:120]


def montar(
    cabecalho: dict,
    tiles: dict[str, bytes],
    elementos: dict[str, dict],
    detalhes: dict[str, dict],
    barras: dict[str, dict] | None = None,
) -> tuple[bytes, bytes]:
    """Monta (manifest.json, pacote.bin).

    cabecalho: planta_id, obra, pavimento, trecho, prancha, revisao, largura, altura, tile, niveis
    tiles: {"z/x/y": bytes WebP}
    elementos: {id: {tipo, nome, secao, rotulo, polys, detalhe?, so_detalhe?, detalhe_corrigido_em?, partes?}}
      partes (só pilar): [{tipo: "consolo" | "capitel", polys, detalhe?}], cada tipo uma vez
      so_detalhe: peça na planta só para ver o detalhe (arranque do pilar de cima), sem ficha
      detalhe_corrigido_em: "AAAA-MM-DD" em que a imagem do detalhe mudou em relação ao pacote anterior
    detalhes: {chave: {titulo, prancha, img: bytes, aco: bytes | None}}
    barras: {id: {camada, linha: [[x, y], ...], posicao?, texto?, ...}} (barras de aço da laje, já na folha)
    """
    for campo in ("planta_id", "trecho", "prancha", "revisao", "largura", "altura", "tile", "niveis"):
        if campo not in cabecalho:
            raise ErroPacote(f"falta {campo} no cabeçalho do pacote")
    pedacos: dict[str, list[int]] = {}
    partes: list[bytes] = []
    posicao = 0

    def guardar(nome: str, dados: bytes) -> None:
        nonlocal posicao
        if nome in pedacos:
            raise ErroPacote(f"pedaço repetido: {nome}")
        pedacos[nome] = [posicao, len(dados)]
        partes.append(dados)
        posicao += len(dados)

    for z_x_y in sorted(tiles, key=_ordem_tile):
        if not RE_TILE.match(z_x_y):
            raise ErroPacote(f"nome de tile inválido: {z_x_y}")
        guardar("t:" + z_x_y, tiles[z_x_y])

    dets_manifest: dict[str, dict] = {}
    for chave in sorted(detalhes):
        if not CHAVE_SEGURA.match(chave):
            raise ErroPacote(f"chave de detalhe inválida: {chave}")
        d = detalhes[chave]
        guardar("d:" + chave, d["img"])
        if d.get("aco"):
            guardar("a:" + chave, d["aco"])
        dets_manifest[chave] = {"titulo": d.get("titulo", ""), "prancha": d.get("prancha", ""), "aco": bool(d.get("aco"))}

    elem_manifest: dict[str, dict] = {}
    for eid in sorted(elementos):
        e = elementos[eid]
        if e.get("tipo") not in TIPOS:
            raise ErroPacote(f"tipo de peça inválido em {e.get('nome')}: {e.get('tipo')}")
        det = e.get("detalhe")
        if det and det not in dets_manifest:
            raise ErroPacote(f"{e.get('nome')} aponta para um detalhe que não está no pacote ({det})")
        reg = {
            "tipo": e["tipo"],
            "nome": e["nome"],
            "secao": e.get("secao") or "",
            "rotulo": [round(float(v), 1) for v in e["rotulo"]],
            "polys": [[[round(float(x), 2), round(float(y), 2)] for x, y in p] for p in e.get("polys") or []],
        }
        if det:
            reg["detalhe"] = det
        if e.get("grupo"):
            reg["grupo"] = e["grupo"]
        if e.get("comodo"):
            if e["tipo"] != "A":
                raise ErroPacote(f"{e.get('nome')}: só ambiente tem nome de cômodo")
            reg["comodo"] = str(e["comodo"])
        if e.get("so_detalhe"):
            reg["so_detalhe"] = True
        if e.get("detalhe_corrigido_em"):
            reg["detalhe_corrigido_em"] = str(e["detalhe_corrigido_em"])
        if e["tipo"] == "F":
            if not e.get("viga") or not isinstance(e.get("furo"), dict):
                raise ErroPacote(f"{e.get('nome')}: furo sem a viga ou sem as medidas")
            if e["viga"] not in elementos or elementos[e["viga"]].get("tipo") != "V":
                raise ErroPacote(f"{e.get('nome')}: a viga do furo não está no pacote")
            reg["viga"] = e["viga"]
            reg["furo"] = {k: v for k, v in e["furo"].items() if k in CAMPOS_DO_FURO}
        elif e.get("viga") or e.get("furo"):
            raise ErroPacote(f"{e.get('nome')}: só furo tem viga e medidas de furo")
        if e.get("partes"):
            if e["tipo"] != "P":
                raise ErroPacote(f"{e.get('nome')}: só pilar tem consolo ou capitel")
            lista = []
            for pt in e["partes"]:
                if pt.get("tipo") not in TIPOS_DE_PARTE:
                    raise ErroPacote(f"{e.get('nome')}: parte desconhecida ({pt.get('tipo')})")
                if any(x["tipo"] == pt["tipo"] for x in lista):
                    raise ErroPacote(f"{e.get('nome')}: {pt['tipo']} repetido")
                polys = [[[round(float(x), 2), round(float(y), 2)] for x, y in q] for q in pt.get("polys") or []]
                if not polys or any(len(q) < 3 for q in polys):
                    raise ErroPacote(f"{e.get('nome')}: {pt['tipo']} sem contorno")
                item = {"tipo": pt["tipo"], "polys": polys}
                if pt.get("detalhe"):
                    if pt["detalhe"] not in dets_manifest:
                        raise ErroPacote(f"{e.get('nome')}: o {pt['tipo']} aponta para um detalhe que não está no pacote ({pt['detalhe']})")
                    item["detalhe"] = pt["detalhe"]
                lista.append(item)
            reg["partes"] = lista
        elem_manifest[eid] = reg

    barras_manifest: dict[str, dict] = {}
    for bid in sorted(barras or {}):
        b = barras[bid]
        if bid in elementos:
            raise ErroPacote(f"barra com o mesmo id de uma peça: {bid}")
        if b.get("camada") not in CAMADAS_DE_BARRAS:
            raise ErroPacote(f"barra {bid}: camada desconhecida ({b.get('camada')})")
        linha = [[round(float(x), 2), round(float(y), 2)] for x, y in b.get("linha") or []]
        if len(linha) < 2:
            raise ErroPacote(f"barra {bid}: precisa de pelo menos dois pontos")
        reg = {"camada": b["camada"], "linha": linha}
        reg.update({k: b[k] for k in CAMPOS_DA_BARRA if b.get(k) not in (None, "")})
        barras_manifest[bid] = reg

    manifest = {
        "formato": FORMATO,
        **{k: cabecalho[k] for k in ("planta_id", "obra", "pavimento", "trecho", "prancha", "revisao") if k in cabecalho},
        "largura": float(cabecalho["largura"]),
        "altura": float(cabecalho["altura"]),
        "tile": int(cabecalho["tile"]),
        "niveis": [int(n) for n in cabecalho["niveis"]],
        "elementos": elem_manifest,
        "detalhes": dets_manifest,
        "pedacos": pedacos,
    }
    if barras_manifest:
        manifest["barras"] = barras_manifest
    texto = json.dumps(manifest, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return texto, b"".join(partes)


def ler(manifest_bytes: bytes, pacote_bytes: bytes) -> tuple[dict, dict[str, bytes]]:
    """Inverso de montar (para os testes e para conferir antes de publicar)."""
    m = json.loads(manifest_bytes.decode("utf-8"))
    if m.get("formato") != FORMATO:
        raise ErroPacote(f"formato de pacote desconhecido: {m.get('formato')}")
    pedacos = {}
    for nome, (ini, tam) in m["pedacos"].items():
        if ini < 0 or tam < 0 or ini + tam > len(pacote_bytes):
            raise ErroPacote(f"pedaço fora do pacote: {nome}")
        pedacos[nome] = pacote_bytes[ini:ini + tam]
    return m, pedacos


def sha256(dados: bytes) -> str:
    return hashlib.sha256(dados).hexdigest()


def _ordem_tile(z_x_y: str):
    try:
        z, x, y = (int(v) for v in z_x_y.split("/"))
        return (z, y, x)
    except ValueError:
        return (0, 0, 0)
