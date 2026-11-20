"""Esquadrias nos ambientes (pipeline/fvs/esquadrias.py) e a esquadria no pacote (publicar_planta e pacote).
Dados fictícios da obra EXE, sem IFC e sem bibliotecas (roda no GitHub como está)."""

from __future__ import annotations

import pathlib
import sys
import unittest

RAIZ = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "pipeline" / "fvs"))

import esquadrias  # noqa: E402
import pacote  # noqa: E402
import publicar_planta  # noqa: E402

# 10 pontos da folha por metro de obra (como uma prancha 1:~28; só para o teste)
PT_POR_M = 10.0


def quad(x0, y0, x1, y1):
    return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]


def ambiente(nome, x0, y0, x1, y1, grupo="Apto 101"):
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    return {"tipo": "A", "nome": nome, "secao": "9,0 m²", "grupo": grupo, "rotulo": [cx - 5, cy - 2, cx + 5, cy + 2], "polys": [quad(x0, y0, x1, y1)]}


def planta():
    """Dois quartos lado a lado (parede de 0,15 m entre eles, em x = 30 a 31,5) e a sala embaixo
    (parede em y = 30 a 31,5). Fora do prédio (y < 0) não há ambiente."""
    return [
        ambiente("101-01", 0, 0, 30, 30),
        ambiente("101-02", 31.5, 0, 61.5, 30),
        ambiente("101-03", 0, 31.5, 61.5, 60),
    ]


def porta_vertical(nome, x, y):
    """Porta na parede vertical (x = 30 a 31,5): folha de 0,8 m de largura e 0,05 m de espessura no meio da parede."""
    return {"nome": nome, "pts": quad(x - 0.25, y, x + 0.25, y + 8)}


def porta_horizontal(nome, x, y):
    return {"nome": nome, "pts": quad(x, y - 0.25, x + 8, y + 0.25)}


class TestCodigo(unittest.TestCase):
    def test_codigo_e_classe(self):
        self.assertEqual(esquadrias.codigo_da_esquadria("JA120B VVP"), "JA120B")
        self.assertEqual(esquadrias.codigo_da_esquadria(" pm80 "), "PM80")
        self.assertEqual(esquadrias.codigo_da_esquadria(""), "")
        self.assertEqual(esquadrias.classe_da_esquadria("JA120B"), "janela")
        self.assertEqual(esquadrias.classe_da_esquadria("J81"), "janela")
        self.assertEqual(esquadrias.classe_da_esquadria("PA260"), "porta")
        self.assertEqual(esquadrias.classe_da_esquadria("PCF80A"), "porta")

    def test_eixos_do_retangulo_girado(self):
        # retângulo de 2 x 0,1 girado 90 graus, com o canto de fechamento repetido no fim
        (cx, cy), (nx, ny), meia, meio = esquadrias.eixos_do_retangulo([[0, 0], [0, 2], [0.1, 2], [0.1, 0], [0, 0]])
        self.assertAlmostEqual(cx, 0.05)
        self.assertAlmostEqual(cy, 1.0)
        self.assertAlmostEqual(abs(nx), 1.0)
        self.assertAlmostEqual(ny, 0.0)
        self.assertAlmostEqual(meia, 0.05)
        self.assertAlmostEqual(meio, 1.0)


class TestDistribuir(unittest.TestCase):
    def test_porta_entre_dois_comodos_aparece_nos_dois(self):
        locais, rel = esquadrias.distribuir_esquadrias([porta_vertical("PM80", 30.75, 10)], planta(), PT_POR_M)
        self.assertEqual(sorted(l["nome"] for l in locais), ["101-01-PM80", "101-02-PM80"])
        por_nome = {l["nome"]: l for l in locais}
        self.assertEqual(por_nome["101-01-PM80"]["ambiente"], "101-01")
        self.assertEqual(por_nome["101-01-PM80"]["esquadria"], {"codigo": "PM80", "classe": "porta", "outro_lado": "101-02"})
        self.assertEqual(por_nome["101-02-PM80"]["esquadria"]["outro_lado"], "101-01")
        # cada um fica do seu lado da parede (o toque de um não cai no outro)
        x1 = sum(por_nome["101-01-PM80"]["rotulo"][::2]) / 2
        x2 = sum(por_nome["101-02-PM80"]["rotulo"][::2]) / 2
        self.assertLess(x1, 30)
        self.assertGreater(x2, 31.5)
        self.assertEqual((rel["esquadrias"], rel["em_ambiente"], rel["em_dois_ambientes"], rel["locais"]), (1, 1, 1, 2))

    def test_janela_fica_so_do_lado_de_dentro(self):
        # janela na fachada (y = 0): do lado de fora não há ambiente
        locais, rel = esquadrias.distribuir_esquadrias([porta_horizontal("JA120B VVP", 5, 0)], planta(), PT_POR_M)
        self.assertEqual([l["nome"] for l in locais], ["101-01-JA120B"])
        self.assertEqual(locais[0]["esquadria"], {"codigo": "JA120B", "classe": "janela", "modelo": "JA120B VVP"})
        self.assertEqual(rel["em_dois_ambientes"], 0)

    def test_parede_grossa_pelo_afastamento_maior(self):
        # parede de 0,8 m (8 pontos) entre os ambientes: o primeiro passo (0,15 m) não chega; o de 0,5 m chega
        amb = [ambiente("101-01", 0, 0, 30, 30), ambiente("101-02", 38, 0, 68, 30)]
        locais, _ = esquadrias.distribuir_esquadrias([{"nome": "PM90", "pts": quad(33.75, 10, 34.25, 18)}], amb, PT_POR_M)
        self.assertEqual(sorted(l["ambiente"] for l in locais), ["101-01", "101-02"])

    def test_sem_ambiente_vai_para_o_relatorio(self):
        locais, rel = esquadrias.distribuir_esquadrias([porta_horizontal("PM80", 200, 200), {"nome": "", "pts": quad(1, 1, 2, 2)}], planta(), PT_POR_M)
        self.assertEqual(locais, [])
        self.assertEqual(rel["em_ambiente"], 0)
        self.assertEqual([s["nome"] for s in rel["sem_ambiente"]], ["PM80"])

    def test_repetidas_no_mesmo_ambiente_sao_numeradas(self):
        # duas PM70 na parede de baixo do 101-01 (para a sala) e uma PM80 na parede do lado
        lista = [porta_horizontal("PM70", 20, 30.75), porta_horizontal("PM70", 2, 30.75), porta_vertical("PM80", 30.75, 10)]
        locais, _ = esquadrias.distribuir_esquadrias(lista, planta(), PT_POR_M)
        nomes = sorted(l["nome"] for l in locais if l["ambiente"] == "101-01")
        self.assertEqual(nomes, ["101-01-PM70-1", "101-01-PM70-2", "101-01-PM80"])
        # numeradas na ordem de leitura: a da esquerda é a 1
        p1 = next(l for l in locais if l["nome"] == "101-01-PM70-1")
        self.assertLess(p1["rotulo"][0], 10)
        self.assertEqual(len({l["nome"] for l in locais}), len(locais))  # nome único na planta

    def test_juntar_troca_as_antigas(self):
        pl = {"pecas": planta() + [{"tipo": "E", "nome": "velha", "ambiente": "101-01"}]}
        rel = esquadrias.juntar_esquadrias(pl, [porta_vertical("PM80", 30.75, 10)], PT_POR_M)
        self.assertEqual(rel["locais"], 2)
        self.assertNotIn("velha", [p["nome"] for p in pl["pecas"]])
        self.assertEqual(sum(1 for p in pl["pecas"] if p["tipo"] == "A"), 3)


class TestNoPacote(unittest.TestCase):
    CAB = {"planta_id": "p", "trecho": "Ambientes", "prancha": "EXE.AR.EX.003-R00", "revisao": "R00", "largura": 100, "altura": 100, "tile": 512, "niveis": [0]}

    def test_montar_trecho_com_esquadrias(self):
        pecas = planta()
        locais, _ = esquadrias.distribuir_esquadrias([porta_vertical("PM80", 30.75, 10)], pecas, PT_POR_M)
        fm = {"prancha": "EXE.AR.EX.003-R00", "revisao": "R00", "largura": 100, "altura": 100, "tile": 512, "niveis": [0],
              "tiles": {"0/0/0": b"T"}, "trecho": "Ambientes", "disciplina": "arquitetura", "pecas": pecas + locais}
        ids = {(p["tipo"], p["nome"]): f"id-{p['nome']}" for p in fm["pecas"]}
        man, binario, rel = publicar_planta.montar_trecho(fm, {}, ids, {"planta_id": "p", "trecho": "Ambientes"})
        m, _ = pacote.ler(man, binario)
        e = m["elementos"]["id-101-01-PM80"]
        self.assertEqual((e["tipo"], e["nome"], e["secao"], e["ambiente"]), ("E", "101-01-PM80", "PM80", "id-101-01"))
        self.assertEqual(e["esquadria"], {"codigo": "PM80", "classe": "porta", "outro_lado": "101-02"})
        self.assertEqual(rel["esquadrias"], 2)
        self.assertEqual(rel["sem_detalhe"], [])  # esquadria não tem prancha de detalhe

    def test_pacote_recusa_esquadria_sem_ambiente(self):
        a = ambiente("101-01", 0, 0, 10, 10)
        e = {"tipo": "E", "nome": "101-01-PM80", "secao": "PM80", "rotulo": [0, 0, 1, 1], "polys": [], "ambiente": "a",
             "esquadria": {"codigo": "PM80", "classe": "porta"}}
        pacote.montar(self.CAB, {}, {"a": a, "e": e}, {})
        with self.assertRaises(pacote.ErroPacote):
            pacote.montar(self.CAB, {}, {"e": e}, {})  # o ambiente não está no pacote
        with self.assertRaises(pacote.ErroPacote):
            pacote.montar(self.CAB, {}, {"a": a, "e": {**e, "esquadria": {"classe": "porta"}}}, {})  # sem código
        with self.assertRaises(pacote.ErroPacote):
            pacote.montar(self.CAB, {}, {"a": a, "e": {**e, "esquadria": {"codigo": "X", "classe": "portao"}}}, {})
        with self.assertRaises(pacote.ErroPacote):
            pacote.montar(self.CAB, {}, {"a": {**a, "ambiente": "a"}}, {})  # só esquadria tem ambiente
        v = {"tipo": "V", "nome": "V1", "secao": "", "rotulo": [0, 0, 1, 1], "polys": []}
        with self.assertRaises(pacote.ErroPacote):
            pacote.montar(self.CAB, {}, {"v": v, "e": {**e, "ambiente": "v"}}, {})  # o pai tem que ser ambiente

    def test_campo_estranho_da_esquadria_nao_entra(self):
        a = ambiente("101-01", 0, 0, 10, 10)
        e = {"tipo": "E", "nome": "101-01-PM80", "secao": "PM80", "rotulo": [0, 0, 1, 1], "polys": [], "ambiente": "a",
             "esquadria": {"codigo": "PM80", "classe": "porta", "script": "<b>", "outro_lado": ""}}
        m, _ = pacote.ler(*pacote.montar(self.CAB, {}, {"a": a, "e": e}, {}))
        self.assertEqual(m["elementos"]["e"]["esquadria"], {"codigo": "PM80", "classe": "porta"})


class TestFichaDeAmbiente(unittest.TestCase):
    """Os itens de vão ou esquadria da ficha de ambiente ganham "esquadrias": true (pode ser mais de um)."""

    def ficha(self, itens, aplica_a=("A",)):
        return [{"codigo": "EXE-ALV", "titulo": "Alvenaria", "aplica_a": list(aplica_a), "itens": itens}]

    def test_aceita_mais_de_um_item(self):
        import publicar_fichas
        itens = [{"n": 1, "etapa": "MARCAÇÃO", "titulo": "Eixos e vãos", "esquadrias": True},
                 {"n": 2, "etapa": "ELEVAÇÃO", "titulo": "Vergas e contravergas", "esquadrias": True},
                 {"n": 3, "etapa": "ELEVAÇÃO", "titulo": "Prumo"}]
        f = publicar_fichas.normalizar(self.ficha(itens))[0]
        self.assertEqual([i["n"] for i in f["itens"] if i.get("esquadrias")], [1, 2])

    def test_recusa_marca_errada(self):
        import publicar_fichas
        item = {"n": 1, "etapa": "MARCAÇÃO", "titulo": "Eixos e vãos", "esquadrias": True}
        with self.assertRaises(publicar_fichas.ErroFichas):
            publicar_fichas.normalizar(self.ficha([item], ("V",)))
        with self.assertRaises(publicar_fichas.ErroFichas):
            publicar_fichas.normalizar(self.ficha([{**item, "esquadrias": "sim"}]))
        with self.assertRaises(publicar_fichas.ErroFichas):
            publicar_fichas.normalizar(self.ficha([{**item, "furos": True}]))


if __name__ == "__main__":
    unittest.main()
