# Obra EXE no servidor de testes

Obra fictícia completa para o app de testes (trabalho.sistema-obra-1po.pages.dev) ter o que abrir em todos os
módulos. Só dados inventados ("Obra Exemplo", "Construtora Exemplo", "Empreiteira Alfa"...), planta desenhada
por script. Script: `pipeline/demo/carga_exe.py`; testes: `pipeline/testes/test_demo_carga.py`.

## O que entra

| Módulo | Dados |
|---|---|
| Núcleo | obra EXE, 3 pavimentos (Térreo, 1º Pavimento, Cobertura sem planta), acesso de gestor para quem carrega; convite opcional (`--convidar EMAIL`, o e-mail não fica em arquivo) |
| FVS | 4 plantas (Térreo e 1º Pavimento, Trechos 1 e 2, grade do `publicar_demo.py`), 238 peças (P, V e uma laje por trecho), fichas EXE-PVS-001/002/003, 115 registros: P1 a P12 do Térreo completos, P13 com NC resolvida na 2ª rodada, P14 com NC aberta, V1 a V4, começo do 1º Pavimento |
| Concreto | concretagem dos pilares do Térreo há 30 dias (3 caminhões, CPs de 7 e 28 dias, um caminhão abaixo do fck aos 28) e das vigas e laje há 6 dias (2 caminhões, só CP de 7 dias; 28 dias "a romper"); fundações do Térreo há 45 dias: 4 estacas (S) num caminhão e 2 blocos (K) no outro, 8,5 m³ cada, ligados à mão (pedido do 24 · FUND; precisa da migração S/K, já no servidor de testes; `--sem-fundacoes` tira) |
| Projetos | 5 documentos e 8 revisões (formas do Térreo com R01 nova), 3 empresas, quem recebe, 2 entregas (uma desatualizada) |
| Documentos | 11 documentos do controle (PBQP-H) com PDF de exemplo, um vencido, um vencendo, um em revisão |
| Diário e relatórios | 3 dias (2 fechados, 1 com chuva), efetivo, equipamento, serviço, material; 2 relatórios |

## Como carregar (só no servidor de testes, tbscnqazrveiaoqgpgxs)

1. `py pipeline/demo/carga_exe.py gerar PASTA --usuario <id de um perfil do servidor de testes>` (sem rede).
2. `PASTA/carga.sql` no editor SQL do servidor de testes (ou pela ferramenta Supabase MCP). Rodar de novo não duplica.
3. Chave secreta do servidor de TESTES no `.env` da raiz: `SUPABASE_TESTES_SECRET=...`. Depois
   `py pipeline/demo/carga_exe.py enviar PASTA` (plantas e PDFs no bucket `obras`).

Travas: o script recusa qualquer endereço que não seja o do servidor de testes; toda linha da carga é da obra
EXE (o script confere antes de gerar o SQL) e o `on conflict do nothing` nunca altera linha que já existe, então
outras obras no mesmo servidor ficam intocadas; o SQL recusa se o id ou o código da EXE já forem de outra obra;
ids fixos (UUID v5), então rodar duas vezes dá o mesmo.

## Status (23/11/2026)

- Feito: script, testes (17), SQL conferido no Postgres local (517 linhas com as fundações, duas rodadas, sem duplicar). A trava do SQL aceita as obras de teste EXE-* da Nova obra (sessão 14).
- **Carregado no servidor de testes em 23/11/2026, só o banco**: 517 linhas + acesso de gestor, todas assinadas
  pelo perfil do Nicolas (sem usuário técnico, decisão dele). Conferido por contagem e por md5 dos ids
  ordenados (`49e10bf873b6a2e123dca1d46140d9ac`, igual ao gerado). O SQL foi em 6 partes pelo Supabase MCP.
- Falta: os arquivos no storage (4 imagens de planta e 11 PDFs + 4 recortes). As linhas de `arquivos` e
  `plantas` já estão no banco, mas o app não baixa as plantas nem os PDFs até rodar `enviar`, que precisa da
  chave secreta do servidor de testes no `.env` (B, ainda não liberada).
- O servidor de testes também tem a cópia da obra piloto (posta pelo Professor em 23/11, de propósito, para a
  publicação de formas e instalações). Ela fica. Por isso a trava antiga ("nenhuma obra fora da EXE") virou
  "nenhuma linha fora da EXE": conferido no Postgres local com outra obra no banco (passa, duas rodadas sem
  duplicar) e com o código EXE em outro id (recusa), e a trava nova rodada sozinha no servidor de testes passa.
- Depois: abrir no app de testes em 375 px e tablet.

## Outra obra a partir de um pacote (`carga_pacote.py`, 24/11/2026)

Para a obra pública de demonstração (creche padrão FNDE Tipo 2, código CPT2) e qualquer outra: o repositório
tem só o leitor; os dados ficam num pacote fora do git (pasta com `obra.json`, imagens das pranchas e PDFs).
O formato está no começo de `pipeline/demo/carga_pacote.py`.

- `py pipeline/demo/carga_pacote.py gerar PACOTE SAIDA --usuario <id>`; depois o mesmo `carga_exe.py enviar SAIDA`.
- Mesmas travas da EXE: só o servidor de testes, toda linha e todo arquivo da obra do pacote, SQL recusa se o id
  ou o código já forem de outra obra. O código não pode ser EXE. Ids por UUID v5 com o código da obra.
- A prancha entra inteira, sem recorte, com o crédito (ex.: "FNDE/MEC") numa faixa embaixo (decisão de 24/11:
  a licença do FNDE é CC BY-ND 3.0).
- O leitor confere o pacote antes de montar (pavimentos, peças das concretagens, imagens, PDFs e as regras de
  código dos projetos do banco: `OBRA.SIG.NNN.CURTO`, sem hífen).
- Testes: `pipeline/testes/test_demo_pacote.py` (obra fictícia TST montada na hora). Conferido no Postgres local
  junto com a EXE: 581 linhas, duas rodadas sem duplicar. Os ids da EXE não mudaram (md5 igual).
- Leitor de prancha de forma em PDF com texto (`pipeline/demo/forma_pdf.py`, 25/11/2026): pilar = retângulo da
  camada de pilares mais perto do rótulo `Pn`; viga = par de faces ao lado do rótulo `Vn` (a busca do leitor da obra,
  com as coordenadas ×2 porque a escala é 1:75); seção pelo texto `LxA`; contornos no sentido em que a página aparece.
  Testes: `pipeline/testes/test_demo_forma_pdf.py` (prancha fictícia desenhada na hora, com e sem giro).
- Leitor de forma em DXF (`pipeline/demo/forma_dxf.py`, 25/11/2026), para a obra demo de vários pavimentos (DWG
  exportado com DXFOUT no accoreconsole). Mesma saída do leitor de PDF, camadas vindas do pacote (padrão de nomes do
  Revit/AIA por omissão). Pilar `Pn`, `PCn`, `PDn`: contorno mais perto do rótulo, vindo de hachura, polilinha
  fechada, laço de linhas soltas (pilar sem hachura) ou bloco (pilar circular, seção `D70`). Viga `Vn`/`VPn`: faces
  ao lado do rótulo (faixa_reta; desenho girado, faixa_inclinada), com a largura da busca tirada da seção do rótulo
  (até 150 cm). Laje `Ln` + `h=..`: contorno = hachura da laje que contém o rótulo ou, sem hachura, a menor região
  fechada pelas vigas e bordas (shapely; sem ele, laje sem contorno). Unidades cm, mm ou m. Testes:
  `pipeline/testes/test_demo_forma_dxf.py` (forma fictícia, também girada; pulam sem ezdxf/pymupdf, como no CI).
- Folha plotada (25/11/2026): `extensao_do_cad` + `na_folha` passam o resultado (peças e lajes) para a página que o
  `pipeline/fvs/plotar_dwg.py` gera (Model inteiro, cabe na folha, centrado). Conferido sobrepondo.
- **Pacote EXE-PV montado em 25/11/2026, fora do repositório** (pasta da obra demo, com o script que o monta):
  6 pavimentos (subsolo ao rooftop, um trecho de cada), 136 pilares, 79 vigas e 93 lajes com desenho, 4 concretagens
  e diário de EXEMPLO, 6 projetos. 464 linhas, 12 arquivos, imagens 5,9 MB. Conferido no Postgres local junto com a
  EXE: duas rodadas sem duplicar.
- Ainda de fora (21 peças, vão para `sem_contorno`): vigas curvas, viga mais larga que 150 cm, pilar que só aparece
  como projeção do andar de baixo e alguns pilares do rooftop com o rótulo longe do contorno.
- **Pacote da CPT2 montado em 25/11/2026, fora do repositório** (pasta da obra demo, com LEIA-ME, fontes e o script
  que monta o pacote): 4 pavimentos, 3 plantas inteiras, 811 peças, 950 linhas. Conferido no Postgres local junto com
  a EXE: 1470 linhas, duas rodadas sem duplicar. **Não publicado**: espera o Professor conferir; o envio dos arquivos
  ainda espera a chave B.
