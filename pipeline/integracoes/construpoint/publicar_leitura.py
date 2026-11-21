"""Publica no servidor do Sistema Obra uma leitura completa do Construpoint já salva no PC (módulo FVS).

Uso (no PC, na raiz do repositório):
    py pipeline/integracoes/construpoint/publicar_leitura.py PASTA_DA_LEITURA --obra TESTE --so-conferir
    py pipeline/integracoes/construpoint/publicar_leitura.py PASTA_DA_LEITURA --obra EXE --fichas-com-peca EXE-PVS-001,EXE-PVS-002 --empresa-autorizou

NÃO acessa o Construpoint: lê os arquivos da pasta (leitura.py diz quais) e grava no Supabase:
    locais_sistema     todos os locais de lá
    fvs_fichas_campo   todas as fichas abertas, com local_id (e a peça, quando é pilar ou viga da planta)
    fvs_eventos        só os itens verificados de fichas com peça na planta
    importacoes        uma linha com as contagens desta leitura
As fichas modelo do servidor não mudam (publicar_fichas.py continua sendo o caminho delas).
Publicar de novo não duplica: os ids saem dos ids de lá e o que já existe fica como está.
Login igual ao do app (gestor da obra). Sem chave secreta. Registro de obra real só com --empresa-autorizou.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import pathlib
import sys

AQUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))
sys.path.insert(0, str(AQUI.parent.parent))
sys.path.insert(0, str(AQUI.parent.parent / "fvs"))
sys.path.insert(0, str(AQUI.parent.parent / "projetos"))

import importar_construpoint as ic  # noqa: E402
import leitura  # noqa: E402

COLUNAS_NOVAS = ("local_id", "agendada_em", "reinspecao_em", "medicao")


def linhas_para_enviar(h: dict, fichas: list[dict], pavimentos: list[dict], elementos: list[dict]) -> dict:
    """Junta o que a leitura montou com os ids do servidor (publicar_historico.resolver) e as colunas da v1.7."""
    from publicar_historico import resolver

    r = resolver(h, fichas, pavimentos, elementos)
    extra = {f["id"]: {k: f.get(k) for k in COLUNAS_NOVAS} for f in h["fichas_campo"]}
    for f in r["fichas"]:
        f.update(extra[f["id"]])
    return {"locais": h["locais"], "fichas": r["fichas"], "eventos": r["eventos"], "fora": r["fora"]}


def linha_importacao(obra: str, lido_em: str, contagens: dict) -> dict:
    return {"id": ic.novo_id(obra, "importacao", f"{leitura.SISTEMA}|{lido_em}"), "sistema": leitura.SISTEMA,
            "lida_em": lido_em, "contagens": contagens,
            "observacao": "Leitura completa do Construpoint (só leitura lá). Verificações fora da planta ficam só nas contagens das fichas."}


def main(argv: list[str] | None = None) -> int:
    from exportar_obra import CHAVE_PADRAO, URL_PADRAO, ErroExportacao, Supabase

    ap = argparse.ArgumentParser(description="Publica no servidor uma leitura completa do Construpoint já salva no PC.")
    ap.add_argument("pasta", help="pasta da leitura (cp_locais.json, cp_mapa_fvs.json, cp_fvs_inspecoes.json, cp_fvs_verificacoes.json)")
    ap.add_argument("--obra", required=True, help="código da obra no Sistema Obra")
    ap.add_argument("--fichas-com-peca", default="EXE-PVS-001,EXE-PVS-002", help="códigos das fichas de pilar e de viga (nessa ordem)")
    ap.add_argument("--so-conferir", action="store_true", help="só mostra o que entraria; não grava nada")
    ap.add_argument("--empresa-autorizou", action="store_true", help="obrigatório para gravar registros de obra real")
    ap.add_argument("--email")
    ap.add_argument("--url", default=URL_PADRAO)
    ap.add_argument("--chave", default=CHAVE_PADRAO)
    args = ap.parse_args(argv)
    codigos = [c.strip() for c in args.fichas_com_peca.split(",") if c.strip()]
    ic.FICHA_DO_TIPO.update(dict(zip(("P", "V"), codigos)))
    obra = args.obra.upper()
    try:
        if obra != "TESTE" and not args.so_conferir and not args.empresa_autorizou:
            raise ic.ErroImportacao(f"registros da {obra} só sobem com --empresa-autorizou.")
        dados = leitura.ler_pasta(pathlib.Path(args.pasta))
        import sessao_local
        from publicar_historico import enviar, fichas_vigentes
        from publicar_planta import Servidor, entrar

        sb = Supabase(args.url, args.chave)
        entrar(sb, args.email)
        srv = Servidor(sb, sessao_local.dispositivo_id())
        o = srv.obra(obra)
        filtro = {"obra_id": f"eq.{o['id']}"}
        fichas, pavimentos, elementos = (srv.obter(t, filtro) for t in ("fichas_modelo", "pavimentos", "elementos"))
        h = leitura.montar_leitura(obra, dados, fichas_vigentes(fichas), pavimentos, elementos, set(codigos))
        r = linhas_para_enviar(h, fichas, pavimentos, elementos)
        contagens = {"locais": len(r["locais"]), "fichas": len(r["fichas"]),
                     "fichas_com_peca": sum(1 for f in r["fichas"] if f["elemento_id"]),
                     "verificacoes_lidas": h["resumo"]["verificacoes_lidas"], "fvs_eventos": len(r["eventos"])}
        print(json.dumps({**h["resumo"], "fora_ao_ligar_no_servidor": r["fora"], "publica": contagens}, ensure_ascii=False, indent=1))
        if args.so_conferir:
            print("Só conferência: nada foi gravado.")
            return 0
        base = srv._base(o["id"])
        enviar(sb, base, "locais_sistema", r["locais"])
        enviar(sb, base, "fvs_fichas_campo", r["fichas"])
        enviar(sb, base, "fvs_eventos", r["eventos"])
        lido_em = dados.get("lido_em") or dt.datetime.now(dt.timezone.utc).isoformat()
        enviar(sb, base, "importacoes", [linha_importacao(obra, lido_em, contagens)])
        print("Pronto. Quem abrir o app recebe na próxima sincronização.")
    except (ic.ErroImportacao, ErroExportacao, FileNotFoundError, KeyError) as e:
        print(f"PROBLEMA: {e}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
