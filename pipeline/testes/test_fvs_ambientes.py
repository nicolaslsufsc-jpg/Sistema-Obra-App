"""Planta de ambientes da FVS: o que não depende do IFC nem do PDF (pipeline/fvs/ambientes.py),
mais o que muda no pacote, no publicador, nas fichas e na bancada para aceitar ambiente (tipo A)."""

from __future__ import annotations

import json
import pathlib
import sys
import tempfile
import unittest

RAIZ = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "pipeline" / "fvs"))
sys.path.insert(0, str(RAIZ / "pipeline"))

import ambientes  # noqa: E402
import bancada  # noqa: E402
import pacote  # noqa: E402
import publicar_fichas  # noqa: E402
import publicar_planta  # noqa: E402

try:
    from shapely.geometry import Point, box
except ImportError:  # sem shapely só a parte geométrica é pulada
    box = None

CAB = {"planta_id": "p1", "obra": "TESTE", "pavimento": "3º", "trecho": "Ambientes", "prancha": "X.AR.EX.036.3PAV-R03",
       "revisao": "R03", "largura": 1000, "altura": 800, "tile": 512, "niveis": [0]}


class TestPortas(unittest.TestCase):
    def test_porta_de_entrada(self):
        self.assertTrue(ambientes.e_porta_de_entrada("PM90"))
        self.assertTrue(ambientes.e_porta_de_entrada("PCF80A"))
        self.assertFalse(ambientes.e_porta_de_entrada("PM90B"))  # interna, apesar do nome parecido
        self.assertFalse(ambientes.e_porta_de_entrada("PM80"))
        self.assertTrue(ambientes.e_porta_de_entrada("PE100", entradas=("PE*",)))

    def test_area(self):
        self.assertEqual(ambientes.area_br(12.06), "12,1 m²")

    def test_area_comum_com_esquadrias(self):
        # 20/11: com "esquadrias": true, os locais "E" (sem grupo) entram nas peças; o resumo não pode quebrar
        pecas = [{"tipo": "A", "nome": "101-01", "grupo": "Apto 101"}, {"tipo": "A", "nome": "AC-01", "grupo": "Área comum"},
                 {"tipo": "E", "nome": "AC-01-PM90", "ambiente": "AC-01"}]
        self.assertEqual(ambientes.area_comum(pecas), 1)


@unittest.skipIf(box is None, "precisa de shapely")
class TestApartamentos(unittest.TestCase):
    """Dois apartamentos de dois cômodos, um de cada lado de um corredor:

        y=6..10   [0] sala 301   [1] quarto 301   |   [4] sala 302   [5] quarto 302
        y=4..6    [2] corredor (área comum, a largura toda)
        y=0..4    [3] depósito (área comum)
    """

    def setUp(self):
        self.amb = [box(0, 6, 4, 10), box(4.2, 6, 8, 10), box(0, 4, 17, 5.8), box(0, 0, 4, 3.8), box(9, 6, 13, 10), box(13.2, 6, 17, 10)]
        self.portas = [
            ("PM80", box(4.0, 7, 4.2, 7.9)),      # sala 301 <-> quarto 301
            ("PM90", box(1, 5.8, 1.9, 6.0)),      # entrada do 301 (corredor <-> sala)
            ("PM80", box(13.0, 7, 13.2, 7.9)),    # sala 302 <-> quarto 302
            ("PCF90", box(10, 5.8, 10.9, 6.0)),   # entrada do 302
            ("PM80", box(1, 3.8, 1.9, 4.0)),      # corredor <-> depósito
            ("J120", box(8.0, 7, 8.2, 8.2)),      # janela entre os dois quartos: não liga ambiente
        ]
        self.rotulos = [("301", "A", Point(2, 8)), ("302", "B", Point(11, 8))]

    def test_agrupa_sem_atravessar_a_porta_de_entrada(self):
        aptos = ambientes.agrupar_por_apartamento(self.amb, self.portas, self.rotulos)
        self.assertEqual(aptos["301"], {"tipo": "A", "ambientes": [0, 1]})
        self.assertEqual(aptos["302"], {"tipo": "B", "ambientes": [4, 5]})

    def test_sem_porta_de_entrada_o_apartamento_engole_o_corredor(self):
        # é por isso que a porta de entrada precisa ser reconhecida pelo nome
        aptos = ambientes.agrupar_por_apartamento(self.amb, self.portas, self.rotulos, entradas=())
        self.assertIn(2, aptos["301"]["ambientes"])

    def test_ambiente_disputado_fica_com_o_primeiro(self):
        portas = self.portas + [("PM80", box(8.0, 9, 9.0, 9.5))]  # liga quarto 301 e sala 302
        aptos = ambientes.agrupar_por_apartamento(self.amb, portas, self.rotulos)
        self.assertEqual(aptos["301"]["ambientes"], [0, 1, 4, 5])
        self.assertEqual(aptos["302"]["ambientes"], [])

    def test_nomes_na_ordem_de_leitura(self):
        aptos = ambientes.agrupar_por_apartamento(self.amb, self.portas, self.rotulos)
        nomes = {n["indice"]: (n["nome"], n["grupo"]) for n in ambientes.nomear(self.amb, aptos)}
        self.assertEqual(nomes[0], ("301-01", "Apto 301"))
        self.assertEqual(nomes[1], ("301-02", "Apto 301"))
        self.assertEqual(nomes[4], ("302-01", "Apto 302"))
        self.assertEqual(nomes[2], ("AC-01", "Área comum"))   # corredor, mais acima
        self.assertEqual(nomes[3], ("AC-02", "Área comum"))   # depósito
        for nome, _ in nomes.values():
            self.assertNotIn(" ", nome)  # "elementos.nome" do núcleo não aceita espaço


    def test_nomes_pelo_numero_sem_a_forma(self):
        # tabela só com nomes (sem área e posição): vale o número da planta
        aptos = ambientes.agrupar_por_apartamento(self.amb, self.portas, self.rotulos)
        nomeados = ambientes.nomear(self.amb, aptos)
        tabela = ambientes.ler_tabela_de_nomes(str(RAIZ / "pipeline" / "fvs" / "ambientes_nomes.exemplo.json"))
        nomes, resumo = ambientes.nomes_dos_comodos(nomeados, aptos, tabela)
        self.assertEqual(nomes["302-01"], "Living / Cozinha")  # do tipo B
        self.assertEqual(nomes["302-02"], "Dormitório 01")      # o apartamento vence o tipo
        self.assertEqual(nomes["AC-02"], "Depósito")
        self.assertEqual(resumo["sem_nome"], {})

    def test_sem_nome_na_tabela_fica_so_o_numero(self):
        aptos = ambientes.agrupar_por_apartamento(self.amb, self.portas, self.rotulos)
        nomes, resumo = ambientes.nomes_dos_comodos(ambientes.nomear(self.amb, aptos), aptos, {"tipos": {"A": {"01": " Sala "}}})
        self.assertEqual(nomes, {"301-01": "Sala"})
        self.assertEqual(resumo["sem_nome"], {"301": 1, "302": 2, "AC": 2})

    def test_modelo_da_tabela_para_preencher(self):
        aptos = ambientes.agrupar_por_apartamento(self.amb, self.portas, self.rotulos)
        nomeados = ambientes.nomear(self.amb, aptos)
        m = ambientes.modelo_da_tabela(nomeados, aptos, self.amb, {"tipos": {"A": {"01": "Sala"}}})
        self.assertEqual(m["tipos"]["A"]["_base"], "301")
        self.assertEqual(m["tipos"]["A"]["01"], {"nome": "Sala", "area": 16.0, "pos": [-2.0, 0.0]})
        self.assertEqual(m["tipos"]["B"]["02"]["nome"], "")
        self.assertEqual(m["area_comum"], {"01": "", "02": ""})
        # o modelo preenchido é uma tabela válida
        with tempfile.TemporaryDirectory() as d:
            arq = pathlib.Path(d) / "n.json"
            arq.write_text(json.dumps(m), encoding="utf-8")
            self.assertEqual(ambientes.ler_tabela_de_nomes(str(arq))["tipos"]["A"]["01"]["nome"], "Sala")


@unittest.skipIf(box is None, "precisa de shapely")
class TestMesmoTipoGiradoOuEspelhado(unittest.TestCase):
    """Dois apartamentos do mesmo tipo, o segundo espelhado (como na torre): sala grande, quarto e banho.

        301 (base)                     302 (espelhado)
        [sala 0..6 x 0..4][quarto 6..9][banho 9..10.5]    [banho 20..21.5][quarto 21.5..24.5][sala 24.5..30.5]
    A numeração da planta (ordem de leitura) dá números diferentes ao mesmo cômodo; a forma acha o par."""

    def setUp(self):
        self.amb = [box(0, 0, 6, 4), box(6.2, 0, 9, 4), box(9.2, 0, 10.5, 4),
                    box(20, 0, 21.3, 4), box(21.5, 0, 24.3, 4), box(24.5, 0, 30.5, 4)]
        self.aptos = {"301": {"tipo": "A", "ambientes": [0, 1, 2]}, "302": {"tipo": "A", "ambientes": [3, 4, 5]}}
        self.nomeados = ambientes.nomear(self.amb, self.aptos)

    def test_o_numero_muda_mas_o_nome_acompanha_o_comodo(self):
        num = {n["indice"]: n["nome"] for n in self.nomeados}
        self.assertEqual((num[0], num[5]), ("301-01", "302-03"))  # a sala tem número diferente nos dois
        tabela = ambientes.modelo_da_tabela(self.nomeados, self.aptos, self.amb)
        for n, nome in (("01", "Sala"), ("02", "Quarto"), ("03", "Banho")):
            tabela["tipos"]["A"][n]["nome"] = nome
        nomes, resumo = ambientes.nomes_dos_comodos(self.nomeados, self.aptos, tabela, self.amb)
        self.assertEqual(nomes, {"301-01": "Sala", "301-02": "Quarto", "301-03": "Banho",
                                 "302-03": "Sala", "302-02": "Quarto", "302-01": "Banho"})
        self.assertEqual(resumo["do_tipo_sem_par"], [])
        # sem os polígonos não dá para casar pela forma: vale o número (e o 302 sairia errado)
        pelo_numero, _ = ambientes.nomes_dos_comodos(self.nomeados, self.aptos, tabela)
        self.assertEqual(pelo_numero["302-01"], "Sala")

    def test_comodo_diferente_do_tipo_fica_sem_nome(self):
        # no 302 o banho virou dois (lavabo + shaft): nenhum casa com o banho do tipo, e o resumo avisa
        amb = self.amb[:3] + [box(20, 0, 21.3, 1.9), box(20, 2.1, 21.3, 4), box(21.5, 0, 24.3, 4), box(24.5, 0, 30.5, 4)]
        aptos = {"301": {"tipo": "A", "ambientes": [0, 1, 2]}, "302": {"tipo": "A", "ambientes": [3, 4, 5, 6]}}
        nomeados = ambientes.nomear(amb, aptos)
        tabela = ambientes.modelo_da_tabela(nomeados, aptos, amb)
        for n, nome in (("01", "Sala"), ("02", "Quarto"), ("03", "Banho")):
            tabela["tipos"]["A"][n]["nome"] = nome
        nomes, resumo = ambientes.nomes_dos_comodos(nomeados, aptos, tabela, amb)
        do302 = sorted(v for k, v in nomes.items() if k.startswith("302"))
        self.assertEqual(do302, ["Quarto", "Sala"])
        self.assertEqual(resumo["sem_nome"], {"302": 2})
        self.assertEqual(resumo["do_tipo_sem_par"], ["302 (tipo A, 03)"])

    def test_casar_em_qualquer_giro(self):
        modelo = {"01": (24.0, (-2.0, 0.0)), "02": (11.0, (2.5, 0.0)), "03": (5.0, (4.5, 1.0))}
        for k in range(4):
            girado = {n: (a, ambientes._girar(x, y, k)) for n, (a, (x, y)) in modelo.items()}
            self.assertEqual(ambientes.casar_com_o_tipo(girado, modelo), {"01": "01", "02": "02", "03": "03"})


    def test_casar_com_comodos_a_mais_no_modelo(self):
        # o modelo do tipo tem três cômodos a mais de um lado (como o 320 base do J, com a suíte grande,
        # o banho dela e a sacada): o centro do apartamento muda uns 2 m e sem âncora nada casaria
        cheio = {"01": (114.0, (0.0, 0.0)), "02": (13.4, (8.0, 3.0)), "03": (13.4, (8.0, -1.0)), "04": (3.7, (10.5, 3.0)),
                 "05": (9.7, (-6.0, 4.0)), "06": (37.0, (-12.0, 0.0)), "07": (5.6, (-12.0, 5.0)), "08": (14.6, (-12.0, -5.0))}
        def centrar(d):
            t = sum(a for a, _ in d.values())
            cx, cy = sum(a * p[0] for a, p in d.values()) / t, sum(a * p[1] for a, p in d.values()) / t
            return {n: (a, (p[0] - cx, p[1] - cy)) for n, (a, p) in d.items()}
        modelo = centrar(cheio)
        menor = centrar({n: c for n, c in cheio.items() if n not in ("06", "07", "08")})
        girado = {n: (a, ambientes._girar(-x, y, 1)) for n, (a, (x, y)) in menor.items()}  # espelhado e girado
        self.assertEqual(ambientes.casar_com_o_tipo(girado, modelo), {n: n for n in ("01", "02", "03", "04", "05")})


class TestCorrecaoPorPosicaoNoAndar(unittest.TestCase):
    """Sem shapely, numpy nem scipy (como no GitHub): a tabela pelo número da planta."""

    nomeados = [{"nome": f"{a}-{n}", "indice": i} for i, (a, n) in enumerate(
        [("304", "01"), ("304", "02"), ("404", "01"), ("404", "02"), ("405", "01")])]
    aptos = {"304": {"tipo": "C1"}, "404": {"tipo": "C1"}, "405": {"tipo": "C1"}}

    def test_posicao_no_andar(self):
        self.assertEqual([ambientes.posicao_no_andar(a) for a in ("304", "1204", "AC", "30")], ["x04", "x04", "AC", "30"])

    def test_x04_vale_em_todo_andar_e_o_numero_vence(self):
        tabela = {"tipos": {"C1": {"01": "Living", "02": "Suíte 01"}},
                  "aptos": {"x04": {"02": "Suíte 04"}, "404": {"01": "Living / Cozinha"}}}
        nomes, _ = ambientes.nomes_dos_comodos(self.nomeados, self.aptos, tabela)
        self.assertEqual(nomes, {"304-01": "Living", "304-02": "Suíte 04", "404-01": "Living / Cozinha",
                                 "404-02": "Suíte 04", "405-01": "Living"})


class TestTabelaDeNomes(unittest.TestCase):
    def test_recusa_tabela_errada(self):
        with tempfile.TemporaryDirectory() as d:
            arq = pathlib.Path(d) / "nomes.json"
            for ruim in ('{"tipos": {"A": ["Sala"]}}', '{"tipos": {"A": {"01": 3}}}', '{"tipos": {"A": {"01": {"nome": "S", "pos": [1]}}}}',
                         '{"area_comum": {"01": 3}}', '{"aptos": {"301": {"01": {}}}}', "[1]", "nao e json"):
                arq.write_text(ruim, encoding="utf-8")
                with self.assertRaises(ambientes.ErroAmbientes):
                    ambientes.ler_tabela_de_nomes(str(arq))

    def test_anotacoes_de_quem_preencheu_nao_atrapalham(self):
        with tempfile.TemporaryDirectory() as d:
            arq = pathlib.Path(d) / "nomes.json"
            arq.write_text(json.dumps({"_leia": "x", "_conferir_aptos": ["a"], "tipos": {"A": {"_base": "301", "_conferir": ["01 Sala"],
                           "_notas": ["n"], "01": {"nome": "Sala", "area": 16.0, "pos": [0, 0]}}}}), encoding="utf-8")
            t = ambientes.ler_tabela_de_nomes(str(arq))
            aptos = {"301": {"tipo": "A", "ambientes": [0]}}
            nomes, _ = ambientes.nomes_dos_comodos([{"indice": 0, "nome": "301-01", "grupo": "Apto 301", "area": 16.0}], aptos, t)
            self.assertEqual(nomes, {"301-01": "Sala"})

    def test_exemplo_sem_nome_de_obra_real(self):
        texto = (RAIZ / "pipeline" / "fvs" / "ambientes_nomes.exemplo.json").read_text(encoding="utf-8")
        self.assertIn("EXE", texto)


class TestPacoteComAmbiente(unittest.TestCase):
    def test_ambiente_leva_o_apartamento_e_nao_tem_detalhe(self):
        el = {"a1": {"tipo": "A", "nome": "303-01", "secao": "12,1 m²", "grupo": "Apto 303", "rotulo": [0, 0, 1, 1],
                     "polys": [[[0, 0], [1, 0], [1, 1]]]}}
        m, _ = pacote.ler(*pacote.montar(CAB, {"0/0/0": b"T"}, el, {}))
        self.assertEqual(m["elementos"]["a1"]["grupo"], "Apto 303")
        self.assertEqual(m["elementos"]["a1"]["tipo"], "A")
        self.assertNotIn("detalhe", m["elementos"]["a1"])

    def test_comodo_vai_no_pacote_e_so_em_ambiente(self):
        el = {"a1": {"tipo": "A", "nome": "303-01", "secao": "12,1 m²", "grupo": "Apto 303", "comodo": "Living", "rotulo": [0, 0, 1, 1],
                     "polys": [[[0, 0], [1, 0], [1, 1]]]},
              "a2": {"tipo": "A", "nome": "303-02", "secao": "3,0 m²", "grupo": "Apto 303", "rotulo": [0, 0, 1, 1], "polys": []}}
        m, _ = pacote.ler(*pacote.montar(CAB, {"0/0/0": b"T"}, el, {}))
        self.assertEqual(m["elementos"]["a1"]["comodo"], "Living")
        self.assertEqual(m["elementos"]["a1"]["nome"], "303-01")  # o id e o nome continuam o número
        self.assertNotIn("comodo", m["elementos"]["a2"])
        with self.assertRaises(pacote.ErroPacote):
            pacote.montar(CAB, {"0/0/0": b"T"}, {"p1": {"tipo": "P", "nome": "P1", "secao": "", "comodo": "Sala", "rotulo": [0, 0, 1, 1], "polys": []}}, {})

    def test_montar_trecho_de_ambientes(self):
        forma = {"prancha": "X.AR.EX.036.3PAV-R03", "revisao": "R03", "largura": 100, "altura": 50, "tile": 512, "niveis": [0],
                 "tiles": {"0/0/0": b"T"}, "disciplina": "arquitetura",
                 "pecas": [{"tipo": "A", "nome": "303-01", "secao": "12,1 m²", "grupo": "Apto 303", "comodo": "Living", "rotulo": [0, 0, 1, 1],
                            "polys": [[[0, 0], [1, 0], [1, 1]]]}]}
        man, binario, rel = publicar_planta.montar_trecho(forma, {"P": {}, "V": {}}, {("A", "303-01"): "id-a"},
                                                          {"planta_id": "p", "trecho": "Ambientes"})
        m, _ = pacote.ler(man, binario)
        self.assertEqual(m["elementos"]["id-a"]["grupo"], "Apto 303")
        self.assertEqual(m["elementos"]["id-a"]["comodo"], "Living")
        self.assertEqual(rel["disciplina"], "arquitetura")
        self.assertEqual(rel["sem_detalhe"], [])  # ambiente não tem prancha de detalhe: não é falta
        self.assertEqual((rel["elementos"], rel["pilares"], rel["vigas"]), (1, 0, 0))

    def test_config_so_de_ambientes(self):
        with tempfile.TemporaryDirectory() as d:
            base = pathlib.Path(d)
            for nome in ("modelo.ifc", "planta.pdf"):
                (base / nome).write_bytes(b"x")
            cfg = {"obra": "exe", "pavimento": "3º Pavimento", "ambientes": {"ifc": "modelo.ifc", "andar": "3", "prancha": "planta.pdf"}}
            (base / "pav.json").write_text(json.dumps(cfg), encoding="utf-8")
            lido = publicar_planta.ler_config(base / "pav.json")
            self.assertEqual(lido["formas"], [])
            self.assertEqual(pathlib.Path(lido["ambientes"]["ifc"]).name, "modelo.ifc")
            self.assertEqual(lido["ambientes"]["andar"], "3")
            self.assertNotIn("nomes", lido["ambientes"])
            (base / "nomes.json").write_text("{}", encoding="utf-8")
            cfg["ambientes"]["nomes"] = "nomes.json"
            (base / "pav.json").write_text(json.dumps(cfg), encoding="utf-8")
            self.assertEqual(pathlib.Path(publicar_planta.ler_config(base / "pav.json")["ambientes"]["nomes"]).name, "nomes.json")
            cfg["ambientes"]["prancha"] = "nao_existe_*.pdf"
            (base / "pav.json").write_text(json.dumps(cfg), encoding="utf-8")
            with self.assertRaises(publicar_planta.ErroPublicacao):
                publicar_planta.ler_config(base / "pav.json")
            (base / "pav.json").write_text(json.dumps({"obra": "exe", "pavimento": "3º"}), encoding="utf-8")
            with self.assertRaises(publicar_planta.ErroPublicacao):
                publicar_planta.ler_config(base / "pav.json")

    def test_config_de_ambientes_da_prancha_sem_ifc(self):
        # 25/11: "fonte": "pdf" (mezanino, térreo, pilotis): não pede IFC, e a tabela ficha × cômodo vale
        # sem a tabela de nomes (os nomes saem da própria prancha)
        with tempfile.TemporaryDirectory() as d:
            base = pathlib.Path(d)
            (base / "planta.pdf").write_bytes(b"x")
            (base / "fichas.json").write_text("{}", encoding="utf-8")
            cfg = {"obra": "exe", "pavimento": "Mezanino",
                   "ambientes": {"fonte": "pdf", "prancha": "planta.pdf", "escala": 200, "fichas_por_comodo": "fichas.json"}}
            (base / "pav.json").write_text(json.dumps(cfg), encoding="utf-8")
            lido = publicar_planta.ler_config(base / "pav.json")
            self.assertEqual(pathlib.Path(lido["ambientes"]["prancha"]).name, "planta.pdf")
            self.assertNotIn("ifc", lido["ambientes"])
            self.assertEqual(pathlib.Path(lido["ambientes"]["fichas_por_comodo"]).name, "fichas.json")
            # do IFC, a tabela ficha × cômodo continua pedindo os nomes
            cfg["ambientes"] = {"ifc": "planta.pdf", "andar": "3", "prancha": "planta.pdf", "fichas_por_comodo": "fichas.json"}
            (base / "pav.json").write_text(json.dumps(cfg), encoding="utf-8")
            with self.assertRaises(publicar_planta.ErroPublicacao):
                publicar_planta.ler_config(base / "pav.json")


class TestFichasDeAmbiente(unittest.TestCase):
    ITENS = [{"n": 1, "etapa": "MARCAÇÃO", "titulo": "Primeira fiada"}]

    def test_aplica_a_padrao_so_para_quem_nao_diz(self):
        fichas = publicar_fichas.normalizar([
            {"codigo": "X-013", "titulo": "Alvenaria", "itens": self.ITENS},
            {"codigo": "X-012", "titulo": "Pilares", "aplica_a": ["P"], "itens": self.ITENS},
        ], ["A"])
        self.assertEqual([f["aplica_a"] for f in fichas], [["A"], ["P"]])

    def test_recusa_tipo_desconhecido(self):
        with self.assertRaises(publicar_fichas.ErroFichas):
            publicar_fichas.normalizar([{"codigo": "X", "titulo": "Y", "aplica_a": ["Z"], "itens": self.ITENS}])


class TestBancada(unittest.TestCase):
    def test_junta_estrutura_e_ambientes_do_mesmo_pavimento(self):
        arq = {"sha256": "0" * 64, "tamanho": 1}

        def trecho(pid, nome, **extra):
            return {"planta_id": pid, "trecho": nome, "pasta": nome.replace(" ", "_"), "prancha": "X", "revisao": "R00",
                    "largura": 10, "altura": 10, "elementos": 1, "manifest": arq, "pacote": arq, **extra}

        with tempfile.TemporaryDirectory() as d:
            base = pathlib.Path(d)
            for sub, rel in (
                ("06_3_pavimento", {"obra": "EXE", "pavimento": "3º Pavimento", "pecas": [{"id": "p1", "tipo": "P", "nome": "P1", "secao": ""}],
                                    "trechos": [trecho("t1", "Trecho 1")]}),
                ("06_3_pavimento_ambientes", {"obra": "EXE", "pavimento": "3º Pavimento",
                                              "pecas": [{"id": "a1", "tipo": "A", "nome": "303-01", "secao": "12,1 m²"}],
                                              "trechos": [trecho("ta", "Ambientes", disciplina="arquitetura")]}),
                ("07_4_pavimento", {"obra": "EXE", "pavimento": "4º Pavimento", "pecas": [], "trechos": [trecho("t4", "Trecho 1")]}),
            ):
                (base / sub).mkdir()
                (base / sub / "relatorio.json").write_text(json.dumps(rel), encoding="utf-8")
            (base / "sem_relatorio").mkdir()
            indice = bancada.montar_indice(base)
        self.assertEqual([p["nome"] for p in indice["pavimentos"]], ["3º Pavimento", "4º Pavimento"])
        terceiro = indice["pavimentos"][0]
        self.assertEqual([p["id"] for p in terceiro["pecas"]], ["p1", "a1"])
        self.assertEqual([(p["trecho"], p["disciplina"], p["pasta"]) for p in terceiro["plantas"]],
                         [("Trecho 1", "estrutura", "06_3_pavimento/Trecho_1/"), ("Ambientes", "arquitetura", "06_3_pavimento_ambientes/Ambientes/")])


if __name__ == "__main__":
    unittest.main()
