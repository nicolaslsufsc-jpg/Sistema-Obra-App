"""Modulação nos ambientes (pipeline/fvs/modulacao.py): qual prancha de 1ª fiada mostra cada apartamento,
onde recortar e o detalhe do ambiente no pacote. Dados fictícios da obra EXE, sem PDF e sem bibliotecas."""

from __future__ import annotations

import pathlib
import sys
import unittest

RAIZ = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "pipeline" / "fvs"))

import modulacao  # noqa: E402
import pacote  # noqa: E402
import publicar_planta  # noqa: E402

# Duas pranchas de setor, 1000 x 700 pontos, 10 pontos por metro (só para o teste).
FOLHAS = {"EXE.VD.EX.024.TIPA-R00.pdf": (1000.0, 700.0), "EXE.VD.EX.025.TIPB-R00.pdf": (1000.0, 700.0)}
A, B = sorted(FOLHAS)
PT = {A: 10.0, B: 10.0}


def amb(nome, grupo, **caixas):
    return {"nome": nome, "grupo": grupo, "caixas": {FOLHA[k]: v for k, v in caixas.items()}}


FOLHA = {"a": A, "b": B}


class TestCaixas(unittest.TestCase):
    def test_caixa_junta_e_folga(self):
        self.assertEqual(modulacao.caixa_dos_pontos([[3, 4], [1, 9], [5, 2]]), (1, 2, 5, 9))
        self.assertEqual(modulacao.juntar_caixas([(0, 0, 1, 1), (5, -2, 6, 3)]), (0, -2, 6, 3))
        self.assertEqual(modulacao.folga_na_folha((10, 20, 900, 650), 1000, 700), 10)
        self.assertLess(modulacao.folga_na_folha((-5, 20, 100, 100), 1000, 700), 0)
        with self.assertRaises(modulacao.ErroModulacao):
            modulacao.caixa_dos_pontos([])

    def test_escolhe_a_prancha_em_que_cabe_mais_longe_da_borda(self):
        caixas = {A: (900, 100, 990, 200), B: (100, 100, 190, 200)}  # na A, quase na borda; na B, folgado
        self.assertEqual(modulacao.escolher_prancha(caixas, FOLHAS), B)
        # saindo da folha não vale
        self.assertEqual(modulacao.escolher_prancha({A: (950, 100, 1050, 200)}, FOLHAS), None)
        # prancha que não casou (sem folha) não vale
        self.assertEqual(modulacao.escolher_prancha({"outra.pdf": (10, 10, 20, 20)}, FOLHAS), None)

    def test_recorte_com_folga_sem_sair_da_folha(self):
        self.assertEqual(modulacao.recorte((10, 100, 200, 300), 1000, 700, 3.0), (7, 97, 203, 303))
        self.assertEqual(modulacao.recorte((1, 1, 999, 699), 1000, 700, 3.0), (0, 0, 1000, 700))

    def test_chave_segura(self):
        self.assertEqual(modulacao.chave_da_modulacao("Apto 303"), "M_Apto_303")
        self.assertEqual(modulacao.chave_da_modulacao("AC-01"), "M_AC-01")
        self.assertRegex(modulacao.chave_da_modulacao("Área comum/x"), pacote.CHAVE_SEGURA.pattern)


class TestPlano(unittest.TestCase):
    def test_um_recorte_por_apartamento(self):
        ambs = [
            amb("101-01", "Apto 101", a=(100, 100, 200, 200), b=(-500, 100, -400, 200)),
            amb("101-02", "Apto 101", a=(200, 100, 300, 250)),
            amb("102-01", "Apto 102", b=(600, 300, 700, 400)),
        ]
        recortes, de_cada, rel = modulacao.plano_da_modulacao(ambs, FOLHAS, PT, margem_m=0.3)
        self.assertEqual(de_cada, {"101-01": "M_Apto_101", "101-02": "M_Apto_101", "102-01": "M_Apto_102"})
        r = recortes["M_Apto_101"]
        # o apartamento inteiro (caixas juntas) mais 0,3 m (3 pontos) de folga
        self.assertEqual((r["prancha"], r["clip"], r["ambientes"]), (A, (97, 97, 303, 253), ["101-01", "101-02"]))
        self.assertEqual(recortes["M_Apto_102"]["prancha"], B)
        self.assertEqual(rel["recortes"], 2)
        self.assertEqual(rel["com_modulacao"], 3)
        self.assertEqual(rel["sem_modulacao"], [])
        self.assertEqual(rel["por_prancha"], {A: 1, B: 1})

    def test_apartamento_entre_dois_setores_vai_por_comodo(self):
        ambs = [
            amb("103-01", "Apto 103", a=(900, 100, 990, 200), b=(-90, 100, 0, 200)),
            amb("103-02", "Apto 103", a=(990, 100, 1080, 200), b=(5, 100, 80, 200)),
        ]
        recortes, de_cada, _ = modulacao.plano_da_modulacao(ambs, FOLHAS, PT)
        self.assertEqual(de_cada, {"103-01": "M_103-01", "103-02": "M_103-02"})
        self.assertEqual((recortes["M_103-01"]["prancha"], recortes["M_103-02"]["prancha"]), (A, B))

    def test_area_comum_e_sem_prancha(self):
        ambs = [
            amb("AC-01", "Área comum", a=(400, 400, 500, 500)),
            amb("AC-02", "Área comum", a=(510, 400, 560, 500)),
            amb("104-01", "Apto 104"),  # não casou em prancha nenhuma
        ]
        recortes, de_cada, rel = modulacao.plano_da_modulacao(ambs, FOLHAS, PT)
        self.assertEqual(de_cada, {"AC-01": "M_AC-01", "AC-02": "M_AC-02"})  # área comum: um recorte cada
        self.assertEqual(rel["sem_modulacao"], ["104-01"])

    def test_detalhes_no_formato_do_montar_trecho(self):
        ambs = [amb("101-01", "Apto 101", a=(100, 100, 200, 200)), amb("101-02", "Apto 101", a=(200, 100, 300, 200))]
        recortes, de_cada, _ = modulacao.plano_da_modulacao(ambs, FOLHAS, PT)
        dets = modulacao.detalhes_dos_ambientes(recortes, de_cada, {"M_Apto_101": b"IMG"}, lambda p: p[:-4])
        self.assertEqual(dets["101-01"], {"chave": "M_Apto_101", "titulo": "Modulação · Apto 101", "prancha": A[:-4], "img": b"IMG", "aco": None})
        self.assertIs(dets["101-01"]["img"], dets["101-02"]["img"])
        # recorte sem imagem (falhou ao desenhar) não entra
        self.assertEqual(modulacao.detalhes_dos_ambientes(recortes, de_cada, {}), {})

    def test_montar_trecho_ambientes_do_apto_dividem_uma_imagem(self):
        def a(nome, x0):
            return {"tipo": "A", "nome": nome, "secao": "9,0 m²", "grupo": "Apto 101", "rotulo": [x0, 0, x0 + 1, 1],
                    "polys": [[[x0, 0], [x0 + 5, 0], [x0 + 5, 5], [x0, 5]]]}

        fm = {"prancha": "EXE.AR.EX.003-R00", "revisao": "R00", "largura": 100, "altura": 100, "tile": 512, "niveis": [0],
              "tiles": {"0/0/0": b"T"}, "trecho": "Ambientes", "disciplina": "arquitetura", "pecas": [a("101-01", 0), a("101-02", 10)]}
        ambs = [amb("101-01", "Apto 101", a=(100, 100, 200, 200)), amb("101-02", "Apto 101", a=(200, 100, 300, 200))]
        recortes, de_cada, _ = modulacao.plano_da_modulacao(ambs, FOLHAS, PT)
        detalhes = {"A": modulacao.detalhes_dos_ambientes(recortes, de_cada, {"M_Apto_101": b"IMG"})}
        ids = {(p["tipo"], p["nome"]): f"id-{p['nome']}" for p in fm["pecas"]}
        man, binario, rel = publicar_planta.montar_trecho(fm, detalhes, ids, {"planta_id": "p", "trecho": "Ambientes"})
        m, pedacos = pacote.ler(man, binario)
        self.assertEqual({m["elementos"][i]["detalhe"] for i in ("id-101-01", "id-101-02")}, {"M_Apto_101"})
        self.assertEqual(list(m["detalhes"]), ["M_Apto_101"])  # uma imagem só no pacote
        self.assertEqual(m["detalhes"]["M_Apto_101"]["titulo"], "Modulação · Apto 101")
        self.assertEqual(pedacos["d:M_Apto_101"], b"IMG")
        self.assertEqual(rel["sem_detalhe"], [])


if __name__ == "__main__":
    unittest.main()
