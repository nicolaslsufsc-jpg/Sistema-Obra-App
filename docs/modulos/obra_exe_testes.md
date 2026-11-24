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
