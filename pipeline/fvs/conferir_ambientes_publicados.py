"""Confere o ambiente dos pontos de instalações publicados (25/11/2026, pedido do 10 via Professor).

Uso (no PC, na pasta pipeline):
    py fvs/conferir_ambientes_publicados.py EXE Pilotis PASTA_DO_SO_GERAR --url <servidor de testes> --chave <publishable>

Para cada planta de instalações vigente do pavimento, baixa só o manifest.json (não o pacote.bin: o egress) e
conta, ponto a ponto:
- certo: o "ambiente" é o id de um ambiente (elemento A) do pavimento, não apagado, e é o mesmo cômodo que o
  pipeline calcula no PC (a pasta do --so-gerar do mesmo pavimento.json, onde o ambiente vem com o id local);
- sem_ambiente: o ponto não tem ambiente nem no servidor nem no PC;
- id_inexistente: o id não é de nenhum ambiente vivo do pavimento;
- outro_comodo: o ambiente existe, mas não é o calculado no PC (ou o PC dá ambiente e o servidor não);
- sem_ponto_no_pc: o ponto não existe no pacote do PC (pacotes de versões diferentes).
Só lê: não grava nada no servidor. Login como o publicar_planta (no servidor de testes, a conta de teste do .env).
"""

from __future__ import annotations

import argparse
import json
import pathlib
import sys
import tempfile

AQUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))
sys.path.insert(0, str(AQUI.parent))

DISCIPLINAS = ("hidro", "sanitario", "eletrico", "preventivo", "spda")


def comparar(pontos_servidor: dict, ambientes: dict[str, str], pontos_pc: dict, nome_do_id_local: dict[str, str]) -> dict:
    """pontos_*: {id do ponto: ponto do manifest}. ambientes: {id no servidor: nome} dos ambientes vivos do
    pavimento. nome_do_id_local: {id local: nome}, para ler o ambiente dos pontos do PC."""
    conta = {"certo": 0, "sem_ambiente": 0, "id_inexistente": 0, "outro_comodo": 0, "sem_ponto_no_pc": 0}
    exemplos: dict[str, list] = {k: [] for k in conta}
    for pid, p in pontos_servidor.items():
        amb = p.get("ambiente")
        local = pontos_pc.get(pid)
        if local is None:
            chave = "sem_ponto_no_pc"
        else:
            esperado = nome_do_id_local.get(local.get("ambiente")) if local.get("ambiente") else None
            if amb and amb not in ambientes:
                chave = "id_inexistente"
            elif not amb and not esperado:
                chave = "sem_ambiente"
            elif amb and ambientes[amb] == esperado:
                chave = "certo"
            else:
                chave = "outro_comodo"
        conta[chave] += 1
        if len(exemplos[chave]) < 3 and chave not in ("certo", "sem_ambiente"):
            exemplos[chave].append(pid)
    return {**conta, "exemplos": {k: v for k, v in exemplos.items() if v}}


def main(argv: list[str] | None = None) -> int:
    import publicar_planta as P
    import sessao_local
    from exportar_obra import CHAVE_PADRAO, URL_PADRAO, Supabase

    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("obra")
    ap.add_argument("pavimento")
    ap.add_argument("pasta_pc", help="a pasta do --so-gerar do mesmo pavimento.json")
    ap.add_argument("--url", default=URL_PADRAO)
    ap.add_argument("--chave", default=CHAVE_PADRAO)
    a = ap.parse_args(argv)

    sb = Supabase(a.url, a.chave)
    P.entrar(sb, None)
    srv = P.Servidor(sb, sessao_local.dispositivo_id())
    obra = srv.obra(a.obra.upper())
    pav = srv.pavimento(obra["id"], a.pavimento)
    ambientes = {e["id"]: e["nome"] for e in srv.obter("elementos", {"pavimento_id": f"eq.{pav['id']}", "tipo": "eq.A"})
                 if not e.get("apagado")}
    nome_do_id_local = {P.id_local(a.obra.upper(), pav["nome"], "A", n): n for n in ambientes.values()}
    setores = {s["id"]: s for s in srv.obter("setores", {"pavimento_id": f"eq.{pav['id']}"})
               if not s.get("apagado") and s["disciplina"] in DISCIPLINAS}
    plantas = [p for p in srv.obter("plantas", {"pavimento_id": f"eq.{pav['id']}"}) if not p.get("apagado")]
    substituidas = {p["substitui_id"] for p in plantas if p.get("substitui_id")}
    vigentes = [p for p in plantas if p["setor_id"] in setores and p["id"] not in substituidas]
    print(f"{a.obra.upper()} / {pav['nome']}: {len(ambientes)} ambientes vivos; {len(vigentes)} plantas de instalações vigentes")
    total = {}
    with tempfile.TemporaryDirectory() as tmp:
        for pl in sorted(vigentes, key=lambda p: setores[p["setor_id"]]["nome_projeto"]):
            trecho = setores[pl["setor_id"]]["nome_projeto"]
            arq = srv.obter("arquivos", {"id": f"eq.{pl['manifest_id']}"})[0]
            destino = pathlib.Path(tmp) / f"{pl['id']}.json"
            sb.baixar(arq["caminho"], destino)
            man = json.loads(destino.read_text(encoding="utf-8"))
            local = pathlib.Path(a.pasta_pc) / trecho.replace(" ", "_") / "manifest.json"
            pc = json.loads(local.read_text(encoding="utf-8")).get("pontos") or {} if local.is_file() else {}
            r = comparar(man.get("pontos") or {}, ambientes, pc, nome_do_id_local)
            print(f"- {trecho} (planta {pl['id'][:8]}): " + ", ".join(f"{k} {v}" for k, v in r.items() if k != "exemplos")
                  + (f"; exemplos {r['exemplos']}" if r["exemplos"] else ""))
            for k, v in r.items():
                if k != "exemplos":
                    total[k] = total.get(k, 0) + v
    print("Total: " + ", ".join(f"{k} {v}" for k, v in total.items()))
    return 0 if not (total.get("id_inexistente") or total.get("outro_comodo")) else 1


if __name__ == "__main__":
    sys.exit(main())
