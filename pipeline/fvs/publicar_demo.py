"""Planta e fichas de mentira na obra TESTE, para testar a FVS no celular de verdade.

Dado de obra real só vai ao servidor com o ok da empresa. Aqui nada é de obra nenhuma: a "prancha" é uma grade
desenhada por este script e as fichas têm texto genérico. Serve para o teste no celular e para a
demonstração enquanto o ok não vem.

Uso (no PC, na raiz do repositório):
    py pipeline/fvs/publicar_demo.py                       publica na obra TESTE, no Térreo
    py pipeline/fvs/publicar_demo.py --revisao R01         publica a revisão seguinte (para ver o aviso de revisão nova no celular)
    py pipeline/fvs/publicar_demo.py --pavimento "2º Pavimento"
    py pipeline/fvs/publicar_demo.py --so-gerar PASTA      só grava os pacotes, sem servidor (abre na bancada: bancada.py)

Antes: as migrações da FVS aplicadas no Supabase (py pipeline/fvs/conferir_servidor.py diz se faltam).
Login: o mesmo do app (código por e-mail). Precisa ser admin ou gestor da obra. Só aceita a obra TESTE.
Precisa de: pip install pillow
"""

from __future__ import annotations

import argparse
import io
import pathlib
import sys

AQUI = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))
sys.path.insert(0, str(AQUI.parent))
sys.path.insert(0, str(AQUI.parent / "projetos"))

import pacote  # noqa: E402
import publicar_fichas  # noqa: E402
import publicar_planta  # noqa: E402
from exportar_obra import CHAVE_PADRAO, URL_PADRAO, ErroExportacao, Supabase  # noqa: E402

OBRA = "TESTE"
LARGURA = 2000
ALTURA = 1300
MARGEM = 150
VAO = 300
LINHAS = 4
# dois trechos, cada um com 6 colunas: a coluna do meio aparece nos dois, como pilar de divisa de prancha
COLUNAS_DOS_TRECHOS = {"Trecho 1": range(0, 6), "Trecho 2": range(5, 11)}
COLUNAS = 11
TILE = 512
NIVEIS = [-2, -1, 0, 1]
ESCALA_MAX = 2


def _item(n: int, etapa: str, titulo: str, dispositivo: str, tolerancia: str, descricao: str = "") -> dict:
    return {"n": n, "etapa": etapa, "titulo": titulo, "descricao": descricao, "dispositivo": dispositivo, "tolerancia": tolerancia}


# Texto genérico, escrito para o teste. Não são as PVS da empresa.
FICHAS = [
    {
        "codigo": "TESTE-PVS-P",
        "titulo": "Pilares (ficha de teste)",
        "revisao": "0",
        "tipo_modelo": "TESTE",
        "aplica_a": ["P"],
        "origem": "teste",
        "itens": [
            _item(1, "CONDIÇÕES DE INÍCIO", "Local limpo e desimpedido", "Visual", "Visual"),
            _item(2, "CONDIÇÕES DE INÍCIO", "Projeto na revisão vigente", "Visual", "Visual"),
            _item(3, "MONTAGEM", "Locação conferida", "Trena", "3 mm", "Eixos conforme o projeto."),
            _item(4, "MONTAGEM", "Armadura e espaçadores", "Visual", "Conforme projeto"),
            _item(5, "MONTAGEM", "Prumo da fôrma", "Prumo", "2 mm"),
            _item(6, "CONCRETAGEM", "Concreto rastreado", "Visual", "Conforme projeto"),
            _item(7, "DESFORMA", "Sem falhas de concretagem", "Visual", "Visual"),
        ],
    },
    {
        "codigo": "TESTE-PVS-V",
        "titulo": "Vigas (ficha de teste)",
        "revisao": "0",
        "tipo_modelo": "TESTE",
        "aplica_a": ["V"],
        "origem": "teste",
        "itens": [
            _item(1, "CONDIÇÕES DE INÍCIO", "Escoramento conferido", "Visual", "Visual"),
            _item(2, "EXECUÇÃO", "Fundo e laterais da fôrma", "Trena", "3 mm"),
            _item(3, "EXECUÇÃO", "Armadura e cobrimento", "Visual", "Conforme projeto"),
            _item(4, "CONCRETAGEM", "Adensamento", "Visual", "Visual"),
        ],
    },
]


class ErroDemo(Exception):
    pass


# ---------------------------------------------------------------------------
# Parte pura (testada em pipeline/testes/test_fvs_demo.py, sem Pillow e sem servidor)
# ---------------------------------------------------------------------------

def nome_do_pilar(coluna: int, linha: int) -> str:
    return f"P{linha * COLUNAS + coluna + 1}"


def _viga_horizontal(coluna: int, linha: int) -> str:
    return f"V{linha * (COLUNAS - 1) + coluna + 1}"


def _viga_vertical(coluna: int, linha: int) -> str:
    return f"V{LINHAS * (COLUNAS - 1) + linha * COLUNAS + coluna + 1}"


def pecas_do_trecho(trecho: str) -> list[dict]:
    """Pilares e vigas do trecho, em pontos da folha. O mesmo nome em dois trechos é a mesma peça."""
    colunas = COLUNAS_DOS_TRECHOS[trecho]
    inicio = colunas[0]
    x_de = lambda c: MARGEM + (c - inicio) * VAO  # noqa: E731
    y_de = lambda ln: MARGEM + ln * VAO  # noqa: E731
    pecas = []
    for linha in range(LINHAS):
        for c in colunas:
            x, y = x_de(c), y_de(linha)
            n = linha * COLUNAS + c + 1
            pecas.append({"tipo": "P", "nome": nome_do_pilar(c, linha), "secao": "20x60" if n % 3 else "25x50",
                          "rotulo": [x + 14, y - 34, x + 60, y - 14],
                          "polys": [[[x - 10, y - 25], [x + 10, y - 25], [x + 10, y + 25], [x - 10, y + 25]]]})
    for linha in range(LINHAS):
        for c in list(colunas)[:-1]:
            x, y = x_de(c), y_de(linha)
            pecas.append({"tipo": "V", "nome": _viga_horizontal(c, linha), "secao": "14x50",
                          "rotulo": [x + 120, y - 30, x + 180, y - 12],
                          "polys": [[[x + 10, y - 7], [x + VAO - 10, y - 7], [x + VAO - 10, y + 7], [x + 10, y + 7]]]})
    for linha in range(LINHAS - 1):
        for c in colunas:
            x, y = x_de(c), y_de(linha)
            pecas.append({"tipo": "V", "nome": _viga_vertical(c, linha), "secao": "14x50",
                          "rotulo": [x + 12, y + 140, x + 60, y + 158],
                          "polys": [[[x - 7, y + 25], [x + 7, y + 25], [x + 7, y + VAO - 25], [x - 7, y + VAO - 25]]]})
    return pecas


def prancha_do_trecho(trecho: str, revisao: str) -> str:
    return f"TESTE.ES.LO.{list(COLUNAS_DOS_TRECHOS).index(trecho) + 1:03d}.FOR-{revisao}"


def montar_demo(revisao: str, pavimento: str, desenho) -> tuple[dict, dict, list[dict]]:
    """(cfg, detalhes, formas) nos formatos de publicar_planta. desenho: quem faz as imagens."""
    formas = []
    detalhes: dict = {"P": {}, "V": {}}
    for trecho in COLUNAS_DOS_TRECHOS:
        pecas = pecas_do_trecho(trecho)
        prancha = prancha_do_trecho(trecho, revisao)
        formas.append({"trecho": trecho, "prancha": prancha, "revisao": revisao, "largura": LARGURA, "altura": ALTURA,
                       "tile": TILE, "niveis": list(NIVEIS), "tiles": desenho.tiles(pecas, prancha), "pecas": pecas})
        for p in pecas:
            # os pilares têm detalhe e tabela de aço; das vigas, só uma em cada duas, para ver os dois casos
            numero = int(p["nome"][1:])
            if p["nome"] in detalhes[p["tipo"]] or (p["tipo"] == "V" and numero % 2):
                continue
            detalhes[p["tipo"]][p["nome"]] = {
                "chave": pacote.chave_de_detalhe(p["tipo"], p["nome"]),
                "titulo": p["nome"],
                "prancha": f"TESTE.ES.LO.{'010' if p['tipo'] == 'P' else '020'}.DET-{revisao}",
                "img": desenho.detalhe(p),
                "aco": desenho.aco(p) if p["tipo"] == "P" else None,
            }
    cfg = {"obra": OBRA, "pavimento": pavimento, "formas": [], "det_pilares": [], "det_vigas": [], "ambientes": None}
    return cfg, detalhes, formas


def publicar_tudo(srv, revisao: str, pavimento: str, desenho) -> list[dict]:
    """Fichas primeiro, depois as plantas. Rodar de novo com a mesma revisão publica de novo por cima."""
    cfg, detalhes, formas = montar_demo(revisao, pavimento, desenho)
    if cfg["obra"] != OBRA:
        raise ErroDemo("este script só publica na obra TESTE")
    obra = srv.obra(OBRA)
    entraram = publicar_fichas.publicar(srv, obra, publicar_fichas.normalizar(FICHAS))
    print(f"{entraram} ficha(s) nova(s).")
    return publicar_planta.publicar_no_servidor(srv, cfg, detalhes, formas)


# ---------------------------------------------------------------------------
# Desenho (Pillow)
# ---------------------------------------------------------------------------

class Desenho:
    def __init__(self):
        try:
            from PIL import Image, ImageDraw, ImageFont
        except ImportError as e:
            raise ErroDemo("falta o Pillow: pip install pillow") from e
        self.Image, self.ImageDraw, self.ImageFont = Image, ImageDraw, ImageFont

    def _fonte(self, tamanho: int):
        try:
            return self.ImageFont.load_default(tamanho)
        except TypeError:  # Pillow antigo
            return self.ImageFont.load_default()

    @staticmethod
    def _webp(im) -> bytes:
        b = io.BytesIO()
        im.save(b, "WEBP", lossless=True, method=4)
        return b.getvalue()

    def tiles(self, pecas: list[dict], prancha: str) -> dict[str, bytes]:
        e = ESCALA_MAX
        im = self.Image.new("RGB", (LARGURA * e, ALTURA * e), "white")
        d = self.ImageDraw.Draw(im)
        for c in range(6):
            x = (MARGEM + c * VAO) * e
            d.line([(x, 40 * e), (x, (ALTURA - 80) * e)], fill="#bbbbbb", width=e)
        fonte = self._fonte(14 * e)
        for p in pecas:
            d.polygon([(x * e, y * e) for x, y in p["polys"][0]], fill="#555555" if p["tipo"] == "P" else "#cccccc", outline="#222222")
            d.text((p["rotulo"][0] * e, p["rotulo"][1] * e), p["nome"], fill="#111111", font=fonte)
        # sem acento: a fonte que vem com o Pillow só tem letra sem acento
        d.text((40 * e, (ALTURA - 60) * e), f"PLANTA DE TESTE, NAO E PROJETO - {prancha}", fill="#111111", font=self._fonte(26 * e))
        saida = {}
        for z in NIVEIS:
            f = (2 ** z) / e
            atual = im if f == 1 else im.resize((max(1, round(im.width * f)), max(1, round(im.height * f))), self.Image.LANCZOS)
            for ty in range(0, atual.height, TILE):
                for tx in range(0, atual.width, TILE):
                    t = self.Image.new("RGB", (TILE, TILE), "white")
                    t.paste(atual.crop((tx, ty, min(tx + TILE, atual.width), min(ty + TILE, atual.height))), (0, 0))
                    if t.convert("L").getextrema()[0] > 250:
                        continue  # tile em branco: o app desenha branco sem precisar dele
                    saida[f"{z}/{tx // TILE}/{ty // TILE}"] = self._webp(t)
        return saida

    def detalhe(self, peca: dict) -> bytes:
        im = self.Image.new("L", (600, 360), 255)
        d = self.ImageDraw.Draw(im)
        d.rectangle([40, 40, 180, 320], outline=60, width=3)
        d.text((220, 60), f"{peca['nome']} ({peca['secao']})", fill=0, font=self._fonte(26))
        d.text((220, 110), "Detalhe de teste, nao e projeto", fill=60, font=self._fonte(18))
        return self._webp(im)

    def aco(self, peca: dict) -> bytes:
        im = self.Image.new("L", (600, 140), 255)
        d = self.ImageDraw.Draw(im)
        d.rectangle([10, 10, 590, 130], outline=60, width=2)
        d.text((24, 24), f"Tabela de aco de teste: {peca['nome']}", fill=0, font=self._fonte(18))
        d.text((24, 64), "N1  4 x 10.0 mm  C = 300", fill=40, font=self._fonte(16))
        d.text((24, 94), "N2  20 x 5.0 mm  C = 150", fill=40, font=self._fonte(16))
        return self._webp(im)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Planta e fichas de mentira na obra TESTE (FVS).")
    ap.add_argument("--revisao", default="R00", help="revisão da prancha (R00, R01...): publicar a seguinte faz aparecer o aviso de revisão nova")
    ap.add_argument("--pavimento", default="Térreo", help="pavimento da obra TESTE (Térreo, 2º Pavimento ou Cobertura)")
    ap.add_argument("--so-gerar", metavar="PASTA", help="só grava os pacotes nesta pasta, sem publicar")
    ap.add_argument("--email")
    ap.add_argument("--url", default=URL_PADRAO)
    ap.add_argument("--chave", default=CHAVE_PADRAO)
    args = ap.parse_args(argv)
    try:
        desenho = Desenho()
        if args.so_gerar:
            cfg, detalhes, formas = montar_demo(args.revisao, args.pavimento, desenho)
            args.aceita_ambientes = False
            rels = publicar_planta.publicar_lidas(cfg, detalhes, formas, args)
        else:
            import sessao_local

            sb = Supabase(args.url, args.chave)
            publicar_planta.entrar(sb, args.email)
            rels = publicar_tudo(publicar_planta.Servidor(sb, sessao_local.dispositivo_id()), args.revisao, args.pavimento, desenho)
    except (ErroDemo, ErroExportacao, publicar_planta.ErroPublicacao, publicar_fichas.ErroFichas, pacote.ErroPacote) as e:
        print(f"PROBLEMA: {e}")
        return 1
    for r in rels:
        print(f"- {r['trecho']} ({r['prancha']}): {r['pilares']} pilares, {r['vigas']} vigas, {r['mb']} MB" + (f"; substituiu a planta {r['substituiu']}" if r.get("substituiu") else ""))
    if not args.so_gerar:
        print("\nNo celular: abra o app, entre na obra TESTE, FVS, e toque em Baixar.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
