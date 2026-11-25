"""Gera o índice de apoios da obra: para cada viga e laje, os pilares e as vigas que as apoiam.

Para que serve: a tela "Avanço da obra" (versão PC) divide vigas e lajes por residencial pelos pilares que
as apoiam. Sem este índice ela precisaria das plantas guardadas no aparelho (dezenas de MB por pavimento).
O índice são poucos KB e vai nas regras da FVS da obra, na chave "apoios" (fvs_regras no servidor;
config_fvs.json no pacote sem conta). Formato e leitura no app: app/src/pc/avanco.ts.

De onde lê: dos manifest.json dos pacotes de planta que já estão no PC (a pasta dos pacotes da obra, a da
bancada ou um dados_obra/). Não entra em servidor nenhum e não lê o pacote.bin.

A conta é a MESMA do app (app/src/fvs/escoramento_residencial.ts, `apoiosDoManifest` e `apoiosDaObra`) e do
botão "Baixar índice de apoios" do Avanço: mudou lá, mude aqui. O teste cruzado garante
(pipeline/testes/test_fvs_indice_apoios.py e app/src/pc/apoios_pipeline.test.ts leem os mesmos manifests e
têm que dar o mesmo arquivo).
  - viga: os pilares e as outras vigas que o desenho dela toca (folga = 1/4 do lado menor típico dos pilares);
  - laje do pacote (tipo L): os pilares e as vigas com o centro dentro dela;
  - por pavimento vale a planta com mais pilares e vigas (a forma; as de armadura e furação repetem peças);
  - peça que está na planta só para ver o detalhe (`so_detalhe`) não entra.
Área de laje desenhada no app não está nos pacotes. Para ela, o índice leva também os CENTROS (25/11, "5 blz"
do Nicolas): por pavimento, a planta escolhida e o centro de cada pilar e viga, pelo nome, em px da planta,
arredondado ao inteiro. O app pega o contorno da área (sincronizado, leve) e usa a regra da laje do pacote:
pilares e vigas com o centro dentro (app/src/pc/avanco.ts, `apoiosDasAreasPeloIndice`; aqui
`apoios_das_areas`, só para o teste cruzado).
    "centros": {"2º Pavimento": {"planta": "<planta_id>", "pecas": {"P:P1": [x, y], "V:V1": [x, y]}}}
Nome repetido no pavimento: os centros um atrás do outro ([x1, y1, x2, y2]).

Uso (no PC, na raiz do repositório):
    py pipeline/fvs/indice_apoios.py "C:\\...\\pacotes_da_obra" --saida "C:\\...\\apoios.json"
    py pipeline/fvs/indice_apoios.py "C:\\...\\pacotes" --saida "C:\\...\\config_fvs.json" --juntar-em "C:\\...\\config_fvs.json"

--saida: o arquivo a gravar, fora do repositório (dado de obra não entra no repositório).
--juntar-em: um config_fvs.json que já existe; a saída é ele com a chave "apoios" trocada (o resto fica igual).
Sem --juntar-em, a saída é {"apoios": {...}}, igual ao arquivo do botão do app.
"""

from __future__ import annotations

import argparse
import datetime
import json
import math
import pathlib
import re
import sys
import unicodedata

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from exportar_obra import dentro_de_repositorio  # noqa: E402

Ponto = tuple[float, float]


class ErroIndice(ValueError):
    pass


# ---------------------------------------------------------------- geometria (igual à do app)

def _dentro(p, pts) -> bool:
    """Ponto dentro do polígono (par/ímpar): app/src/fvs/areas.ts, `dentro`."""
    d = False
    n = len(pts)
    j = n - 1
    for i in range(n):
        xi, yi = pts[i][0], pts[i][1]
        xj, yj = pts[j][0], pts[j][1]
        if (yi > p[1]) != (yj > p[1]) and p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi:
            d = not d
        j = i
    return d


def _caixa(polys):
    pts = [p for poly in polys for p in poly]
    if not pts:
        return None
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    return (min(xs), min(ys), max(xs), max(ys))


def _cruza_caixa(a, b, folga: float) -> bool:
    return a[0] - folga <= b[2] and b[0] - folga <= a[2] and a[1] - folga <= b[3] and b[1] - folga <= a[3]


def _distancia_ponto_segmento(p, a, b) -> float:
    dx = b[0] - a[0]
    dy = b[1] - a[1]
    l2 = dx * dx + dy * dy
    t = max(0.0, min(1.0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) if l2 else 0.0
    return math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))


def _sinal(v: float) -> int:
    return (v > 0) - (v < 0)


def _segmentos_cruzam(a, b, c, d) -> bool:
    def lado(p, q, r) -> int:
        return _sinal((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]))

    return lado(a, b, c) * lado(a, b, d) < 0 and lado(c, d, a) * lado(c, d, b) < 0


def _arestas(poly):
    return [(poly[i], poly[(i + 1) % len(poly)]) for i in range(len(poly))]


def contornos_se_tocam(a, b, folga: float) -> bool:
    """Um dentro do outro, bordas que se cruzam ou que passam a menos de `folga`."""
    for pa in a:
        for pb in b:
            if not pa or not pb:
                continue
            if _dentro(pa[0], pb) or _dentro(pb[0], pa):
                return True
            for p, q in _arestas(pa):
                for r, s in _arestas(pb):
                    if _segmentos_cruzam(p, q, r, s):
                        return True
                    if min(_distancia_ponto_segmento(p, r, s), _distancia_ponto_segmento(q, r, s), _distancia_ponto_segmento(r, p, q), _distancia_ponto_segmento(s, p, q)) <= folga:
                        return True
    return False


def _mediana(valores: list[float]) -> float:
    if not valores:
        return 0.0
    return sorted(valores)[len(valores) // 2]


def _centro(e: dict) -> Ponto:
    """O meio da caixa do desenho; sem desenho, o meio do nome (app/src/fvs/ligacoes.ts, `centroDaPeca`)."""
    pts = [p for poly in e.get("polys", []) for p in poly]
    if not pts:
        r = e["rotulo"]
        return ((r[0] + r[2]) / 2, (r[1] + r[3]) / 2)
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    return ((min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2)


def apoios_do_manifest(elementos: dict) -> dict[str, tuple[list[str], list[str]]]:
    """id da viga ou laje -> (ids dos pilares, ids das vigas) que a apoiam, numa planta."""
    pecas = [(i, e) for i, e in elementos.items() if not e.get("so_detalhe") and any(len(p) >= 3 for p in e.get("polys", []))]
    pilares = [(i, e, _caixa(e["polys"])) for i, e in pecas if e.get("tipo") == "P"]
    vigas = [(i, e, _caixa(e["polys"])) for i, e in pecas if e.get("tipo") == "V"]
    folga = max(0.5, _mediana([min(cx[2] - cx[0], cx[3] - cx[1]) for _, _, cx in pilares]) / 4)
    saida: dict[str, tuple[list[str], list[str]]] = {}
    for vid, v, vcx in vigas:
        ps = [pid for pid, p, pcx in pilares if _cruza_caixa(vcx, pcx, folga) and contornos_se_tocam(v["polys"], p["polys"], folga)]
        vs = [oid for oid, o, ocx in vigas if oid != vid and _cruza_caixa(vcx, ocx, folga) and contornos_se_tocam(v["polys"], o["polys"], folga)]
        saida[vid] = (ps, vs)
    centros = [(i, e.get("tipo"), _centro(e)) for i, e, _ in pilares + vigas]
    for lid, laje in pecas:
        if laje.get("tipo") != "L":
            continue
        de = [(i, tipo) for i, tipo, c in centros if any(_dentro(c, poly) for poly in laje["polys"])]
        saida[lid] = ([i for i, t in de if t == "P"], [i for i, t in de if t == "V"])
    return saida


# ---------------------------------------------------------------- índice (igual ao do botão do app)

def _ordem_natural(nome: str):
    """Ordem dos nomes como no app (Intl.Collator pt-BR, numérico, sem diferenciar maiúscula nem acento)."""
    base = "".join(c for c in unicodedata.normalize("NFD", nome) if unicodedata.category(c) != "Mn").lower()
    return [(0, int(t), "") if t.isdigit() else (1, 0, t) for t in re.findall(r"\d+|\D+", base)]


def _nomes(ids: list[str], elementos: dict) -> list[str]:
    return sorted({str(elementos[i]["nome"]).strip() for i in ids if i in elementos}, key=_ordem_natural)


def ler_manifests(pastas: list[pathlib.Path]) -> list[dict]:
    """Todos os manifest.json debaixo das pastas (a planta do pacote, sem o pacote.bin)."""
    manifests = []
    for pasta in pastas:
        if not pasta.is_dir():
            raise ErroIndice(f"pasta não encontrada: {pasta}")
        for arq in sorted(pasta.rglob("manifest.json")):
            try:
                m = json.loads(arq.read_text(encoding="utf-8"))
            except (OSError, ValueError) as e:
                raise ErroIndice(f"não consegui ler {arq}: {e}") from e
            if isinstance(m, dict) and isinstance(m.get("elementos"), dict) and m.get("pavimento") and m.get("planta_id"):
                manifests.append(m)
    return manifests


def plantas_escolhidas(manifests: list[dict]) -> dict[str, dict]:
    """Por pavimento, a planta com mais pilares e vigas (a forma), como o app escolhe (`apoiosDaObra`)."""
    melhor: dict[str, tuple[int, dict]] = {}
    # na ordem do id da planta, que é a ordem em que o app as lê do banco do aparelho (o empate fica com a primeira)
    for m in sorted(manifests, key=lambda m: str(m["planta_id"])):
        n = sum(1 for e in m["elementos"].values() if e.get("tipo") in ("P", "V"))
        pavimento = str(m["pavimento"]).strip()
        if n > melhor.get(pavimento, (0, None))[0]:
            melhor[pavimento] = (n, m)
    return {pv: m for pv, (_, m) in melhor.items()}


def indice_dos_manifests(manifests: list[dict]) -> dict[str, dict[str, list[list[str]]]]:
    """{"pavimento": {"V:nome" | "L:nome": [[pilares], [vigas]]}}: só quem tem algum apoio."""
    pavimentos: dict[str, dict[str, list[list[str]]]] = {}
    for pavimento, m in plantas_escolhidas(manifests).items():
        elementos = m["elementos"]
        linhas: dict[str, list[list[str]]] = {}
        for pid, (ps, vs) in apoios_do_manifest(elementos).items():
            e = elementos[pid]
            linha = [_nomes(ps, elementos), _nomes(vs, elementos)]
            if linha[0] or linha[1]:
                linhas[f"{e['tipo']}:{str(e['nome']).strip()}"] = linha
        if linhas:
            pavimentos[pavimento] = dict(sorted(linhas.items(), key=lambda kv: (kv[0][0], _ordem_natural(kv[0][2:]))))
    return pavimentos


def _inteiro(v: float) -> int:
    """Arredonda igual ao app (Math.round: o meio sobe), para os dois lados darem o mesmo número."""
    return math.floor(v + 0.5)


def centros_dos_manifests(manifests: list[dict]) -> dict[str, dict]:
    """{"pavimento": {"planta": id, "pecas": {"P:nome" | "V:nome": [x, y, ...]}}}: a mesma planta dos apoios."""
    saida: dict[str, dict] = {}
    for pavimento, m in plantas_escolhidas(manifests).items():
        pecas: dict[str, list[int]] = {}
        for _, e in m["elementos"].items():
            # as mesmas peças que a laje do pacote olha (apoios_do_manifest): com desenho e fora o só detalhe
            if e.get("tipo") not in ("P", "V") or e.get("so_detalhe") or not any(len(p) >= 3 for p in e.get("polys", [])):
                continue
            x, y = _centro(e)
            pecas.setdefault(f"{e['tipo']}:{str(e['nome']).strip()}", []).extend([_inteiro(x), _inteiro(y)])
        if pecas:
            saida[pavimento] = {"planta": str(m["planta_id"]), "pecas": dict(sorted(pecas.items(), key=lambda kv: (kv[0][0], _ordem_natural(kv[0][2:]))))}
    return saida


def apoios_das_areas(centros: dict, areas: list[dict]) -> dict[str, list[list[str]]]:
    """Área desenhada {"id", "pavimento", "contorno"} -> [[pilares], [vigas]] pelos centros do índice.

    A mesma conta do app (`apoiosDasAreasPeloIndice`); aqui serve ao teste cruzado. Pavimento sem centros: fora.
    """
    porPav = {str(pv).strip().upper(): c for pv, c in centros.items()}
    saida: dict[str, list[list[str]]] = {}
    for a in areas:
        c = porPav.get(str(a["pavimento"]).strip().upper())
        if not c or len(a["contorno"]) < 3:
            continue
        de = {"P": set(), "V": set()}
        for chave, xy in c["pecas"].items():
            if any(_dentro((xy[i], xy[i + 1]), a["contorno"]) for i in range(0, len(xy) - 1, 2)):
                de[chave[0]].add(chave[2:])
        saida[a["id"]] = [sorted(de["P"], key=_ordem_natural), sorted(de["V"], key=_ordem_natural)]
    return saida


def conferir(apoios: object) -> dict[str, int]:
    """Confere o formato (o mesmo que o app aceita em `lerIndiceDeApoios`) e devolve a contagem."""
    pavimentos = apoios.get("pavimentos") if isinstance(apoios, dict) else None
    if not isinstance(pavimentos, dict):
        raise ErroIndice('o índice tem que ser {"pavimentos": {...}}')
    conta = {"pavimentos": 0, "vigas": 0, "lajes": 0}
    for pavimento, pecas in pavimentos.items():
        if not isinstance(pecas, dict):
            raise ErroIndice(f'pavimento "{pavimento}" fora do formato')
        conta["pavimentos"] += 1
        for chave, par in pecas.items():
            lista_ok = isinstance(par, list) and len(par) == 2 and all(isinstance(l, list) and len(l) <= 500 and all(isinstance(n, str) and n.strip() for n in l) for l in par)
            if not re.match(r"^[VL]:.", chave) or not lista_ok:
                raise ErroIndice(f'"{chave}" em "{pavimento}" fora do formato')
            conta["vigas" if chave[0] == "V" else "lajes"] += 1
    conta["centros"] = 0
    centros = apoios.get("centros", {})
    if not isinstance(centros, dict):
        raise ErroIndice('"centros" tem que ser {"pavimento": {...}}')
    for pavimento, c in centros.items():
        if not isinstance(c, dict) or not isinstance(c.get("planta"), str) or not isinstance(c.get("pecas"), dict):
            raise ErroIndice(f'centros de "{pavimento}" fora do formato')
        for chave, xy in c["pecas"].items():
            ok = isinstance(xy, list) and 2 <= len(xy) <= 100 and len(xy) % 2 == 0 and all(isinstance(n, (int, float)) and not isinstance(n, bool) for n in xy)
            if not re.match(r"^[PV]:.", chave) or not ok:
                raise ErroIndice(f'centro "{chave}" em "{pavimento}" fora do formato')
            conta["centros"] += 1
    return conta


def gerar(pastas: list[pathlib.Path], agora: datetime.datetime | None = None) -> dict:
    """O que vai na chave "apoios" das regras da obra."""
    manifests = ler_manifests(pastas)
    if not manifests:
        raise ErroIndice("nenhum manifest.json de planta nas pastas dadas")
    quando = (agora or datetime.datetime.now(datetime.timezone.utc)).astimezone(datetime.timezone.utc)
    apoios = {"gerado_em": quando.strftime("%Y-%m-%dT%H:%M:%S.000Z"), "pavimentos": indice_dos_manifests(manifests), "centros": centros_dos_manifests(manifests)}
    conferir(apoios)
    return apoios


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Gera o índice de apoios (viga e laje -> pilares e vigas) dos pacotes de planta do PC.")
    ap.add_argument("pastas", type=pathlib.Path, nargs="+", help="pasta(s) com os pacotes de planta (procura manifest.json dentro)")
    ap.add_argument("--saida", type=pathlib.Path, required=True, help="o .json a gravar, fora do repositório")
    ap.add_argument("--juntar-em", type=pathlib.Path, help='config_fvs.json existente: a saída é ele com a chave "apoios" trocada')
    args = ap.parse_args(argv)
    try:
        saida = args.saida.resolve()
        if dentro_de_repositorio(saida.parent):
            raise ErroIndice("a saída está dentro de um repositório git: dado de obra não entra no repositório")
        apoios = gerar(args.pastas)
        if args.juntar_em:
            config = json.loads(args.juntar_em.read_text(encoding="utf-8"))
            if not isinstance(config, dict):
                raise ErroIndice(f"{args.juntar_em} não é um objeto de regras")
            conteudo = {**config, "apoios": apoios}
        else:
            conteudo = {"apoios": apoios}
    except (ErroIndice, OSError, ValueError) as e:
        print(f"ERRO: {e}", file=sys.stderr)
        return 1
    texto = json.dumps(conteudo, ensure_ascii=False, separators=(",", ":"))
    saida.parent.mkdir(parents=True, exist_ok=True)
    saida.write_text(texto, encoding="utf-8")
    conta = conferir(apoios)
    print(f"Índice de apoios: {conta['vigas']} vigas e {conta['lajes']} lajes em {conta['pavimentos']} pavimentos; centros de {conta['centros']} pilares e vigas (para as lajes desenhadas no app).")
    for pavimento in sorted(set(apoios["pavimentos"]) | set(apoios["centros"]), key=_ordem_natural):
        pecas = apoios["pavimentos"].get(pavimento, {})
        c = apoios["centros"].get(pavimento, {"pecas": {}})
        tamanho = sum(len(json.dumps(x, ensure_ascii=False, separators=(",", ":")).encode("utf-8")) for x in (pecas, c))
        print(f"  {pavimento}: {sum(1 for k in pecas if k[0] == 'V')} vigas, {sum(1 for k in pecas if k[0] == 'L')} lajes, {len(c['pecas'])} centros, {tamanho} bytes")
    print(f"Gravado em {saida} ({len(texto.encode('utf-8'))} bytes; só a chave apoios: {len(json.dumps(apoios, ensure_ascii=False, separators=(',', ':')).encode('utf-8'))} bytes).")
    print('Não foi publicado. Quem publica as regras da obra põe a chave "apoios" na linha de fvs_regras.')
    return 0


if __name__ == "__main__":
    sys.exit(main())
