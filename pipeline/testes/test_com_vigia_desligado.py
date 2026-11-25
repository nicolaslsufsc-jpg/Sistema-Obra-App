"""A tarefa agendada (o vigia) sempre volta ligada: fim normal, erro, Ctrl+C, janela fechada."""

import pathlib
import signal
import subprocess
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1] / "fvs"))

import com_vigia_desligado as cv  # noqa: E402


class SchtasksFalso:
    """Faz o papel do schtasks: guarda as chamadas e o estado da tarefa."""

    def __init__(self, estado="Pronto", rodando_por=0, falha_desligar=False):
        self.estado = estado
        self.rodando_por = rodando_por
        self.falha_desligar = falha_desligar
        self.chamadas = []

    def __call__(self, args):
        self.chamadas.append(args[0] + (" " + args[-1] if args[0] == "/Change" else ""))
        if args[0] == "/Query":
            if self.rodando_por > 0:
                self.rodando_por -= 1
                return 0, "Nome da tarefa: x\nStatus:                   Em execução\n"
            return 0, f"Nome da tarefa: x\nStatus:                   {self.estado}\n"
        if args[-1] == "/DISABLE":
            if self.falha_desligar:
                return 1, "ERRO: acesso negado"
            self.estado = "Desabilitado"
        elif args[-1] == "/ENABLE":
            self.estado = "Pronto"
        return 0, "ÊXITO"


class ProcFalso:
    def __init__(self, codigo=0, erro=None):
        self.codigo, self.erro, self.pid = codigo, erro, 4242
        self.morto = False

    def wait(self, timeout=None):
        if self.erro and not self.morto:
            e, self.erro = self.erro, None
            raise e
        return self.codigo

    def poll(self):
        return self.codigo if self.morto else None

    def kill(self):
        self.morto = True


def vigia(st):
    saida = []
    return cv.Vigia("tarefa X", executar=st, dormir=lambda s: None, imprimir=saida.append), saida


class TestComVigiaDesligado(unittest.TestCase):
    def setUp(self):
        # nada de taskkill nem de handler de console de verdade nos testes
        self._enc, self._fech = cv._encerrar, cv._ao_fechar_a_janela
        self.encerrados = []
        cv._encerrar = lambda p: (self.encerrados.append(p), p and p.kill())
        cv._ao_fechar_a_janela = lambda acao: setattr(self, "ao_fechar", acao)
        self._sigint = signal.getsignal(signal.SIGINT)

    def tearDown(self):
        cv._encerrar, cv._ao_fechar_a_janela = self._enc, self._fech
        signal.signal(signal.SIGINT, self._sigint)

    def test_fim_normal_desliga_roda_e_religa(self):
        st = SchtasksFalso()
        v, saida = vigia(st)
        rodou = []
        cod = cv.rodar(v, ["publicar"], popen=lambda c: (rodou.append(c), ProcFalso(0))[1])
        self.assertEqual(cod, 0)
        self.assertEqual(rodou, [["publicar"]])
        self.assertLess(st.chamadas.index("/Change /DISABLE"), st.chamadas.index("/Change /ENABLE"))
        self.assertEqual(st.estado, "Pronto")
        self.assertIn("religada", saida[-1])

    def test_erro_no_comando_religa_e_devolve_o_codigo(self):
        st = SchtasksFalso()
        v, _ = vigia(st)
        self.assertEqual(cv.rodar(v, ["publicar"], popen=lambda c: ProcFalso(1)), 1)
        self.assertEqual(st.estado, "Pronto")

    def test_ctrl_c_encerra_o_comando_antes_de_religar(self):
        st = SchtasksFalso()
        v, saida = vigia(st)
        proc = ProcFalso(erro=KeyboardInterrupt())
        ordem = []
        cv._encerrar = lambda p: (ordem.append(("encerrou", st.estado)), p.kill())
        cod = cv.rodar(v, ["publicar"], popen=lambda c: proc)
        self.assertEqual(cod, 130)
        self.assertEqual(ordem, [("encerrou", "Desabilitado")])  # parou com a tarefa ainda desligada
        self.assertEqual(st.estado, "Pronto")
        self.assertTrue(any("Ctrl+C" in s for s in saida))
        self.assertIs(signal.getsignal(signal.SIGINT), signal.SIG_IGN)  # a limpeza não é cortada por outro Ctrl+C

    def test_erro_ao_abrir_o_comando_religa(self):
        st = SchtasksFalso()
        v, _ = vigia(st)

        def popen(c):
            raise FileNotFoundError("python não achado")
        self.assertEqual(cv.rodar(v, ["publicar"], popen=popen), 1)
        self.assertEqual(st.estado, "Pronto")

    def test_janela_fechada_encerra_e_religa(self):
        st = SchtasksFalso()
        v, _ = vigia(st)
        proc = ProcFalso(0)

        def popen(c):
            self.ao_fechar()  # o Windows avisa que a janela fechou enquanto o comando roda
            return proc
        cv.rodar(v, ["publicar"], popen=popen)
        self.assertEqual(st.estado, "Pronto")
        self.assertEqual(st.chamadas.count("/Change /ENABLE"), 1)  # o finally não religa de novo

    def test_espera_a_tarefa_terminar_antes_de_rodar(self):
        st = SchtasksFalso(rodando_por=2)
        v, saida = vigia(st)
        estados = []
        cv.rodar(v, ["publicar"], popen=lambda c: (estados.append(st.estado), ProcFalso(0))[1])
        self.assertEqual(sum("esperando" in s for s in saida), 1)
        self.assertEqual(estados, ["Desabilitado"])

    def test_nao_desligou_nao_roda_e_tenta_religar(self):
        st = SchtasksFalso(falha_desligar=True)
        v, saida = vigia(st)
        rodou = []
        cod = cv.rodar(v, ["publicar"], popen=lambda c: (rodou.append(c), ProcFalso(0))[1])
        self.assertEqual(cod, 1)
        self.assertEqual(rodou, [])
        self.assertIn("/Change /ENABLE", st.chamadas)

    def test_avisa_quando_ja_estava_desligada(self):
        st = SchtasksFalso(estado="Desabilitado")
        v, saida = vigia(st)
        cv.rodar(v, ["publicar"], popen=lambda c: ProcFalso(0))
        self.assertTrue(any("já estava desligada" in s for s in saida))
        self.assertEqual(st.estado, "Pronto")

    def test_religar_falhou_avisa_e_nao_da_zero(self):
        st = SchtasksFalso()
        v, saida = vigia(st)
        original = st.__call__

        def sem_enable(args):
            return (1, "negado") if args[-1] == "/ENABLE" else original(args)
        v.executar = sem_enable
        self.assertEqual(cv.rodar(v, ["publicar"], popen=lambda c: ProcFalso(0)), 2)
        self.assertIn("NÃO ficou ligada", saida[-1])


@unittest.skipUnless(sys.platform == "win32", "Ctrl+C de verdade só no Windows")
class TestCtrlCDeVerdade(unittest.TestCase):
    """Um processo de verdade: KeyboardInterrupt no meio do wait() ainda religa."""

    def tearDown(self):
        signal.signal(signal.SIGINT, signal.default_int_handler)

    def test_keyboardinterrupt_real(self):
        st = SchtasksFalso()
        v, _ = vigia(st)
        filho = {}

        class Popen(subprocess.Popen):
            def wait(self, timeout=None):
                if "p" not in filho:
                    filho["p"] = self
                    raise KeyboardInterrupt
                return super().wait(timeout)
        cod = cv.rodar(v, [sys.executable, "-c", "import time; time.sleep(60)"], popen=Popen)
        self.assertEqual(cod, 130)
        self.assertEqual(st.estado, "Pronto")
        self.assertIsNotNone(filho["p"].poll())  # o comando foi encerrado


if __name__ == "__main__":
    unittest.main()
