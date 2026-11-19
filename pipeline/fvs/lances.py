"""Lance do detalhe de pilar: de que nível a que nível vai, e o que isso diz sobre o pavimento.

O quadro do detalhe de pilar traz os níveis escritos ("Fundação", "Subsolo", "Pilotis"...). O pilar de
um pavimento é o de baixo: o lance que termina no pavimento (decisão do Nicolas, 17/11/2026). Assim:

  - termina: o lance termina no pavimento. É o pilar do pavimento e tem ficha.
  - nasce: o lance começa no pavimento (arranque). Fica na planta só com o detalhe, sem ficha.
  - passa: o lance começa abaixo e termina acima, e o detalhe não está numa prancha deste pavimento
    (o projetista desenhou o pilar só nas pranchas de baixo e de cima). Não é conferido aqui: sai da planta.
  - passa_com_detalhe: o lance passa, mas o detalhe está numa prancha deste pavimento (ex.: PILMEZANIN
    com o lance Pilotis > 2º). É conferido aqui e tem ficha (ajuste do Nicolas, 17/11/2026: o que vale é
    ter detalhe no pavimento).
  - sai_da_fundacao: o lance começa na fundação e o pavimento é o primeiro acima dela (ex.: Subsolo com
    o lance Fundação > Térreo, ou só "Fundação" legível no quadro). Fica com ficha no pavimento, mesmo com o
    detalhe só na prancha de cima (decisão do Nicolas, 18/11/2026: a obra confere esses pilares no Subsolo).
  - fora: o lance é todo de outros pavimentos (detalhe errado): sai da planta.
  - sem_lance: menos de dois níveis lidos; não dá para saber e fica como antes (com ficha).

A ordem dos pavimentos vem de montar_pavimentos.PAVIMENTOS (dado da obra, não do app).
"""

from __future__ import annotations

import re
import unicodedata

from montar_pavimentos import PAVIMENTOS, ler_codigo, pavimento_do_nome

NIVEL_FUNDACAO = 0

# ordem de preferência quando o mesmo nome tem mais de um detalhe lido para o pavimento
PREFERENCIA = ("termina", "sai_da_fundacao", "passa_com_detalhe", "sem_lance", "nasce", "passa", "fora")


def _sem_acento(t: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", t) if unicodedata.category(c) != "Mn").upper()


def ordem_do_nivel(texto: str) -> int | None:
    """Texto de nível escrito no detalhe -> ordem do pavimento (Fundação = 0). None se não for nível."""
    t = _sem_acento(texto).strip()
    if re.fullmatch(r"FUNDACAO|BLOCOS?|ARRANQUE", t):
        return NIVEL_FUNDACAO
    tipo = re.fullmatch(r"(\d)\s*[°ºO]?\s*(PAV\w*)(\s+TIPO)?", t)
    if tipo:
        return next((o for _, p, o in PAVIMENTOS if p.startswith(tipo.group(1) + "º")), None)
    if len(t) > 25:  # frase, não nível
        return None
    for rx, _, o in PAVIMENTOS:
        if rx.pattern in ("SUBSOLO", "TERREO|COMERCI", "PILOTIS", "MEZANIN", "COBERTU") and re.match(rx.pattern, t):
            return o
    return None


def ordem_do_pavimento(nome: str) -> int | None:
    return next((o for _, p, o in PAVIMENTOS if p == nome), None)


def nome_do_nivel(o: int) -> str:
    return "Fundação" if o == NIVEL_FUNDACAO else next((p for _, p, oo in PAVIMENTOS if oo == o), str(o))


def texto_do_lance(niveis: list[int]) -> str:
    return " > ".join(nome_do_nivel(o) for o in niveis)


PRIMEIRO_PAVIMENTO = min(o for _, _, o in PAVIMENTOS)


def situacao(niveis: list[int], ordem_pav: int | None) -> str:
    """termina, sai_da_fundacao, nasce, passa, fora ou sem_lance (ver o topo do arquivo)."""
    if (ordem_pav == PRIMEIRO_PAVIMENTO and niveis and niveis[0] == NIVEL_FUNDACAO and ordem_pav not in niveis
            and (len(niveis) == 1 or niveis[-1] > ordem_pav)):
        return "sai_da_fundacao"
    if ordem_pav is None or len(niveis) < 2:
        return "sem_lance"
    ini, fim = niveis[0], niveis[-1]
    if ordem_pav in niveis[1:]:
        # um quadro pode ter três níveis (Fundação > Subsolo > Pilotis): termina se o pavimento é um dos de cima
        return "termina"
    if ini == ordem_pav:
        return "nasce"
    if ini < ordem_pav < fim:
        return "passa"
    return "fora"


def pavimento_da_prancha(prancha: str | None) -> str | None:
    """Pavimento do nome da prancha ("X.ES.LO.268.PILMEZANIN-R00" -> "Mezanino"); None se não der para saber."""
    if not prancha:
        return None
    base = re.split(r"[\\/]", str(prancha))[-1]
    base = re.sub(r"\.pdf$", "", base, flags=re.I)
    c = ler_codigo(base)
    return pavimento_do_nome(c["nome"] if c else base)


def escolher(candidatos: list[dict], ordem_pav: int | None, pavimento: str | None = None) -> tuple[dict, str] | None:
    """Entre os detalhes lidos com o mesmo nome (cada um com "niveis" e "quadro"), o que vale no pavimento.
    Detalhe em quadro ganha do recortado pelo desenho; depois, a ordem de PREFERENCIA. Com o nome do
    pavimento, o lance que passa vira passa_com_detalhe quando a prancha do detalhe é deste pavimento."""
    if not candidatos:
        return None
    com_quadro = [c for c in candidatos if c.get("quadro")] or candidatos

    def sit(c):
        s = situacao(c.get("niveis") or [], ordem_pav)
        if s == "passa" and pavimento and pavimento_da_prancha(c.get("prancha")) == pavimento:
            return "passa_com_detalhe"
        return s
    # empate: vale o último lido, como no gerador da obra
    melhor = min(((c, sit(c)) for c in reversed(com_quadro)), key=lambda x: PREFERENCIA.index(x[1]))
    return melhor
