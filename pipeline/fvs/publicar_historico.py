"""Publica no servidor do Sistema Obra o histórico do sistema oficial (historico.json, módulo FVS).

Uso (no PC, na raiz do repositório):
    py pipeline/fvs/publicar_historico.py historico.json --obra TESTE --so-conferir   (só mostra o que entraria)
    py pipeline/fvs/publicar_historico.py historico.json --obra EXE --empresa-autorizou

NÃO acessa o sistema oficial: lê o arquivo do PC e escreve no Supabase do Sistema Obra.
Precisa antes: a migração 20261105120000_fvs_fichas_campo.sql aplicada, as fichas publicadas
(publicar_fichas.py) e as plantas publicadas (publicar_planta.py), porque é de lá que saem as peças.

Registros de obra real só sobem depois do ok por escrito da empresa: sem --empresa-autorizou, o script recusa.
Publicar de novo não duplica: os ids saem dos ids do sistema oficial e o que já existe fica como está.
Login igual ao do app; a pessoa tem que ser admin ou gestor da obra. Sem chave secreta.

A parte que decide o que entra é só biblioteca padrão: testada em pipeline/testes/test_fvs_historico.py.
"""

from __future__ import annotations

import argparse
import collections
import datetime as dt
import json
import pathlib
import sys

AQUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))
sys.path.insert(0, str(AQUI.parent))
sys.path.insert(0, str(AQUI.parent / "projetos"))

LOTE = 500
COLUNAS_DA_FICHA = ("id", "codigo", "construpoint_id", "local_construpoint", "ficha_codigo", "ficha_titulo", "status",
                    "inspetor", "parceiro", "atualizada_em", "qtd_a", "qtd_r", "qtd_na")


class ErroHistorico(Exception):
    pass


def _revisao(texto) -> tuple:
    digitos = "".join(c for c in str(texto or "") if c.isdigit())
    return (int(digitos) if digitos else -1, str(texto or ""))


def fichas_vigentes(fichas: list[dict]) -> dict[str, dict]:
    """A maior revisão de cada código, como o app escolhe."""
    por_codigo: dict[str, dict] = {}
    for f in fichas:
        if f.get("apagado"):
            continue
        atual = por_codigo.get(f["codigo"])
        if atual is None or _revisao(f.get("revisao")) > _revisao(atual.get("revisao")):
            por_codigo[f["codigo"]] = f
    return por_codigo


def resolver(historico: dict, fichas: list[dict], pavimentos: list[dict], elementos: list[dict]) -> dict:
    """Troca nomes pelos ids do servidor. Devolve as linhas prontas e a conta do que ficou de fora.

    Ficha cuja peça ainda não está em "elementos" (planta não publicada) entra na lista sem peça, e os
    registros dela ficam de fora até publicar a planta e rodar de novo.
    """
    vigentes = fichas_vigentes(fichas)
    itens = {c: {int(i["n"]) for i in f.get("itens") or []} for c, f in vigentes.items()}
    id_do_pavimento = {p["nome"].strip().lower(): p["id"] for p in pavimentos if not p.get("apagado")}
    pecas = {(e["pavimento_id"], e["tipo"], e["nome"].upper()): e["id"] for e in elementos if not e.get("apagado")}
    fora = collections.Counter()
    linhas_fichas: list[dict] = []
    ligadas: dict[str, tuple[str, str]] = {}
    for f in historico["fichas_campo"]:
        elemento = ficha = None
        if f.get("nome"):
            pav = id_do_pavimento.get(str(f.get("pavimento") or "").strip().lower())
            elemento = pecas.get((pav, f.get("tipo"), f["nome"].upper())) if pav else None
            if elemento is None:
                fora["ficha com peça que não está no servidor (publique a planta)"] += 1
        modelo = vigentes.get(f.get("ficha_codigo"))
        if modelo is not None:
            ficha = modelo["id"]
        elif f.get("nome"):
            fora["ficha modelo que não está no servidor (publique as fichas)"] += 1
        if elemento and ficha:
            ligadas[f["id"]] = (elemento, ficha)
        linhas_fichas.append({**{k: f.get(k) for k in COLUNAS_DA_FICHA}, "elemento_id": elemento, "ficha_id": ficha if elemento else None})
    linhas_eventos: list[dict] = []
    for e in historico["eventos"]:
        ligada = ligadas.get(e["ficha_campo_id"])
        if ligada is None:
            fora["registro de ficha fora da planta"] += 1
            continue
        if e["item"] not in itens.get(e["ficha_codigo"], set()):
            fora["registro de item que não está na ficha do servidor"] += 1
            continue
        linhas_eventos.append({
            "id": e["id"],
            "elemento_id": ligada[0],
            "ficha_id": ligada[1],
            "ficha_campo_id": e["ficha_campo_id"],
            "item": e["item"],
            "resultado": e["resultado"],
            "rodada": e["rodada"],
            "observacao": e["observacao"],
            "verificado_por": e["verificado_por"],
            "origem_id": e["origem_id"],
            "criado_em_dispositivo": e["criado_em"],
        })
    return {"fichas": linhas_fichas, "eventos": linhas_eventos, "fora": dict(fora)}


def enviar(sb, base: dict, tabela: str, linhas: list[dict], avisar=print) -> None:
    """Grava em lotes. O que já existe (mesmo id) fica como está: rodar de novo não duplica."""
    for i in range(0, len(linhas), LOTE):
        lote = [{**base, **l} for l in linhas[i:i + LOTE]]
        sb.json("POST", f"/rest/v1/{tabela}?on_conflict=id", lote, {"Prefer": "resolution=ignore-duplicates,return=minimal"})
        avisar(f"  {tabela}: {min(i + LOTE, len(linhas))} de {len(linhas)}")


def main(argv: list[str] | None = None) -> int:
    from exportar_obra import CHAVE_PADRAO, URL_PADRAO, ErroExportacao, Supabase

    ap = argparse.ArgumentParser(description="Publica no servidor o histórico do sistema oficial já montado no PC.")
    ap.add_argument("arquivo", help="historico.json (gerado por um galho de pipeline/integracoes/)")
    ap.add_argument("--obra", required=True, help="código da obra no Sistema Obra")
    ap.add_argument("--so-conferir", action="store_true", help="só mostra o que entraria; não grava nada")
    ap.add_argument("--empresa-autorizou", action="store_true", help="o ok por escrito da empresa já chegou (obrigatório para gravar registros da EXE)")
    ap.add_argument("--email")
    ap.add_argument("--url", default=URL_PADRAO)
    ap.add_argument("--chave", default=CHAVE_PADRAO)
    args = ap.parse_args(argv)
    try:
        historico = json.loads(pathlib.Path(args.arquivo).read_text(encoding="utf-8"))
        obra = args.obra.upper()
        if historico.get("obra", "").upper() != obra:
            raise ErroHistorico(f"este histórico é da obra {historico.get('obra')}, não da {obra}")
        if obra != "TESTE" and not args.so_conferir and not args.empresa_autorizou:
            raise ErroHistorico(f"registros da {obra} só sobem depois do ok por escrito da empresa. Quando chegar, rode com --empresa-autorizou.")
        import sessao_local
        from publicar_planta import Servidor, entrar

        sb = Supabase(args.url, args.chave)
        entrar(sb, args.email)
        srv = Servidor(sb, sessao_local.dispositivo_id())
        o = srv.obra(obra)
        filtro = {"obra_id": f"eq.{o['id']}"}
        r = resolver(historico, srv.obter("fichas_modelo", filtro), srv.obter("pavimentos", filtro), srv.obter("elementos", filtro))
        print(f"{len(r['fichas'])} fichas e {len(r['eventos'])} registros para a obra {obra}.")
        for motivo, n in sorted(r["fora"].items()):
            print(f"  fora: {n} {motivo}")
        if args.so_conferir:
            print("Só conferência: nada foi gravado.")
            return 0
        base = srv._base(o["id"])
        agora = dt.datetime.now(dt.timezone.utc).isoformat()
        enviar(sb, {**base, "criado_em_dispositivo": agora}, "fvs_fichas_campo", r["fichas"])
        enviar(sb, base, "fvs_eventos", r["eventos"])
        print("Pronto. Quem abrir o app recebe o histórico na próxima sincronização.")
    except (ErroHistorico, ErroExportacao, FileNotFoundError) as e:
        print(f"PROBLEMA: {e}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
