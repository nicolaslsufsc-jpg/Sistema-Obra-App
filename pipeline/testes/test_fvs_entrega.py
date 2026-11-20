"""Pacote do PC da empresa e zip dos dados da obra. Sem compilar o app e sem PowerShell: só as partes puras."""

from __future__ import annotations

import hashlib
import importlib.util
import json
import pathlib
import sys
import tempfile
import unittest
import zipfile

RAIZ = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(RAIZ / "pipeline" / "fvs"))
sys.path.insert(0, str(RAIZ / "pipeline"))

import exportar_bancada  # noqa: E402
import montar_entrega  # noqa: E402

PC = RAIZ / "pipeline" / "fvs" / "pc_empresa"
_spec = importlib.util.spec_from_file_location("servidor_python", PC / "servidor_python.py")
servidor_python = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(servidor_python)


def sha(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def pacotes_de_teste(base: pathlib.Path) -> pathlib.Path:
    """Dois pavimentos, um trecho cada, no formato da saída de publicar_planta.py --so-gerar."""
    pacotes = base / "pacotes"
    for n, (sub, pav) in enumerate((("01_terreo", "Térreo"), ("02_tipo", "2º Pavimento"))):
        trecho = pacotes / sub / "Trecho_1"
        trecho.mkdir(parents=True)
        man, bin_ = f'{{"planta_id":"p{n}"}}'.encode(), bytes([n]) * 50
        (trecho / "manifest.json").write_bytes(man)
        (trecho / "pacote.bin").write_bytes(bin_)
        (pacotes / sub / "relatorio.json").write_text(json.dumps({
            "obra": "TESTE", "pavimento": pav, "pecas": [{"id": f"e{n}", "tipo": "P", "nome": "P1", "secao": ""}],
            "trechos": [{"planta_id": f"p{n}", "trecho": "Trecho 1", "pasta": "Trecho_1", "prancha": "X-R00", "revisao": "R00", "largura": 10, "altura": 10,
                         "pilares": 1, "vigas": 0, "manifest": {"sha256": sha(man), "tamanho": len(man)}, "pacote": {"sha256": sha(bin_), "tamanho": len(bin_)}}],
        }), encoding="utf-8")
    return pacotes


class TestZipDaObra(unittest.TestCase):
    def setUp(self):
        self._t = tempfile.TemporaryDirectory()
        self.base = pathlib.Path(self._t.name)
        self.addCleanup(self._t.cleanup)
        self.pacotes = pacotes_de_teste(self.base)

    def test_tem_o_que_a_bancada_pede_nos_caminhos_certos(self):
        hist = self.base / "h.json"
        hist.write_text('{"eventos": [], "fichas_campo": []}', encoding="utf-8")
        saida = self.base / "dados_obra_FVS.zip"
        r = exportar_bancada.exportar(self.pacotes, [{"codigo": "F"}], hist, saida, nome="Obra de Teste")
        self.assertEqual((r["pavimentos"], r["plantas"], r["fichas"]), (2, 2, 1))
        with zipfile.ZipFile(saida) as z:
            nomes = set(z.namelist())
            indice = json.loads(z.read("dados_obra/indice.json"))
            self.assertEqual(indice["nome"], "Obra de Teste")
            self.assertRegex(indice["gerado_em"], r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+00:00$")
            self.assertEqual(z.testzip(), None)
        self.assertEqual(nomes, {
            "dados_obra/indice.json", "dados_obra/fichas.json", "dados_obra/historico.json",
            "dados_obra/01_terreo/Trecho_1/manifest.json", "dados_obra/01_terreo/Trecho_1/pacote.bin",
            "dados_obra/02_tipo/Trecho_1/manifest.json", "dados_obra/02_tipo/Trecho_1/pacote.bin",
        })
        # a bancada monta o endereço com "pasta" + nome do arquivo
        for pav in indice["pavimentos"]:
            for pl in pav["plantas"]:
                self.assertIn(f"dados_obra/{pl['pasta']}manifest.json", nomes)

    def test_indice_e_o_ultimo_do_zip(self):
        # quem extrai dá os dados por prontos quando acha o índice: extração interrompida não pode deixá-lo
        saida = self.base / "z.zip"
        exportar_bancada.exportar(self.pacotes, [], None, saida)
        with zipfile.ZipFile(saida) as z:
            self.assertEqual(z.namelist()[-1], "dados_obra/indice.json")

    def test_sem_historico_tambem_serve(self):
        saida = self.base / "z.zip"
        exportar_bancada.exportar(self.pacotes, [], None, saida)
        with zipfile.ZipFile(saida) as z:
            self.assertNotIn("dados_obra/historico.json", z.namelist())

    def test_recusa_arquivo_que_nao_confere_e_nao_deixa_zip_pela_metade(self):
        (self.pacotes / "02_tipo" / "Trecho_1" / "pacote.bin").write_bytes(b"outra coisa")
        saida = self.base / "z.zip"
        with self.assertRaisesRegex(exportar_bancada.ErroExportacaoBancada, "não confere"):
            exportar_bancada.exportar(self.pacotes, [], None, saida)
        self.assertFalse(saida.exists())
        self.assertFalse(saida.with_suffix(".tmp").exists())

    def test_recusa_saida_dentro_do_repositorio(self):
        with self.assertRaisesRegex(exportar_bancada.ErroExportacaoBancada, "repositório"):
            exportar_bancada.exportar(self.pacotes, [], None, RAIZ / "pipeline" / "z.zip")
        self.assertFalse((RAIZ / "pipeline" / "z.zip").exists())

    def test_pasta_sem_planta(self):
        vazia = self.base / "vazia"
        vazia.mkdir()
        with self.assertRaisesRegex(exportar_bancada.ErroExportacaoBancada, "nenhuma planta"):
            exportar_bancada.exportar(vazia, [], None, self.base / "z.zip")


class TestDocumentosDaEmpresa(unittest.TestCase):
    """--documentos: pasta com documentos.json e os arquivos, para o app gravar como baixados."""

    def setUp(self):
        self._t = tempfile.TemporaryDirectory()
        self.base = pathlib.Path(self._t.name)
        self.addCleanup(self._t.cleanup)
        self.pacotes = pacotes_de_teste(self.base)
        self.docs = self.base / "docs"
        self.docs.mkdir()
        self.pdf = b"%PDF-1.4 exemplo"
        (self.docs / "manual.pdf").write_bytes(self.pdf)

    def lista(self, itens):
        (self.docs / "documentos.json").write_text(json.dumps(itens), encoding="utf-8")

    def doc(self, **extra):
        d = {"categoria": "sistema", "codigo": "exe-mq", "titulo": "Manual da Qualidade", "revisao": "03", "data_revisao": "2026-02-01", "responsavel": "Qualidade"}
        d.update(extra)
        return d

    def test_vai_no_zip_com_indice_e_arquivo_conferivel(self):
        self.lista([self.doc(arquivo="manual.pdf"), self.doc(codigo="EXE-PES-01", categoria="pes", titulo="Alvenaria", revisao="01", situacao="em_revisao")])
        saida = self.base / "z.zip"
        r = exportar_bancada.exportar(self.pacotes, [], None, saida, documentos=self.docs)
        self.assertEqual(r["documentos"], 2)
        with zipfile.ZipFile(saida) as z:
            nomes = z.namelist()
            indice = json.loads(z.read("dados_obra/documentos/indice.json"))
            mq = indice["documentos"][0]
            self.assertEqual(mq["codigo"], "EXE-MQ")
            self.assertEqual(mq["arquivo"]["nome"], "manual.pdf")
            self.assertEqual(mq["arquivo"]["tipo"], "application/pdf")
            self.assertEqual(mq["arquivo"]["sha256"], sha(self.pdf))
            self.assertEqual(z.read("dados_obra/documentos/" + mq["arquivo"]["caminho"]), self.pdf)
            self.assertIsNone(indice["documentos"][1]["arquivo"])
            self.assertEqual(indice["documentos"][1]["situacao"], "em_revisao")
            self.assertEqual(nomes[-1], "dados_obra/indice.json")

    def test_sem_documentos_nada_muda(self):
        saida = self.base / "z.zip"
        r = exportar_bancada.exportar(self.pacotes, [], None, saida)
        self.assertEqual(r["documentos"], 0)
        with zipfile.ZipFile(saida) as z:
            self.assertFalse(any("documentos/" in n for n in z.namelist()))

    def test_recusa_o_que_o_app_nao_aceita_e_nao_deixa_zip(self):
        grande = self.docs / "grande.pdf"
        grande.write_bytes(b"0" * (exportar_bancada.LIMITE_DOC + 1))
        (self.base / "fora.pdf").write_bytes(b"x")
        (self.docs / "desenho.svg").write_bytes(b"<svg onload='alert(1)'/>")
        casos = [
            ([self.doc(categoria="inventada")], "categoria"),
            ([self.doc(responsavel="")], "falta responsavel"),
            ([self.doc(data_revisao="01/02/2026")], "data_revisao"),
            ([self.doc(arquivo="nao_existe.pdf")], "não está na pasta"),
            ([self.doc(arquivo="../fora.pdf")], "não está na pasta"),
            ([self.doc(arquivo="grande.pdf")], "10 MB"),
            ([self.doc(arquivo="desenho.svg")], "só PDF ou foto"),
            ([self.doc(), self.doc()], "repetida"),
        ]
        saida = self.base / "z.zip"
        for itens, erro in casos:
            with self.subTest(erro=erro):
                self.lista(itens)
                with self.assertRaisesRegex(exportar_bancada.ErroExportacaoBancada, erro):
                    exportar_bancada.exportar(self.pacotes, [], None, saida, documentos=self.docs)
                self.assertFalse(saida.exists())

    def test_linha_de_comando(self):
        self.lista([self.doc(arquivo="manual.pdf")])
        saida = self.base / "z.zip"
        self.assertEqual(exportar_bancada.main([str(self.pacotes), "--saida", str(saida), "--documentos", str(self.docs)]), 0)
        with zipfile.ZipFile(saida) as z:
            self.assertIn("dados_obra/documentos/indice.json", z.namelist())


class TestPacoteSemDados(unittest.TestCase):
    def setUp(self):
        self._t = tempfile.TemporaryDirectory()
        self.pasta = pathlib.Path(self._t.name)
        self.addCleanup(self._t.cleanup)
        (self.pasta / "site_app").mkdir()
        (self.pasta / "site_app" / "index.html").write_text("<html>", encoding="utf-8")

    def test_aceita_o_que_e_so_programa(self):
        self.assertLess(montar_entrega.conferir_sem_dados(self.pasta), 1)

    def test_recusa_o_que_parece_dado_de_obra(self):
        for nome in ("pacote.bin", "prancha.PDF", "historico.json", "indice.json", "manifest.json", "dados_obra_FVS.zip", "lista.csv", "foto.jpg", "modelo.ifc"):
            arq = self.pasta / "site_app" / nome
            arq.write_bytes(b"x")
            with self.assertRaisesRegex(montar_entrega.ErroEntrega, "dado de obra", msg=nome):
                montar_entrega.conferir_sem_dados(self.pasta)
            arq.unlink()

    def test_recusa_pacote_grande_demais(self):
        (self.pasta / "grande.js").write_bytes(b"x" * int((montar_entrega.LIMITE_MB + 1) * 1e6))
        with self.assertRaisesRegex(montar_entrega.ErroEntrega, "limite"):
            montar_entrega.conferir_sem_dados(self.pasta)

    def test_saida_dentro_do_repositorio_e_recusada(self):
        with self.assertRaisesRegex(montar_entrega.ErroEntrega, "dentro do repositório"):
            montar_entrega.montar(RAIZ / "entrega_teste")

    def test_fim_de_linha_e_marca_para_o_windows(self):
        self.assertEqual(montar_entrega.texto_para_windows("a\nb\r\nç\n", ".ps1"), b"\xef\xbb\xbfa\r\nb\r\n\xc3\xa7\r\n")
        self.assertEqual(montar_entrega.texto_para_windows("a\nb\n", ".bat"), b"a\r\nb\r\n")
        self.assertEqual(montar_entrega.texto_para_windows("a\n", ".txt"), b"\xef\xbb\xbfa\r\n")
        self.assertEqual(montar_entrega.texto_para_windows("a\n", ".py"), b"a\n")
        # modelo que já tem a marca: sai com uma só
        self.assertEqual(montar_entrega.texto_para_windows("﻿a\n", ".ps1"), b"\xef\xbb\xbfa\r\n")

    def test_ps1_do_repositorio_com_marca_de_utf8(self):
        # sem a marca (EF BB BF), o PowerShell 5.1 lê o .ps1 como ANSI e as mensagens saem quebradas
        # ("NÃ£o consegui abrir"; testador, 20/11). Vale também para quem roda o .ps1 direto do repositório
        ps1 = sorted(RAIZ.glob("pipeline/**/*.ps1"))
        self.assertTrue(ps1)
        for p in ps1:
            self.assertEqual(p.read_bytes()[:3], b"\xef\xbb\xbf", msg=str(p.relative_to(RAIZ)))


class TestModelos(unittest.TestCase):
    def test_estao_todos_la(self):
        nomes = {p.name for p in PC.iterdir() if p.is_file()}
        self.assertEqual(nomes, {"ABRIR_FVS.bat", "ABRIR_SISTEMA_OBRA.bat", "ABRIR_NA_REDE.bat", "servidor.ps1",
                                 "servidor_python.py", "qrcode.js", "LEIA-ME.txt"})

    def test_bat_sem_acento(self):
        # o .bat é lido na página de código do Windows: acento viraria lixo
        for nome in ("ABRIR_FVS.bat", "ABRIR_SISTEMA_OBRA.bat", "ABRIR_NA_REDE.bat"):
            (PC / nome).read_text(encoding="ascii")

    def test_servidor_so_atende_este_pc(self):
        ps1 = (PC / "servidor.ps1").read_text(encoding="utf-8")
        self.assertIn('"http://localhost:$p/"', ps1)
        self.assertNotIn("http://+", ps1)
        self.assertNotIn("http://*", ps1)
        # Python: só este PC, a não ser no modo "rede" (ABRIR_NA_REDE, aprovado em 16/11/2026), o único que abre para o Wi-Fi
        py = (PC / "servidor_python.py").read_text(encoding="utf-8")
        self.assertIn('("0.0.0.0" if rede else "127.0.0.1")', py)
        self.assertEqual(py.count("0.0.0.0"), 1)
        self.assertIn('rede = pedido == "rede"', py)

    def test_servidor_nao_trata_nome_de_pasta_como_curinga(self):
        ps1 = (PC / "servidor.ps1").read_text(encoding="utf-8")
        self.assertNotRegex(ps1, r"\s-Path\s")
        self.assertNotIn("Test-Path $", ps1)
        self.assertNotIn("Join-Path", ps1)
        self.assertNotIn("Expand-Archive ", ps1)

    def test_mesmas_portas_nos_dois_servidores(self):
        # o que a pessoa marca fica guardado por endereço: os dois têm que usar o mesmo
        ps1 = (PC / "servidor.ps1").read_text(encoding="utf-8")
        self.assertIn(f"$Porta = {servidor_python.PORTAS['bancada']}", ps1)
        self.assertIn(f"$Porta = {servidor_python.PORTAS['app']}", ps1)


class TestServidorPython(unittest.TestCase):
    def setUp(self):
        self._t = tempfile.TemporaryDirectory()
        self.base = pathlib.Path(self._t.name)
        self.addCleanup(self._t.cleanup)
        self.site = self.base / "site_bancada"
        (self.site / "dev").mkdir(parents=True)
        (self.site / "dev" / "fvs.html").write_text("x", encoding="utf-8")

    def test_acha_os_dados_onde_o_zip_foi_extraido(self):
        self.assertIsNone(servidor_python.achar_dados(self.base))
        # um indice.json dentro do site não conta
        (self.site / "indice.json").write_text("{}", encoding="utf-8")
        self.assertIsNone(servidor_python.achar_dados(self.base))
        dados = self.base / "dados_obra_FVS" / "dados_obra"
        dados.mkdir(parents=True)
        (dados / "indice.json").write_text("{}", encoding="utf-8")
        self.assertEqual(servidor_python.achar_dados(self.base), dados)

    def test_extrai_o_zip_na_primeira_vez(self):
        with zipfile.ZipFile(self.base / "dados_obra_FVS.zip", "w") as z:
            z.writestr("dados_obra/indice.json", "{}")
        dados = servidor_python.preparar_dados(self.base)
        self.assertEqual(dados, self.base / "dados_obra")
        self.assertTrue((dados / "indice.json").is_file())

    def test_extracao_interrompida_recomeca(self):
        with zipfile.ZipFile(self.base / "dados_obra_FVS.zip", "w") as z:
            z.writestr("dados_obra/a.bin", "inteiro")
            z.writestr("dados_obra/indice.json", "{}")
        # a janela fechou no meio: um arquivo cortado e nada de índice
        (self.base / "dados_obra").mkdir()
        (self.base / "dados_obra" / "a.bin").write_text("cort", encoding="utf-8")
        dados = servidor_python.preparar_dados(self.base)
        self.assertEqual(dados, self.base / "dados_obra")
        self.assertEqual((dados / "a.bin").read_text(encoding="utf-8"), "inteiro")

    def test_nao_entrega_nada_fora_das_pastas(self):
        dados = self.base / "dados_obra"
        dados.mkdir()
        (self.base / "segredo.txt").write_text("x", encoding="utf-8")
        ok = servidor_python.resolver("/dev/fvs.html?abrir=0", self.site, dados)
        self.assertEqual(ok, (self.site / "dev" / "fvs.html").resolve())
        self.assertEqual(servidor_python.resolver("/dados_obra/a%20b.json", self.site, dados), (dados / "a b.json").resolve())
        for tentativa in ("/../segredo.txt", "/%2e%2e/segredo.txt", "/dados_obra/../segredo.txt", "/dados_obra/%2e%2e/segredo.txt"):
            self.assertIsNone(servidor_python.resolver(tentativa, self.site, dados), tentativa)


if __name__ == "__main__":
    unittest.main()
