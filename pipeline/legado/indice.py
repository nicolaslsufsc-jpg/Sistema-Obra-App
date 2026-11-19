"""Gera a pagina indice dos trechos (versao local completa e versao fragmento para publicar)."""
import json, os, sys, html as H

def gerar(rel, cfg, saida, data):
    itP = len(json.load(open(cfg["itens"], encoding="utf-8"))["P"]["itens"])
    itV = len(json.load(open(cfg["itens"], encoding="utf-8"))["V"]["itens"])
    linhas = ""
    for t in rel["trechos"]:
        linhas += f'''<a class="tr" href="{H.escape(t['arquivo'])}"><span class="n">{H.escape(t['trecho'])}</span><span class="c"><b>{t['pilares']}</b> pilares</span><span class="c"><b>{t['vigas']}</b> vigas</span><span class="c mb">{t['mb']:.1f} MB</span><span class="ab">Abrir</span></a>\n'''
    P, V = set(), set()
    for t in rel["trechos"]:
        h = open(os.path.join(saida, t["arquivo"]), encoding="utf-8").read()
        i = h.index("const D=") + 8
        D = json.loads(h[i:h.index("\n", i)].rstrip(";"))
        for e in D["elementos"].values():
            (P if e["tipo"] == "P" else V).add(e["nome"])
    totp, totv = len(P), len(V)
    corpo = f'''<title>FVS {H.escape(cfg['obra'])} {H.escape(cfg['pavimento'])}</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>
/* Indice de campo: lista direta dos trechos, sem enfeite, legivel no sol. Tema claro de proposito (igual ao app). */
:root{{color-scheme:light;--bg:#f3f3f0;--card:#fff;--tx:#1b1c1e;--tx2:#5b5d61;--ln:#d8d8d3;--ac:#1b5fa8;--acbg:#e3edf8;--font:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}}
body{{margin:0;background:var(--bg);color:var(--tx);font:15px/1.5 var(--font)}}
main{{max-width:760px;margin:0 auto;padding-block:28px 40px;padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}}
.ey{{font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--tx2);margin:0}}
h1{{font-size:26px;margin:4px 0 6px;letter-spacing:-.01em;text-wrap:balance}}
.sub{{color:var(--tx2);margin:0 0 20px}}
.lista{{display:flex;flex-direction:column;gap:8px;margin-bottom:26px}}
.tr{{display:grid;grid-template-columns:minmax(0,1.4fr) repeat(3,minmax(0,1fr)) auto;align-items:center;gap:10px;background:var(--card);border:1px solid var(--ln);border-radius:10px;padding:14px 14px;text-decoration:none;color:inherit;font-variant-numeric:tabular-nums}}
.tr:hover{{border-color:var(--ac)}}
.tr:focus-visible{{outline:2px solid var(--ac);outline-offset:2px}}
.n{{font-weight:700;font-size:17px}}
.c{{color:var(--tx2);font-size:14px}}.c b{{color:var(--tx)}}
.ab{{background:var(--ac);color:#fff;border-radius:8px;padding:8px 14px;font-weight:600;font-size:14px}}
h2{{font-size:15px;margin:22px 0 6px}}
ul{{margin:0;padding-left:20px;color:var(--tx)}}
li{{margin:3px 0}}
.nota{{font-size:13px;color:var(--tx2);border-top:1px solid var(--ln);margin-top:26px;padding-top:12px}}
@media (max-width:520px){{.tr{{grid-template-columns:minmax(0,1fr) auto auto;row-gap:2px}}.n{{grid-column:1/2}}.mb{{display:none}}.ab{{grid-row:1/3;grid-column:3}}.tr .c{{grid-row:2}}}}
</style>
<main>
<p class="ey">{H.escape(cfg['obra'])}{' · ' + H.escape(cfg['nome_obra']) if cfg.get('nome_obra') else ''}</p>
<h1>Conferência de pilares e vigas · {H.escape(cfg['pavimento'])}</h1>
<p class="sub">{totp} pilares e {totv} vigas em {len(rel["trechos"])} trechos. Quem fica na emenda entre dois trechos aparece nos dois. Toque no elemento na planta para ver o detalhe, a tabela de aço e a ficha.</p>
<div class="lista">
{linhas}</div>
<h2>Como usar em obra</h2>
<ul>
<li>Abra sempre o mesmo arquivo, no mesmo navegador. As marcações ficam guardadas nesse navegador.</li>
<li>Escolha Pilares ou Vigas no topo. O filtro de etapa pinta a planta só pelos itens daquela etapa.</li>
<li>Cada C, NC ou NA grava a hora do toque. Tocar de novo no mesmo botão desmarca.</li>
<li>No fim do dia, toque em Exportar e salve o CSV. Em Mais, faça o backup completo.</li>
</ul>
<h2>Fichas usadas</h2>
<ul><li>Pilares: {itP} itens. Vigas: {itV} itens. Texto do arquivo de fichas da obra.</li></ul>
<p class="nota">Gerado em {data} a partir das {H.escape(cfg.get('nota_pranchas', 'pranchas do config'))}. Se sair revisão nova de projeto, gere o app de novo.</p>
</main>'''
    completo = '<!doctype html>\n<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n' + corpo.replace('</style>\n<main>', '</style></head><body>\n<main>', 1) + '\n</body></html>'
    open(os.path.join(saida, cfg.get("indice", "00_indice.html")), "w", encoding="utf-8").write(completo)
    return corpo

if __name__ == "__main__":
    cfg = json.load(open(sys.argv[1], encoding="utf-8"))
    rel = json.load(open(os.path.join(cfg["saida"], "relatorio_geracao.json"), encoding="utf-8"))
    frag = gerar(rel, cfg, cfg["saida"], sys.argv[2])
    open(sys.argv[3], "w", encoding="utf-8").write(frag)
