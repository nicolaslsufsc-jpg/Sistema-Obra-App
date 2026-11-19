"""Serve no próprio PC os pacotes gerados com --so-gerar, para abrir a obra inteira na bancada do app
sem servidor e sem login (nada sai do PC).

Uso (duas janelas do terminal):
    py pipeline/fvs/bancada.py "C:\\...\\pacotes"
    cd app && npm run dev
Depois abra o endereço que o primeiro comando mostrar (http://localhost:5173/dev/fvs.html?pasta=...).

Histórico do sistema oficial (as verificações já feitas, com data, hora e quem marcou): acrescente
--historico ARQUIVO (formato historico.json, ex. a saída de um galho de pipeline/integracoes/) e --sistema-oficial ID.

Fichas: sem --fichas, usa as de pilar e viga do legado. Para ter também as fichas por ambiente,
passe os dois arquivos (o das fichas por ambiente fica fora do repositório):
    py pipeline/fvs/bancada.py PASTA --fichas "C:\\...\\fichas_da_empresa.json" --fichas "C:\\...\\fichas_ambientes.json"

A pasta tem uma subpasta por pavimento (a saída de publicar_planta.py --so-gerar), cada uma com
relatorio.json e as pastas dos trechos. O script monta /indice.json (pavimentos, plantas, peças) e
/fichas.json (no formato do sistema) e entrega os arquivos dos pacotes. Só responde a 127.0.0.1.
"""

from __future__ import annotations

import argparse
import functools
import http.server
import json
import pathlib
import sys

AQUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))
sys.path.insert(0, str(AQUI.parent))

import sistema_oficial  # noqa: E402


def montar_indice(pasta: pathlib.Path) -> dict:
    """Um pavimento pode vir de mais de uma subpasta (ex.: a estrutura numa, os ambientes noutra):
    as que têm o mesmo nome de pavimento são juntadas, na ordem das subpastas."""
    pavimentos: dict[str, dict] = {}
    obra = ""
    for sub in sorted(p for p in pasta.iterdir() if p.is_dir()):
        rel = sub / "relatorio.json"
        if not rel.exists():
            continue
        d = json.loads(rel.read_text(encoding="utf-8"))
        obra = obra or d.get("obra", "")
        pav = pavimentos.setdefault(d["pavimento"], {"nome": d["pavimento"], "pecas": [], "plantas": []})
        ja = {p["id"] for p in pav["pecas"]}
        pav["pecas"] += [p for p in d.get("pecas", []) if p["id"] not in ja]
        pav["plantas"] += [{
            "id": t["planta_id"], "trecho": t["trecho"], "pasta": f"{sub.name}/{t['pasta']}/",
            "prancha": t["prancha"], "revisao": t["revisao"], "largura": t["largura"], "altura": t["altura"],
            "elementos": t.get("elementos", t.get("pilares", 0) + t.get("vigas", 0)),
            "disciplina": t.get("disciplina") or "estrutura",
            "manifest": t["manifest"], "pacote": t["pacote"],
        } for t in d["trechos"]]
    return {"obra": obra or "TESTE", "pavimentos": list(pavimentos.values())}


def ler_fichas(caminhos: list[str]) -> list[dict]:
    import publicar_fichas

    fichas: list[dict] = []
    for c in caminhos:
        fichas += publicar_fichas.normalizar(json.loads(pathlib.Path(c).read_text(encoding="utf-8")))
    return fichas


def servir(pasta: pathlib.Path, fichas: list[dict], porta: int, historico: pathlib.Path | None = None, sistema: str | None = None) -> None:
    class Bancada(http.server.SimpleHTTPRequestHandler):
        def end_headers(self):
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Cache-Control", "no-store")
            super().end_headers()

        def do_GET(self):
            gerados = {"/indice.json": lambda: sistema_oficial.aplicar(montar_indice(pasta), sistema), "/fichas.json": lambda: fichas,
                       "/historico.json": lambda: json.loads(historico.read_text(encoding="utf-8")) if historico else None}
            caminho = self.path.split("?")[0]
            if caminho in gerados:
                corpo = json.dumps(gerados[caminho](), ensure_ascii=False).encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(corpo)))
                self.end_headers()
                self.wfile.write(corpo)
                return
            super().do_GET()

        def log_message(self, *a):
            pass

    servidor = http.server.ThreadingHTTPServer(("127.0.0.1", porta), functools.partial(Bancada, directory=str(pasta)))
    print(f"Servindo {pasta}")
    print(f"Abra: http://localhost:5173/dev/fvs.html?pasta=http://127.0.0.1:{porta}/")
    print("(com o app rodando: cd app && npm run dev). Ctrl+C para parar.")
    servidor.serve_forever()


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Serve pacotes de planta para a bancada do app.")
    ap.add_argument("pasta")
    ap.add_argument("--fichas", action="append", default=[], help="arquivo de fichas (pode repetir)")
    ap.add_argument("--historico", help="histórico do sistema oficial (formato historico.json; ex. a saída de um galho de pipeline/integracoes/)")
    ap.add_argument("--sistema-oficial", help="id do sistema oficial da obra (um galho de app/src/integracoes/)")
    ap.add_argument("--porta", type=int, default=8766)
    args = ap.parse_args(argv)
    pasta = pathlib.Path(args.pasta).resolve()
    if not pasta.is_dir():
        print(f"PROBLEMA: pasta não encontrada: {pasta}")
        return 1
    fichas = ler_fichas(args.fichas or [str(AQUI.parent / "legado" / "itens_fvs.exemplo.json")])
    indice = montar_indice(pasta)
    print(f"{len(indice['pavimentos'])} pavimentos, {sum(len(p['plantas']) for p in indice['pavimentos'])} plantas, {len(fichas)} fichas")
    try:
        servir(pasta, fichas, args.porta, pathlib.Path(args.historico) if args.historico else None, sistema_oficial.validar(args.sistema_oficial))
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
