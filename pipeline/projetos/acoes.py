"""Lista de ações da rotina de revisões: Imprimir / Entregar / Recolher / Atualizar escritório / Conferir.

Função pura: recebe o que o importador já leu do banco (como dicionários simples) e devolve texto.
Sem revisão nova, a primeira linha é "Sem revisão nova. Verificado em dd/mm/aaaa hh:mm." (regra 10
da rotina); as pendências antigas (recolher, conferir) continuam listadas abaixo.
"""

from __future__ import annotations

import datetime as dt


def _data(d: dt.datetime | None) -> str:
    return d.strftime("%d/%m/%Y %H:%M") if d else "data desconhecida"


def _rev(fase: str, numero: str) -> str:
    return f"{fase} R{numero}"


def montar_relatorio(agora: dt.datetime, novas: list[dict], situacoes: list[dict], escritorio: list[dict],
                     invalidos: list[str], avisos: list[str] | tuple[str, ...] = ()) -> str:
    """Monta o relatório do dia.

    novas:      [{chave, titulo, disciplina, fase, numero, anterior ("EX R05" ou None), cadastrada_em,
                  cadastrada_por, link_pasta, observacoes}]
    situacoes:  [{chave, empresa, situacao, revisao_em_campo, revisao_vigente, entregas_abertas}]
    escritorio: [{chave, revisao_escritorio, revisao_vigente, atualizado}]
    invalidos:  nomes de arquivo fora da máscara, vindos do CSV
    avisos:     outras coisas a conferir (texto livre)
    """
    hora = agora.strftime("%d/%m/%Y %H:%M")
    linhas: list[str] = []
    por_chave_esc = {e["chave"]: e for e in escritorio}

    if not novas:
        linhas.append(f"Sem revisão nova. Verificado em {hora}.")
    else:
        linhas.append(f"Revisões do Autodoc: verificado em {hora}.")
        linhas.append("")
        linhas.append(f"REVISÕES NOVAS ({len(novas)})")
        for n in sorted(novas, key=lambda x: ((x.get("disciplina") or ""), x["chave"])):
            titulo = f" — {n['titulo']}" if n.get("titulo") else ""
            linhas.append(f"- [{n.get('disciplina') or '?'}] {n['chave']}{titulo}")
            anterior = n.get("anterior") or "primeira revisão"
            por = f" por {n['cadastrada_por']}" if n.get("cadastrada_por") else ""
            linhas.append(f"  {anterior} → {_rev(n['fase'], n['numero'])} · publicada em {_data(n.get('cadastrada_em'))}{por}")
            if n.get("observacoes"):
                linhas.append(f"  Alteração: {n['observacoes']}")
            if n.get("link_pasta"):
                linhas.append(f"  Pasta: {n['link_pasta']}")
            recolher = [s for s in situacoes if s["chave"] == n["chave"] and s["situacao"] == "RECOLHER"]
            ok = [s for s in situacoes if s["chave"] == n["chave"] and s["situacao"] == "OK"]
            if recolher:
                linhas.append("  Com revisão antiga em campo: " + ", ".join(f"{s['empresa']} ({s['revisao_em_campo']})" for s in recolher))
            if ok:
                linhas.append("  Já com a vigente: " + ", ".join(s["empresa"] for s in ok))
            esc = por_chave_esc.get(n["chave"])
            if esc is None:
                linhas.append("  Escritório: sem registro da revisão que está na pasta")
            elif not esc.get("atualizado"):
                linhas.append(f"  Escritório: pasta tem {esc.get('revisao_escritorio') or '—'}, precisa atualizar")
            else:
                linhas.append("  Escritório: pasta atualizada")

    # Imprimir / Entregar: a vigente nova para quem está com a antiga
    entregar: list[str] = []
    for n in novas:
        for s in situacoes:
            if s["chave"] == n["chave"] and s["situacao"] == "RECOLHER":
                entregar.append(f"- {n['chave']} {_rev(n['fase'], n['numero'])} → {s['empresa']} (tem {s['revisao_em_campo']})")

    recolher = [f"- {s['empresa']}: {s['chave']} {s['revisao_em_campo']} (vigente {s['revisao_vigente']})"
                for s in situacoes if s["situacao"] == "RECOLHER"]

    atualizar: list[str] = []
    for e in escritorio:
        if not e.get("atualizado"):
            atualizar.append(f"- {e['chave']}: pasta tem {e.get('revisao_escritorio') or '—'}, vigente {e.get('revisao_vigente') or '—'}")
    for n in novas:
        if n["chave"] not in por_chave_esc:
            atualizar.append(f"- {n['chave']}: sem registro da revisão na pasta do escritório (vigente {_rev(n['fase'], n['numero'])})")

    conferir: list[str] = []
    for s in situacoes:
        if s["situacao"] != "CONFERIR":
            continue
        if (s.get("entregas_abertas") or 0) >= 2:
            conferir.append(f"- {s['empresa']}: {s['chave']} com {s['entregas_abertas']} entregas abertas")
        elif not s.get("revisao_vigente"):
            conferir.append(f"- {s['empresa']}: {s['chave']} sem revisão vigente no Autodoc (em campo: {s.get('revisao_em_campo') or '—'})")
        else:
            conferir.append(f"- {s['empresa']}: {s['chave']} ({s.get('revisao_em_campo') or '—'}), conferir")
    conferir += [f"- Arquivo fora do padrão no Autodoc: {nome}" for nome in invalidos]
    conferir += [f"- {a}" for a in avisos]

    for titulo, itens in (("IMPRIMIR / ENTREGAR", entregar), ("RECOLHER", recolher),
                          ("ATUALIZAR ESCRITÓRIO", atualizar), ("CONFERIR", conferir)):
        if itens:
            linhas.append("")
            linhas.append(f"{titulo} ({len(itens)})")
            linhas.extend(itens)

    return "\n".join(linhas)
