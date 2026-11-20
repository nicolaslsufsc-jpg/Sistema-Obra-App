"""Planta de ambientes de um pavimento, para as fichas por ambiente (alvenaria, reboco, pintura...).

Mesma lógica da estrutura: a prancha vigente fica de fundo e cada local de inspeção é um contorno
tocável. Aqui a prancha é a de arquitetura do pavimento e o local é o ambiente (sala, suíte, banho...).

De onde sai cada coisa:
- contorno dos ambientes: do modelo IFC da arquitetura. O modelo da obra piloto não traz os cômodos prontos
  (IfcSpace), mas traz paredes e portas: com as portas fechadas, cada espaço fechado entre paredes é
  um ambiente;
- posição na prancha: as paredes do modelo são casadas com as paredes desenhadas no PDF (o desenho
  é deslocado até coincidir), na escala informada;
- apartamento de cada ambiente: o rótulo "303(TIPO C1)" da prancha diz onde fica o apartamento, e as
  portas dizem que ambientes se ligam; a porta de entrada separa o apartamento do corredor.

O nome do ambiente (Living, Suíte 01...) não está nem no modelo nem na prancha: os ambientes saem
numerados por apartamento ("303-01", "303-02"...; área comum = "AC-01"...), na ordem de leitura.
O nome do cômodo vem, opcional, de uma tabela por apartamento-tipo digitada uma vez ("nomes", ver
ler_tabela_de_nomes). Ele vai no campo "comodo" do local; o "nome" (e o id) continua o número.
Sala e cozinha sem parede entre elas ficam um ambiente só (decisão do Nicolas, 18/11).

No pavimento.json (ver publicar_planta.py):
  "ambientes": {"ifc": "...TORRESEMMO-R03.ifc", "andar": "3", "prancha": "...036.3PAVTOXXXX-R03.pdf", "escala": 200,
                "nomes": "nomes_dos_comodos.json", "esquadrias": true}
"esquadrias": true (opcional) põe as portas e janelas do mesmo IFC como locais "E" dentro dos ambientes
(esquadrias.py).
"modulacao": {"pranchas": [...], "escala": 50} (opcional) põe o recorte da planta de 1ª fiada como detalhe
de cada ambiente (modulacao.py; o mesmo recorte para os cômodos do mesmo apartamento).

Ler o IFC leva alguns minutos por pavimento; o resultado fica guardado ao lado do IFC
(<arquivo>.andar<N>.json) e é reaproveitado enquanto o IFC não mudar.

Precisa de: pip install ifcopenshell shapely pymupdf pillow numpy scipy
"""

from __future__ import annotations

import collections
import json
import pathlib
import re
import sys

AQUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))
sys.path.insert(0, str(AQUI.parent / "legado"))

# Camadas do modelo que fecham ambiente (paredes, pilares de fachada, guarda-corpo das sacadas...).
CAMADAS_QUE_FECHAM = ("Parede - Geral", "Parede - Leve", "Pilar Fachada", "Guarda-Corpo", "Floreiras", "Elevador", "Escada")
# Portas e janelas pelo nome do objeto (PM80, PCF80A, PA260...; J = janela, não liga ambientes).
RE_ESQUADRIA = re.compile(r"^(PM|PCF|PA|PV|PE|PG|PC|J)[A-Z]*\d", re.I)
RE_APTO = re.compile(r"(\d{3,4})\s*\(TIPO\s*([A-Z0-9]+)\)")
AREA_MINIMA_M2 = 1.0
RESOLUCAO_M = 0.10  # metros por pixel no casamento modelo x prancha


class ErroAmbientes(Exception):
    pass


# ---------------------------------------------------------------------------
# Parte pura (testada em pipeline/testes/test_fvs_ambientes.py; só precisa de shapely)
# ---------------------------------------------------------------------------

def e_porta_de_entrada(nome: str, entradas=("PM90", "PCF*")) -> bool:
    """Porta que separa o apartamento da área comum. "PM90" é só a PM90 (a PM90B é interna)."""
    for e in entradas:
        if (e.endswith("*") and nome.startswith(e[:-1])) or nome == e:
            return True
    return False


def agrupar_por_apartamento(ambientes, portas, rotulos, entradas=("PM90", "PCF*")) -> dict[str, dict]:
    """{apartamento: {"tipo": "C1", "ambientes": [índices]}}.

    ambientes: polígonos (shapely); portas: [(nome, polígono)]; rotulos: [(número, tipo, ponto)].
    Parte do ambiente onde está o rótulo e segue pelas portas, sem atravessar porta de entrada.
    """
    from shapely.strtree import STRtree

    arvore = STRtree(ambientes)
    vizinhos: dict[int, set[int]] = collections.defaultdict(set)
    bloqueado: set[tuple[int, int]] = set()
    for nome, geom in portas:
        if nome.upper().startswith("J"):
            continue
        g = geom.buffer(0.15)
        ids = [int(i) for i in arvore.query(g) if ambientes[int(i)].intersects(g)]
        for i in ids:
            for j in ids:
                if i != j:
                    vizinhos[i].add(j)
                    if e_porta_de_entrada(nome, entradas):
                        bloqueado.add((i, j))
    aptos: dict[str, dict] = {}
    dono: dict[int, str] = {}
    for numero, tipo, ponto in rotulos:
        perto = [int(i) for i in arvore.query(ponto.buffer(1.5))]
        if not perto:
            continue
        inicio = min(perto, key=lambda i: ambientes[i].distance(ponto))
        vistos, fila = {inicio}, [inicio]
        while fila:
            i = fila.pop()
            for j in vizinhos[i]:
                if j not in vistos and (i, j) not in bloqueado:
                    vistos.add(j)
                    fila.append(j)
        livres = sorted(i for i in vistos if i not in dono)  # ambiente disputado fica com o primeiro
        for i in livres:
            dono[i] = numero
        aptos[numero] = {"tipo": tipo, "ambientes": livres}
    return aptos


def nomear(ambientes, aptos: dict[str, dict]) -> list[dict]:
    """[{indice, nome, grupo, area}] na ordem de leitura (de cima para baixo, da esquerda para a direita)."""
    def ordem(i):
        c = ambientes[i].representative_point()
        return (-round(c.y / 1.5), c.x)

    saida = []
    dono = {i: n for n, a in aptos.items() for i in a["ambientes"]}
    for numero in sorted(aptos, key=lambda n: (len(n), n)):
        for k, i in enumerate(sorted(aptos[numero]["ambientes"], key=ordem), 1):
            saida.append({"indice": i, "nome": f"{numero}-{k:02d}", "grupo": f"Apto {numero}", "area": ambientes[i].area})
    comuns = sorted((i for i in range(len(ambientes)) if i not in dono), key=ordem)
    for k, i in enumerate(comuns, 1):
        saida.append({"indice": i, "nome": f"AC-{k:02d}", "grupo": "Área comum", "area": ambientes[i].area})
    return saida


def ler_tabela_de_nomes(caminho: str) -> dict:
    """Tabela de nomes dos cômodos (dado da obra, fora do repositório; exemplo em ambientes_nomes.exemplo.json).

    {"tipos": {"C1": {"_base": "303",                       # o apartamento que serviu de modelo do tipo
                      "01": {"nome": "Suíte 01", "area": 12.1, "pos": [-3.2, 4.1]}, ...}},
     "aptos": {"x04": {"05": "Suíte 01"}},                  # só o que muda num apartamento (vence o tipo);
                                                            # "x04" = o 04 de todo andar, "304" = só o do 3º
     "area_comum": {"01": "Hall"}}                          # "AC-01"... (vale para o pavimento do arquivo)

    Na mesma torre, apartamentos do mesmo tipo ficam girados ou espelhados, e a numeração da planta
    (ordem de leitura) muda de um para o outro. Por isso cada cômodo do tipo guarda a área e a posição
    (em metros, a partir do centro do apartamento): os outros apartamentos do tipo são casados com o
    modelo pela forma (casar_com_o_tipo), e não pelo número. Cômodo só com o nome ("01": "Living") vale
    pelo número, isto é, só no apartamento base. A tabela sai pronta para preencher de modelo_da_tabela.
    """
    try:
        t = json.loads(pathlib.Path(caminho).read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        raise ErroAmbientes(f"tabela de nomes ilegível ({caminho}): {e}") from e
    if not isinstance(t, dict):
        raise ErroAmbientes("tabela de nomes: tem que ser um objeto com \"tipos\", \"aptos\" e/ou \"area_comum\"")
    for k, v in (t.get("tipos") or {}).items():
        if not isinstance(v, dict):
            raise ErroAmbientes(f"tabela de nomes: \"tipos\" > \"{k}\" tem que ser {{\"01\": ...}}")
        for n, c in v.items():
            if n.startswith("_"):
                continue
            if isinstance(c, dict):
                pos = c.get("pos")
                if not isinstance(c.get("nome", ""), str) or (pos is not None and not (isinstance(pos, list) and len(pos) == 2)):
                    raise ErroAmbientes(f"tabela de nomes: \"tipos\" > \"{k}\" > \"{n}\" tem que ter \"nome\" (texto) e \"pos\" [x, y]")
            elif not isinstance(c, str):
                raise ErroAmbientes(f"tabela de nomes: \"tipos\" > \"{k}\" > \"{n}\" tem que ser um nome ou {{\"nome\", \"area\", \"pos\"}}")
    for k, v in (t.get("aptos") or {}).items():
        if not isinstance(v, dict) or not all(isinstance(n, str) for n in v.values()):
            raise ErroAmbientes(f"tabela de nomes: \"aptos\" > \"{k}\" tem que ser {{\"01\": \"Living\", ...}}")
    if not all(isinstance(n, str) for n in (t.get("area_comum") or {}).values()):
        raise ErroAmbientes("tabela de nomes: \"area_comum\" tem que ser {\"01\": \"Hall\", ...}")
    return t


# ---------------------------------------------------------------------------
# Que ficha vale em que cômodo (tabela ficha x tipo de cômodo; dado da obra, fora do repositório)
# ---------------------------------------------------------------------------
RESPOSTAS_FICHA = ("sim", "nao", "talvez")


def classe_do_comodo(comodo: str | None) -> str | None:
    """Tipo do cômodo = o nome sem os números: "Suíte 01" -> "Suíte", "Suíte 01 / Banho 02" -> "Suíte / Banho".
    Cômodo sem nome (área comum ainda sem tabela, por exemplo) -> None."""
    if not comodo:
        return None
    return re.sub(r"\s+", " ", re.sub(r" \d+", "", comodo)).strip() or None


def ler_fichas_por_comodo(caminho: str, aceita_talvez: bool = False) -> dict:
    """Tabela ficha x tipo de cômodo (exemplo em fichas_por_comodo.exemplo.json). Serve o arquivo que a página
    de conferência gera (respostas_fichas_por_comodo.json) e também a proposta, antes da conferência:

    {"fichas": {"EXE-001": "Pintura interna", ...},                 # opcional; sem ela, valem os códigos das classes
     "classes": {"Banho": {"EXE-001": "sim", "EXE-002": "nao"}, ...}}  # "sim" | "nao" | "talvez" (= falta conferir)

    Devolve {"fichas": {código: título}, "classes": {tipo: frozenset(códigos "sim")}, "talvez": [(tipo, código)]}.
    Com "talvez" na tabela dá erro (falta conferir), a não ser com aceita_talvez=True: aí o "talvez" conta como
    "sim", para a ficha continuar aparecendo no cômodo como hoje.
    """
    try:
        t = json.loads(pathlib.Path(caminho).read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        raise ErroAmbientes(f"tabela de fichas por cômodo ilegível ({caminho}): {e}") from e
    if not isinstance(t, dict) or not isinstance(t.get("classes"), dict) or not t["classes"]:
        raise ErroAmbientes("tabela de fichas por cômodo: tem que ter \"classes\": {\"Banho\": {\"código\": \"sim\"}, ...}")
    fichas = t.get("fichas")
    if fichas is not None and not (isinstance(fichas, dict) and all(isinstance(v, str) for v in fichas.values())):
        raise ErroAmbientes("tabela de fichas por cômodo: \"fichas\" tem que ser {\"código\": \"título\", ...}")
    classes, talvez, vistos = {}, [], {}
    for classe, linha in t["classes"].items():
        if not isinstance(linha, dict):
            raise ErroAmbientes(f"tabela de fichas por cômodo: \"{classe}\" tem que ser {{\"código\": \"sim\" | \"nao\"}}")
        if classe_do_comodo(classe) != classe:
            raise ErroAmbientes(f"tabela de fichas por cômodo: \"{classe}\" tem que ser o tipo, sem número (\"{classe_do_comodo(classe)}\")")
        sim = set()
        for cod, v in linha.items():
            if v not in RESPOSTAS_FICHA:
                raise ErroAmbientes(f"tabela de fichas por cômodo: {classe} > {cod} = {v!r}; só vale \"sim\", \"nao\" ou \"talvez\"")
            if fichas is not None and cod not in fichas:
                raise ErroAmbientes(f"tabela de fichas por cômodo: {classe} > {cod}: ficha fora da lista \"fichas\"")
            vistos.setdefault(cod, cod)
            if v == "talvez":
                talvez.append((classe, cod))
            if v == "sim" or (v == "talvez" and aceita_talvez):
                sim.add(cod)
        classes[classe] = frozenset(sim)
    if talvez and not aceita_talvez:
        lista = "; ".join(f"{c} > {f}" for c, f in talvez[:5]) + (f" e mais {len(talvez) - 5}" if len(talvez) > 5 else "")
        raise ErroAmbientes(f"tabela de fichas por cômodo: faltam conferir {len(talvez)} casas ({lista})")
    return {"fichas": dict(fichas) if fichas is not None else vistos, "classes": classes, "talvez": talvez}


def ficha_vale_no_comodo(codigo: str, comodo: str | None, tabela: dict) -> bool:
    """A ficha aparece neste cômodo? Sem regra (ficha fora da tabela, cômodo sem nome ou de um tipo que a
    tabela não tem) a resposta é sim: a ficha continua aparecendo, como antes da tabela."""
    classe = classe_do_comodo(comodo)
    if codigo not in tabela["fichas"] or classe not in tabela["classes"]:
        return True
    return codigo in tabela["classes"][classe]


def _girar(x: float, y: float, k: int) -> tuple[float, float]:
    for _ in range(k):
        x, y = -y, x
    return x, y


# As 8 posições de um apartamento do mesmo tipo: 4 giros de 90°, com e sem espelho.
ORIENTACOES = [(lambda x, y, k=k, e=e: _girar(-x if e else x, y, k)) for e in (False, True) for k in range(4)]
DIST_MAX_M = 1.0      # centro do cômodo até o do modelo, depois de alinhar o apartamento
DIF_AREA_MAX = 0.2    # 20% de diferença de área
ANCORAS = 3           # os 3 maiores cômodos de cada lado servem para alinhar o apartamento ao modelo


def comodos_do_apto(nomeados: list[dict], ambientes, apto: str) -> dict[str, tuple[float, tuple[float, float]]]:
    """{número: (área, (x, y) do centro do cômodo a partir do centro do apartamento)}, em metros."""
    salas = {}
    for a in nomeados:
        ap, num = a["nome"].rsplit("-", 1)
        if ap == apto:
            c = ambientes[a["indice"]].centroid
            salas[num] = (a["area"], (c.x, c.y))
    total = sum(ar for ar, _ in salas.values()) or 1.0
    cx = sum(ar * p[0] for ar, p in salas.values()) / total
    cy = sum(ar * p[1] for ar, p in salas.values()) / total
    return {n: (ar, (p[0] - cx, p[1] - cy)) for n, (ar, p) in salas.items()}


def casar_com_o_tipo(salas: dict[str, tuple[float, tuple[float, float]]], modelo: dict[str, tuple[float, tuple[float, float]]]) -> dict[str, str]:
    """{número no apartamento: número no modelo do tipo}, pela forma (área e posição), em qualquer das 8
    orientações. Fica de fora o cômodo sem par a menos de DIST_MAX_M e DIF_AREA_MAX (não inventa nome)."""
    import numpy as np
    from scipy.optimize import linear_sum_assignment

    if not salas or not modelo:
        return {}
    ns, nm = list(salas), list(modelo)
    dif = np.array([[abs(salas[n][0] - modelo[m][0]) / max(salas[n][0], modelo[m][0], 1e-6) for m in nm] for n in ns])

    def casar(pts, dx, dy):
        dist = np.array([[((x + dx - modelo[m][1][0]) ** 2 + (y + dy - modelo[m][1][1]) ** 2) ** 0.5 for m in nm] for x, y in pts])
        custo = dist + 5 * dif
        li, co = linear_sum_assignment(custo)
        ok = [(i, j) for i, j in zip(li, co) if dist[i, j] <= DIST_MAX_M and dif[i, j] <= DIF_AREA_MAX]
        # vence o que casa mais cômodos; empate, o de menor custo
        return -len(ok) * 1000 + float(custo[li, co].sum()), ok

    # Os maiores cômodos servem de âncora quando o apartamento tem cômodos a mais ou a menos que o
    # modelo: o centro (média pela área) se desloca e nenhum cômodo fica a menos de DIST_MAX_M do par.
    grandes = lambda d: sorted(d, key=lambda n: -d[n][0])[:ANCORAS]
    melhor: tuple[float, list] = (float("inf"), [])
    for orientar in ORIENTACOES:
        pts = [orientar(*salas[n][1]) for n in ns]
        deslocamentos = [(0.0, 0.0)]
        for n in grandes(salas):
            for m in grandes(modelo):
                if dif[ns.index(n), nm.index(m)] <= DIF_AREA_MAX:
                    x, y = pts[ns.index(n)]
                    deslocamentos.append((modelo[m][1][0] - x, modelo[m][1][1] - y))
        for dx, dy in deslocamentos:
            nota, ok = casar(pts, dx, dy)
            if len(ok) >= 2:  # acerta o deslocamento pela média dos pares e casa de novo
                ax = sum(modelo[nm[j]][1][0] - pts[i][0] for i, j in ok) / len(ok)
                ay = sum(modelo[nm[j]][1][1] - pts[i][1] for i, j in ok) / len(ok)
                nota, ok = min((nota, ok), casar(pts, ax, ay), key=lambda r: r[0])
            if nota < melhor[0]:
                melhor = (nota, ok)
    return {ns[i]: nm[j] for i, j in melhor[1]}


def posicao_no_andar(apto: str) -> str:
    """"304" -> "x04": a posição do apartamento no andar, igual em todos os andares da torre."""
    return "x" + apto[-2:] if len(apto) >= 3 and apto.isdigit() else apto


def nomes_dos_comodos(nomeados: list[dict], aptos: dict[str, dict], tabela: dict, ambientes=None) -> tuple[dict[str, str], dict]:
    """Nome de cada cômodo pela tabela: ({"303-05": "Suíte 01"}, resumo).

    nomeados: saída de nomear(); aptos: de agrupar_por_apartamento (dá o tipo de cada apartamento);
    ambientes: os polígonos (para casar pela forma; sem eles, só pelo número).
    resumo: quantos ganharam nome, os sem nome por apartamento e os cômodos do tipo que não acharam par
    num apartamento (cômodo a menos que o tipo, ou diferente dele: conferir na tela)."""
    tipos, por_apto, comum = tabela.get("tipos") or {}, tabela.get("aptos") or {}, tabela.get("area_comum") or {}
    saida: dict[str, str] = {}
    sem_nome: dict[str, int] = collections.Counter()
    sem_par: list[str] = []
    nums: dict[str, list[str]] = collections.defaultdict(list)
    for a in nomeados:
        apto, num = a["nome"].rsplit("-", 1)
        nums[apto].append(num)
    for apto, lista in nums.items():
        if apto == "AC":
            nomes = {n: comum.get(n) for n in lista}
        else:
            tipo = (aptos.get(apto) or {}).get("tipo") or ""
            do_tipo = tipos.get(tipo) or {}
            t = {n: c for n, c in do_tipo.items() if not n.startswith("_")}
            com_forma = {n: (float(c.get("area") or 0), tuple(c["pos"])) for n, c in t.items() if isinstance(c, dict) and c.get("pos")}
            nome_de = {n: (c.get("nome") if isinstance(c, dict) else c) for n, c in t.items()}
            if ambientes is not None and com_forma and apto != do_tipo.get("_base"):
                pares = casar_com_o_tipo(comodos_do_apto(nomeados, ambientes, apto), com_forma)
                nomes = {n: nome_de.get(pares[n]) if n in pares else None for n in lista}
                sem_par += [f"{apto} (tipo {tipo}, {m})" for m in sorted(set(com_forma) - set(pares.values())) if (nome_de.get(m) or "").strip()]
            else:
                nomes = {n: nome_de.get(n) for n in lista}
            # "x04" corrige o apartamento 04 de todos os andares; "304" só o do 3º (e vence o "x04")
            for chave in (posicao_no_andar(apto), apto):
                for n, v in (por_apto.get(chave) or {}).items():
                    if n in nomes:
                        nomes[n] = v
        for n in lista:
            nome = (nomes.get(n) or "").strip()
            if nome:
                saida[f"{apto}-{n}"] = nome
            else:
                sem_nome[apto] += 1
    return saida, {"com_nome": len(saida), "sem_nome": dict(sorted(sem_nome.items())), "do_tipo_sem_par": sem_par}


def modelo_da_tabela(nomeados: list[dict], aptos: dict[str, dict], ambientes, tabela: dict | None = None) -> dict:
    """Tabela de nomes para preencher: um apartamento de cada tipo (o "_base"), com o número, a área e a
    posição de cada cômodo. Já vem com os nomes que a tabela atual tem. Preenche-se olhando o apartamento
    base na planta do app, onde o número está escrito em cada cômodo."""
    tabela = tabela or {}
    ja_tipos = tabela.get("tipos") or {}
    tipos: dict[str, dict] = {}
    for apto in sorted(aptos, key=lambda n: (len(n), n)):
        tipo = aptos[apto]["tipo"]
        base = (ja_tipos.get(tipo) or {}).get("_base")
        if tipo in tipos or (base and base != apto and base in aptos):
            continue
        ja = ja_tipos.get(tipo) or {}
        salas = comodos_do_apto(nomeados, ambientes, apto)
        reg: dict = {"_base": apto}
        for n in sorted(salas):
            antes = ja.get(n)
            nome = antes.get("nome", "") if isinstance(antes, dict) else (antes or "")
            area, (x, y) = salas[n]
            reg[n] = {"nome": nome, "area": round(area, 1), "pos": [round(x, 2), round(y, 2)]}
        tipos[tipo] = reg
    comum = sorted(n["nome"].rsplit("-", 1)[1] for n in nomeados if n["nome"].startswith("AC-"))
    ja_ac = tabela.get("area_comum") or {}
    return {"_leia": "Preencha \"nome\" de cada cômodo do apartamento base de cada tipo (\"_base\"; o número é o da planta). "
                     "Não mexa em \"area\" e \"pos\": é por elas que os outros apartamentos do tipo, girados ou espelhados, "
                     "acham o nome. Vazio = fica só o número. \"aptos\" corrige um apartamento que difere do tipo.",
            "tipos": tipos, "aptos": tabela.get("aptos") or {},
            "area_comum": {n: ja_ac.get(n, "") for n in comum}}


def area_br(m2: float) -> str:
    return f"{m2:.1f} m²".replace(".", ",")


# ---------------------------------------------------------------------------
# Modelo IFC
# ---------------------------------------------------------------------------

def extrair_do_ifc(caminho_ifc: str, andar: str) -> dict:
    """Paredes (unidas), ambientes e portas de um andar, em metros (coordenadas do modelo)."""
    import ifcopenshell
    import ifcopenshell.geom
    import shapely
    from shapely.geometry import Polygon
    from shapely.ops import unary_union

    f = ifcopenshell.open(caminho_ifc)
    camada = {}
    for la in f.by_type("IfcPresentationLayerAssignment"):
        for it in la.AssignedItems:
            camada[it.id()] = la.Name
    contido = {}
    for r in f.by_type("IfcRelContainedInSpatialStructure"):
        for e in r.RelatedElements:
            contido[e.id()] = r.RelatingStructure
    andares = [s for s in f.by_type("IfcBuildingStorey") if (s.Name or "").strip().startswith(andar)]
    if len(andares) != 1:
        nomes = ", ".join((s.Name or "").strip() for s in f.by_type("IfcBuildingStorey"))
        raise ErroAmbientes(f"andar \"{andar}\" não encontrado no IFC (ou há mais de um). Andares: {nomes}")
    st = andares[0]
    cota = (st.Elevation or 0) / 1000.0

    def camada_de(e) -> str:
        nome = None
        if e.Representation:
            for rep in e.Representation.Representations:
                nome = camada.get(rep.id()) or nome
                for it in rep.Items:
                    nome = camada.get(it.id()) or nome
        return nome or ""

    def no_andar(e) -> bool:
        return contido.get(e.id()) == st or bool(e.Decomposes and contido.get(e.Decomposes[0].RelatingObject.id()) == st)

    fechado = ifcopenshell.geom.settings()
    fechado.set("use-world-coords", True)
    fechado.set("disable-opening-subtractions", True)  # portas e janelas fechadas
    aberto = ifcopenshell.geom.settings()
    aberto.set("use-world-coords", True)

    def planta(e, ajustes):
        try:
            sh = ifcopenshell.geom.create_shape(ajustes, e)
        except Exception:
            return None, None
        v, fa = sh.geometry.verts, sh.geometry.faces
        if not fa:
            return None, None
        xs, ys, zs = v[0::3], v[1::3], v[2::3]
        tris = []
        for i in range(0, len(fa), 3):
            a, b, c = fa[i], fa[i + 1], fa[i + 2]
            t = Polygon([(xs[a], ys[a]), (xs[b], ys[b]), (xs[c], ys[c])])
            if t.area > 1e-7:
                tris.append(t)
        return (unary_union(tris) if tris else None), (min(zs), max(zs))

    paredes, portas = [], []
    for e in f.by_type("IfcBuildingElementProxy") + f.by_type("IfcBuildingElementPart"):
        if not no_andar(e):
            continue
        nome = (e.Name or "").strip()
        if e.is_a("IfcBuildingElementProxy") and RE_ESQUADRIA.match(nome) and contido.get(e.id()) == st:
            g, _ = planta(e, aberto)
            if g is not None and not g.is_empty:
                portas.append({"nome": nome, "wkt": shapely.to_wkt(g.minimum_rotated_rectangle, rounding_precision=3)})
            continue
        if not any(c in camada_de(e) for c in CAMADAS_QUE_FECHAM):
            continue
        g, z = planta(e, fechado)
        # só o que passa a 1 m do piso ou tem mais de 1,5 m de altura (parede, não viga nem peitoril solto)
        if g is not None and (z[0] <= cota + 1.0 <= z[1] or z[1] - z[0] > 1.5):
            paredes.append(g)
    if not paredes:
        raise ErroAmbientes(f"nenhuma parede encontrada no andar {st.Name} (camadas esperadas: {', '.join(CAMADAS_QUE_FECHAM)})")
    uniao = unary_union(paredes).buffer(0.02).buffer(-0.02)
    ambientes = []
    for g in getattr(uniao, "geoms", [uniao]):
        for furo in g.interiors:
            p = Polygon(furo)
            if p.area >= AREA_MINIMA_M2:
                ambientes.append(shapely.to_wkt(p.simplify(0.01), rounding_precision=3))
    return {"andar": (st.Name or "").strip(), "paredes": shapely.to_wkt(uniao, rounding_precision=3), "ambientes": ambientes, "portas": portas}


def do_ifc_com_guarda(caminho_ifc: str, andar: str) -> dict:
    """extrair_do_ifc guardando o resultado ao lado do IFC (leva minutos; reaproveita se o IFC não mudou)."""
    ifc = pathlib.Path(caminho_ifc)
    guarda = ifc.with_name(f"{ifc.name}.andar{andar}.json")
    if guarda.exists() and guarda.stat().st_mtime >= ifc.stat().st_mtime:
        return json.loads(guarda.read_text(encoding="utf-8"))
    print(f"Lendo o andar {andar} do IFC (alguns minutos)...")
    dados = extrair_do_ifc(str(ifc), andar)
    guarda.write_text(json.dumps(dados), encoding="utf-8")
    return dados


# ---------------------------------------------------------------------------
# Prancha PDF
# ---------------------------------------------------------------------------

def casar_com_a_prancha(page, paredes, escala: float) -> dict:
    """Deslocamento que põe as paredes do modelo em cima das paredes desenhadas na prancha.

    Desenha as duas em preto e branco na mesma resolução e procura o deslocamento com mais
    coincidência. Devolve os números para converter metros do modelo em pontos da prancha.
    """
    import numpy as np
    from PIL import Image, ImageDraw

    pt_por_m = 1000.0 / escala * 72 / 25.4
    k = 1 / (pt_por_m * RESOLUCAO_M)  # pixel por ponto
    M = page.rotation_matrix
    larg, alt = page.rect.width, page.rect.height
    im_p = Image.new("L", (int(larg * k) + 1, int(alt * k) + 1), 0)
    dp = ImageDraw.Draw(im_p)
    for d in page.get_drawings():
        cor = d.get("fill")
        # parede na prancha = preenchimento escuro e pequeno (hachura); áreas brancas e grandes não contam
        if cor is None or sum(cor) / 3 > 0.85 or d["rect"].width * d["rect"].height > (pt_por_m * 3) ** 2:
            continue
        pts = []
        for it in d["items"]:
            if it[0] == "l":
                pts += [it[1], it[2]]
            elif it[0] == "c":
                pts += [it[1], it[4]]
            elif it[0] == "re":
                r = it[1]
                pts += [r.tl, r.tr, r.br, r.bl]
            elif it[0] == "qu":
                q = it[1]
                pts += [q.ul, q.ur, q.lr, q.ll]
        if len(pts) >= 3:
            dp.polygon([((p * M).x * k, (p * M).y * k) for p in pts], fill=255)
    a = np.asarray(im_p, dtype=np.float32) / 255
    x0, y0, x1, y1 = paredes.bounds
    im_m = Image.new("L", (int((x1 - x0) / RESOLUCAO_M) + 1, int((y1 - y0) / RESOLUCAO_M) + 1), 0)
    dm = ImageDraw.Draw(im_m)
    for g in getattr(paredes, "geoms", [paredes]):
        dm.polygon([((x - x0) / RESOLUCAO_M, (y1 - y) / RESOLUCAO_M) for x, y in g.exterior.coords], fill=255)
        for furo in g.interiors:
            dm.polygon([((x - x0) / RESOLUCAO_M, (y1 - y) / RESOLUCAO_M) for x, y in furo.coords], fill=0)
    b = np.asarray(im_m, dtype=np.float32) / 255
    if not b.sum() or not a.sum():
        raise ErroAmbientes("não achei paredes para casar o modelo com a prancha (prancha sem hachura de parede?)")
    forma = (a.shape[0] + b.shape[0], a.shape[1] + b.shape[1])
    c = np.fft.irfft2(np.fft.rfft2(a, forma) * np.fft.rfft2(b[::-1, ::-1], forma), forma)
    iy, ix = np.unravel_index(np.argmax(c), c.shape)
    oy, ox = iy - (b.shape[0] - 1), ix - (b.shape[1] - 1)
    return {"pt_por_m": pt_por_m, "x0": x0, "y1": y1, "dx_pt": ox / k, "dy_pt": oy / k, "coincidencia": float(c[iy, ix] / b.sum())}


def rotulos_de_apartamento(page, re_apto=RE_APTO) -> list[tuple[str, str, float, float]]:
    """[(número, tipo, x, y)] em pontos da prancha (centro do rótulo "303(TIPO C1)")."""
    M = page.rotation_matrix
    saida = []
    for bloco in page.get_text("dict")["blocks"]:
        for linha in bloco.get("lines", []):
            texto = "".join(s["text"] for s in linha["spans"]).strip()
            m = re_apto.match(texto)
            if m:
                x0, y0, x1, y1 = linha["bbox"]
                import pymupdf as fitz
                c = fitz.Point((x0 + x1) / 2, (y0 + y1) / 2) * M
                saida.append((m.group(1), m.group(2), c.x, c.y))
    return saida


def ler_planta(cfg: dict) -> dict:
    """Planta de ambientes no mesmo formato de estrutura.ler_forma (para publicar_planta.montar_trecho)."""
    import pymupdf as fitz
    from shapely import wkt
    from shapely.geometry import Point

    import gerador_fvs as legado
    from estrutura import nome_da_prancha, revisao_da_prancha

    for campo in ("ifc", "andar", "prancha"):
        if not cfg.get(campo):
            raise ErroAmbientes(f"falta \"{campo}\" em \"ambientes\" no pavimento.json")
    escala = float(cfg.get("escala") or 200)
    dados = do_ifc_com_guarda(cfg["ifc"], str(cfg["andar"]))
    paredes = wkt.loads(dados["paredes"])
    ambientes = [wkt.loads(a) for a in dados["ambientes"]]
    portas = [(p["nome"], wkt.loads(p["wkt"])) for p in dados["portas"]]
    page = fitz.open(cfg["prancha"])[0]
    t = casar_com_a_prancha(page, paredes, escala)
    if t["coincidencia"] < 0.2:
        raise ErroAmbientes(f"o modelo não casou com a prancha (coincidência {t['coincidencia']:.0%}). Confira a escala ({escala:.0f}) e o andar.")

    def para_prancha(x, y):
        return [round((x - t["x0"]) * t["pt_por_m"] + t["dx_pt"], 2), round((t["y1"] - y) * t["pt_por_m"] + t["dy_pt"], 2)]

    def para_modelo(px, py):
        return ((px - t["dx_pt"]) / t["pt_por_m"] + t["x0"], t["y1"] - (py - t["dy_pt"]) / t["pt_por_m"])

    rotulos = [(n, tp, Point(*para_modelo(x, y))) for n, tp, x, y in rotulos_de_apartamento(page)]
    aptos = agrupar_por_apartamento(ambientes, portas, rotulos, tuple(cfg.get("portas_de_entrada") or ("PM90", "PCF*")))
    nomeados = nomear(ambientes, aptos)
    comodos, resumo_nomes = ({}, None)
    if cfg.get("nomes"):
        comodos, resumo_nomes = nomes_dos_comodos(nomeados, aptos, ler_tabela_de_nomes(cfg["nomes"]), ambientes)
    pecas = []
    for a in nomeados:
        g = ambientes[a["indice"]]
        cx, cy = para_prancha(*g.representative_point().coords[0])
        peca = {
            "tipo": "A", "nome": a["nome"], "secao": area_br(a["area"]), "grupo": a["grupo"],
            "rotulo": [cx - 14, cy - 5, cx + 14, cy + 5],
            "polys": [[para_prancha(x, y) for x, y in g.exterior.coords[:-1]]],
        }
        # o nome do cômodo é só texto: o id continua saindo de "303-05", e trocar a tabela não mexe nas marcações
        if a["nome"] in comodos:
            peca["comodo"] = comodos[a["nome"]]
        pecas.append(peca)
    rel_esquadrias = None
    if cfg.get("esquadrias"):
        # portas e janelas do mesmo IFC viram locais "E" dentro dos ambientes (esquadrias.py)
        import esquadrias as mod_esq

        lista = [{"nome": nome, "pts": [para_prancha(x, y) for x, y in g.exterior.coords[:-1]]} for nome, g in portas]
        locais, rel_esquadrias = mod_esq.distribuir_esquadrias(lista, pecas, t["pt_por_m"])
        pecas.extend(locais)
    dets_a, rel_modulacao = {}, None
    if cfg.get("modulacao"):
        # planta de 1ª fiada de cada setor: o recorte do apartamento vira o detalhe do ambiente (modulacao.py)
        import modulacao as mod_mod

        geometrias = {a["nome"]: ambientes[a["indice"]] for a in nomeados}
        grupos = {a["nome"]: a["grupo"] for a in nomeados}
        try:
            dets_a, rel_modulacao = mod_mod.ler_modulacao(cfg["modulacao"], paredes, geometrias, grupos, casar_com_a_prancha)
        except mod_mod.ErroModulacao as e:
            raise ErroAmbientes(f"modulação: {e}") from e
    prancha = nome_da_prancha(cfg["prancha"])
    import base64
    return {
        "trecho": cfg.get("trecho") or "Ambientes", "disciplina": "arquitetura",
        "prancha": prancha, "revisao": revisao_da_prancha(prancha),
        "largura": page.rect.width, "altura": page.rect.height, "tile": legado.TILE, "niveis": list(legado.NIVEIS),
        "tiles": {k: base64.b64decode(v) for k, v in legado.tiles_da_forma(page).items()},
        "pecas": pecas,
        "detalhes_a": dets_a,
        "resumo": {"ambientes": len(ambientes), "apartamentos": {n: len(a["ambientes"]) for n, a in sorted(aptos.items())},
                   "area_comum": sum(1 for p in pecas if p["grupo"] == "Área comum"), "coincidencia": round(t["coincidencia"], 2),
                   "tipos": {n: a["tipo"] for n, a in sorted(aptos.items())},
                   "modelo_de_nomes": modelo_da_tabela(nomeados, aptos, ambientes, ler_tabela_de_nomes(cfg["nomes"]) if cfg.get("nomes") else None),
                   **({"nomes": resumo_nomes} if resumo_nomes else {}),
                   **({"esquadrias": rel_esquadrias} if rel_esquadrias else {}),
                   **({"modulacao": rel_modulacao} if rel_modulacao else {})},
    }
