"""Leitor do CSV que a página Relatórios do Autodoc (Projetos) exporta.

Formato (visto em 03/11/2026): UTF-8 com BOM, separador vírgula, campos entre aspas, três
linhas de cabeçalho ("... - Relatório de Arquivos", "Emissor: ...", "Data de emissão: dd/mm/aaaa hh:mm")
e depois a linha de colunas (COLUNAS). Uma linha por arquivo: a mesma prancha aparece em
.dwg e em .pdf. Datas em dd/mm/aaaa hh:mm, hora local.

Só biblioteca padrão. Não fala com a rede: recebe um caminho e devolve objetos.
"""

from __future__ import annotations

import csv
import datetime as dt
import re
from dataclasses import dataclass

COLUNAS = (
    "Código", "Extensão", "Revisão", "Título", "Tamanho", "Data de Cadastro", "Cadastrado por",
    "Data de Última Atualização Geral", "Data de Atualização do Status", "Status", "Obsoleto",
    "Data Obsoleto", "Pasta", "Link da Pasta", "Projeto", "Disciplina", "Fase", "Cor de Impressão",
    "Observações",
)

# Máscara do Autodoc: OBRA.DISCIPLINA.FASE.NÚMERO.CÓDIGO-RNN.extensão
# Ex.: EXE.ES.LO.112.FORPILOTIS-R02.pdf
MASCARA = re.compile(r"^([A-Z0-9]+)\.([A-Z]{2,3})\.([A-Z]{2})\.([0-9]{3,4})\.([A-Z0-9]{1,10})-R([0-9]{2})\.([A-Za-z0-9]+)$")


class ErroLista(Exception):
    """O arquivo não é o relatório esperado (cabeçalho diferente, colunas faltando)."""


@dataclass(frozen=True)
class Codigo:
    obra: str
    disciplina: str
    fase: str
    numero: str
    nome: str
    revisao: str
    extensao: str

    @property
    def chave(self) -> str:
        """Código sem fase e sem revisão: a chave de cruzamento da ficha (EXE.ES.112.FORPILOTIS)."""
        return f"{self.obra}.{self.disciplina}.{self.numero}.{self.nome}"


@dataclass
class ArquivoAutodoc:
    codigo: Codigo
    nome_arquivo: str
    titulo: str
    tamanho: str
    cadastrada_em: dt.datetime | None
    cadastrada_por: str
    atualizada_em: dt.datetime | None
    status_atualizado_em: dt.datetime | None
    status: str
    obsoleta: bool
    data_obsoleta: dt.datetime | None
    pasta: str
    link_pasta: str
    projeto: str
    disciplina_nome: str
    fase_nome: str
    observacoes: str


@dataclass
class Lista:
    emitida_em: dt.datetime | None
    arquivos: list[ArquivoAutodoc]
    invalidos: list[str]  # nomes de arquivo fora da máscara (vão para CONFERIR)


@dataclass
class RevisaoLida:
    """Uma revisão de um documento, juntando os arquivos (.dwg, .pdf) que a representam."""
    chave: str
    obra: str
    disciplina: str
    numero_documento: str
    nome: str
    fase: str
    numero: str
    titulo: str
    extensoes: str
    status: str
    obsoleta: bool
    data_obsoleta: dt.datetime | None
    cadastrada_em: dt.datetime | None
    cadastrada_por: str
    atualizada_em: dt.datetime | None
    pasta: str
    link_pasta: str
    disciplina_nome: str
    fase_nome: str
    observacoes: str


def quebrar_codigo(nome_arquivo: str) -> Codigo | None:
    m = MASCARA.match((nome_arquivo or "").strip())
    if not m:
        return None
    obra, disciplina, fase, numero, nome, revisao, extensao = m.groups()
    return Codigo(obra, disciplina, fase, numero, nome, revisao, extensao.lower())


def ler_data(texto: str) -> dt.datetime | None:
    t = (texto or "").strip()
    if not t:
        return None
    for formato in ("%d/%m/%Y %H:%M", "%d/%m/%Y %H:%M:%S", "%d/%m/%Y"):
        try:
            return dt.datetime.strptime(t, formato)
        except ValueError:
            continue
    raise ErroLista(f"Data em formato desconhecido no relatório: {t!r}")


def _emissao(celulas: list[str]) -> dt.datetime | None:
    for c in celulas:
        m = re.search(r"Data de emiss[aã]o:\s*(\d{2}/\d{2}/\d{4}(?: \d{2}:\d{2})?)", c or "")
        if m:
            return ler_data(m.group(1))
    return None


def ler_lista(caminho) -> Lista:
    with open(caminho, encoding="utf-8-sig", newline="") as f:
        linhas = list(csv.reader(f))

    emitida_em = None
    indice_colunas = None
    for i, linha in enumerate(linhas):
        if emitida_em is None:
            emitida_em = _emissao(linha)
        if linha and (linha[0] or "").strip() == COLUNAS[0]:
            indice_colunas = i
            break
    if indice_colunas is None:
        raise ErroLista(
            "O arquivo não parece o relatório de arquivos do Autodoc: não achei a linha de colunas "
            f"(a que começa com {COLUNAS[0]!r})."
        )

    cabecalho = [c.strip() for c in linhas[indice_colunas]]
    faltando = [c for c in COLUNAS if c not in cabecalho]
    if faltando:
        raise ErroLista(
            "O relatório do Autodoc mudou: falta(m) a(s) coluna(s) " + ", ".join(repr(c) for c in faltando)
            + ". Nada foi gravado. Confira a exportação ou atualize o leitor."
        )
    posicao = {nome: cabecalho.index(nome) for nome in COLUNAS}

    arquivos: list[ArquivoAutodoc] = []
    invalidos: list[str] = []
    for linha in linhas[indice_colunas + 1:]:
        if not any((c or "").strip() for c in linha):
            continue

        def col(nome: str) -> str:
            i = posicao[nome]
            return (linha[i] if i < len(linha) else "").strip()

        nome_arquivo = col("Código")
        codigo = quebrar_codigo(nome_arquivo)
        if codigo is None:
            invalidos.append(nome_arquivo)
            continue
        if col("Revisão") and col("Revisão") != codigo.revisao:
            invalidos.append(f"{nome_arquivo} (coluna Revisão diz {col('Revisão')})")
            continue
        arquivos.append(ArquivoAutodoc(
            codigo=codigo,
            nome_arquivo=nome_arquivo,
            titulo=col("Título"),
            tamanho=col("Tamanho"),
            cadastrada_em=ler_data(col("Data de Cadastro")),
            cadastrada_por=col("Cadastrado por"),
            atualizada_em=ler_data(col("Data de Última Atualização Geral")),
            status_atualizado_em=ler_data(col("Data de Atualização do Status")),
            status=col("Status"),
            obsoleta=col("Obsoleto").lower() == "sim",
            data_obsoleta=ler_data(col("Data Obsoleto")),
            pasta=col("Pasta"),
            link_pasta=col("Link da Pasta"),
            projeto=col("Projeto"),
            disciplina_nome=col("Disciplina"),
            fase_nome=col("Fase"),
            observacoes=col("Observações"),
        ))
    return Lista(emitida_em=emitida_em, arquivos=arquivos, invalidos=invalidos)


def _minimo(valores):
    v = [x for x in valores if x is not None]
    return min(v) if v else None


def _maximo(valores):
    v = [x for x in valores if x is not None]
    return max(v) if v else None


def agrupar_revisoes(arquivos: list[ArquivoAutodoc]) -> list[RevisaoLida]:
    """Junta .dwg e .pdf (e o que mais houver) da mesma revisão numa linha só, em ordem de chave."""
    grupos: dict[tuple[str, str, str], list[ArquivoAutodoc]] = {}
    for a in arquivos:
        grupos.setdefault((a.codigo.chave, a.codigo.fase, a.codigo.revisao), []).append(a)

    revisoes: list[RevisaoLida] = []
    for (chave, fase, numero), itens in sorted(grupos.items()):
        # O .pdf é o que vai para a obra: quando existe, manda nos campos descritivos.
        itens_ordenados = sorted(itens, key=lambda a: (a.codigo.extensao != "pdf", a.codigo.extensao))
        principal = itens_ordenados[0]
        c = principal.codigo
        revisoes.append(RevisaoLida(
            chave=chave,
            obra=c.obra,
            disciplina=c.disciplina,
            numero_documento=c.numero,
            nome=c.nome,
            fase=fase,
            numero=numero,
            titulo=next((a.titulo for a in itens_ordenados if a.titulo), ""),
            extensoes=",".join(sorted({a.codigo.extensao for a in itens})),
            status=principal.status,
            obsoleta=any(a.obsoleta for a in itens),
            data_obsoleta=_minimo(a.data_obsoleta for a in itens),
            cadastrada_em=_minimo(a.cadastrada_em for a in itens),
            cadastrada_por=principal.cadastrada_por,
            atualizada_em=_maximo(a.atualizada_em for a in itens),
            pasta=principal.pasta,
            link_pasta=principal.link_pasta,
            disciplina_nome=principal.disciplina_nome,
            fase_nome=principal.fase_nome,
            observacoes=next((a.observacoes for a in itens_ordenados if a.observacoes), ""),
        ))
    return revisoes
