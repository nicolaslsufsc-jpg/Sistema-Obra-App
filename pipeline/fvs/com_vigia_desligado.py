"""Roda um comando com uma tarefa agendada do Windows desligada e sempre a religa no fim.

Uso (no .bat de publicação, fora do repositório):
    python pipeline/fvs/com_vigia_desligado.py --tarefa "NOME DA TAREFA" -- "%~f0" passos
    (o próprio .bat chamado de volta com "passos"; "cmd /c" com aspas perde o caminho que tem espaço)

Para quê: a publicação usa o mesmo login que uma tarefa agendada (o "vigia"). Enquanto publica, a
tarefa fica desligada. Antes (24/11/2026, achado do revisor), quem religava era a última linha do .bat:
se a publicação parasse no meio (erro, Ctrl+C, janela fechada), a tarefa ficava desligada sem
ninguém saber.

Agora:
- desliga a tarefa e espera ela terminar, se estava rodando;
- roda o comando;
- religa sempre: no fim normal, em erro, no Ctrl+C (KeyboardInterrupt) e quando a janela é fechada
  (aviso CTRL_CLOSE_EVENT do console, que dá uns 5 segundos ao processo);
- no Ctrl+C ou no fechamento, encerra primeiro o comando (e os filhos dele), para nada continuar
  publicando com a tarefa já religada;
- da hora do Ctrl+C em diante, outro Ctrl+C é ignorado: nada corta a limpeza no meio;
- no fim mostra o estado da tarefa e avisa em letras grandes se ela não ficou ligada.

O que nada segura: matar o Python à força (Gerenciador de Tarefas) ou desligar o PC. Nesses casos a
próxima rodada avisa no começo que a tarefa estava desligada, e ela é religada no fim dessa rodada.

Sem dependências fora da biblioteca padrão. Testes: pipeline/testes/test_com_vigia_desligado.py.
"""

from __future__ import annotations

import argparse
import signal
import subprocess
import sys
import time
from typing import Callable, Sequence

RODANDO = ("Running", "Em execu")    # schtasks /Query em inglês ou português
DESLIGADA = ("Disabled", "Desabilitad")
LIGADA = ("Ready", "Pronto")


def _schtasks(args: Sequence[str]) -> tuple[int, str]:
    r = subprocess.run(["schtasks", *args], capture_output=True, text=True, errors="replace")
    return r.returncode, (r.stdout or "") + (r.stderr or "")


class Vigia:
    """A tarefa agendada. `executar` roda o schtasks (trocado nos testes)."""

    def __init__(self, tarefa: str, executar: Callable[[Sequence[str]], tuple[int, str]] = _schtasks,
                 dormir: Callable[[float], None] = time.sleep, imprimir: Callable[[str], None] = print):
        self.tarefa = tarefa
        self.executar = executar
        self.dormir = dormir
        self.imprimir = imprimir
        self.religada = False

    def estado(self) -> str:
        cod, saida = self.executar(["/Query", "/TN", self.tarefa, "/FO", "LIST"])
        if cod != 0:
            return "?"
        for linha in saida.splitlines():
            if linha.strip().lower().startswith("status"):
                return linha.split(":", 1)[1].strip()
        return "?"

    def desligar(self, espera_max: float = 600.0, passo: float = 20.0) -> None:
        antes = self.estado()
        if antes.startswith(DESLIGADA):
            self.imprimir(f"  AVISO: a tarefa \"{self.tarefa}\" já estava desligada (uma rodada anterior parou no meio?). "
                          "Ela será religada no fim desta.")
        cod, saida = self.executar(["/Change", "/TN", self.tarefa, "/DISABLE"])
        if cod != 0:
            raise RuntimeError(f"não consegui desligar a tarefa \"{self.tarefa}\": {saida.strip()}")
        esperou = 0.0
        while self.estado().startswith(RODANDO):
            if esperou >= espera_max:
                raise RuntimeError(f"a tarefa \"{self.tarefa}\" continua rodando depois de {int(espera_max)} s")
            self.imprimir("  a tarefa ainda está rodando; esperando ela terminar...")
            self.dormir(passo)
            esperou += passo

    def religar(self) -> bool:
        """Liga a tarefa. Pode ser chamada mais de uma vez (finally + aviso de fechamento)."""
        if self.religada:
            return True
        for _ in range(3):
            cod, _saida = self.executar(["/Change", "/TN", self.tarefa, "/ENABLE"])
            if cod == 0:
                self.religada = True
                return True
        return False


def _encerrar(proc) -> None:
    """Encerra o comando e os filhos dele (o publicar_planta roda dentro do .bat)."""
    if proc is None or proc.poll() is not None:
        return
    try:
        subprocess.run(["taskkill", "/T", "/F", "/PID", str(proc.pid)], capture_output=True)
    except OSError:
        proc.kill()
    try:
        proc.wait(timeout=30)
    except Exception:
        pass


def _ao_fechar_a_janela(acao: Callable[[], None]):
    """No Windows, chama `acao` quando a janela do console é fechada (ou o usuário sai/desliga).
    Devolve o handler (precisa ficar vivo) ou None fora do Windows."""
    if sys.platform != "win32":
        return None
    import ctypes
    from ctypes import wintypes

    CTRL_CLOSE, CTRL_LOGOFF, CTRL_SHUTDOWN = 2, 5, 6
    TIPO = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.DWORD)

    def handler(evento):
        if evento in (CTRL_CLOSE, CTRL_LOGOFF, CTRL_SHUTDOWN):
            acao()
            return True
        return False  # Ctrl+C e Ctrl+Break seguem para o Python (KeyboardInterrupt)

    h = TIPO(handler)
    ctypes.windll.kernel32.SetConsoleCtrlHandler(h, True)
    return h


def _sem_ctrl_c() -> None:
    try:
        signal.signal(signal.SIGINT, signal.SIG_IGN)
    except ValueError:  # fora da thread principal (não acontece no uso pelo .bat)
        pass


def rodar(vigia: Vigia, comando: Sequence[str], popen=subprocess.Popen) -> int:
    """Desliga, roda, religa (sempre). Devolve o código de saída do comando (130 no Ctrl+C)."""
    estado = {"proc": None}

    def fechar():
        _encerrar(estado["proc"])
        vigia.religar()

    guarda = _ao_fechar_a_janela(fechar)  # noqa: F841 (fica vivo até o fim)
    codigo = 1
    try:
        vigia.desligar()
        estado["proc"] = popen(list(comando))
        codigo = estado["proc"].wait()
    except KeyboardInterrupt:
        _sem_ctrl_c()  # um segundo Ctrl+C não pode cortar a limpeza
        vigia.imprimir("  interrompido (Ctrl+C): parando a publicação")
        _encerrar(estado["proc"])
        codigo = 130
    except Exception as e:  # noqa: BLE001 (qualquer erro: religar e contar)
        vigia.imprimir(f"  ERRO: {e}")
        _encerrar(estado["proc"])
        codigo = 1
    finally:
        _sem_ctrl_c()
        ok = vigia.religar()
        final = vigia.estado()
        if ok and final.startswith(LIGADA + RODANDO):
            vigia.imprimir(f"  tarefa \"{vigia.tarefa}\": {final} (religada)")
        else:
            vigia.imprimir(f"  ATENÇÃO: a tarefa \"{vigia.tarefa}\" NÃO ficou ligada (estado: {final}). "
                           f"Religue à mão: schtasks /Change /TN \"{vigia.tarefa}\" /ENABLE")
            if codigo == 0:
                codigo = 2
    return codigo


def main(argv: Sequence[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--tarefa", required=True, help="nome da tarefa agendada (schtasks /TN)")
    ap.add_argument("comando", nargs=argparse.REMAINDER, help="-- e o comando a rodar")
    a = ap.parse_args(argv)
    comando = a.comando[1:] if a.comando[:1] == ["--"] else a.comando
    if not comando:
        ap.error("falta o comando depois de --")
    return rodar(Vigia(a.tarefa), comando)


if __name__ == "__main__":
    sys.exit(main())
