# Integrações com sistemas oficiais (galhos removíveis)

Branch: `claude/clever-zhukovsky-7f5c15`, que parte do PR #42. Só commits locais: sem push nem PR.

## Status (09/11/2026)

Proposta aprovada pelo Professor em nome do Nicolas: colunas do banco ficam como estão, pacote novo com
`sistema_oficial`, skill de concreto sem mudança. **Feitos os PRs 1, 2 e 3** (commits locais), o teste
"sem integrações" e o job dele no GitHub (liberado pelo Professor em 09/11).

### Leitura completa publicada no servidor (21/11/2026)

Pedido do Nicolas (pelo Professor): tudo o que está no Construpoint tem que estar no programa. Migração
`20261121130000_sistema_oficial_leitura.sql` (contrato v1.7) aplicada pelo Professor. Novo no galho:
`leitura.py` (só biblioteca padrão, sem rede) e `publicar_leitura.py`, que lê a pasta de uma leitura
salva no PC e grava no Supabase do Sistema Obra, do mesmo jeito que o `publicar_historico.py`: login do app,
sem chave secreta, ids fixos (rodar de novo não duplica), trava `--empresa-autorizou`. Não entra no Construpoint.

    py pipeline/integracoes/construpoint/publicar_leitura.py PASTA_DA_LEITURA --obra OBRA --fichas-com-peca FICHA_PILAR,FICHA_VIGA --so-conferir

- Grava: `locais_sistema` (todos os locais de lá), `fvs_fichas_campo` (todas as fichas, com `local_id`,
  `agendada_em`, `reinspecao_em`, `medicao`; peça quando é pilar ou viga da planta), `fvs_eventos` (só itens de
  fichas com peça) e uma linha em `importacoes`.
- **Pilar com letra (24/11, achado 4 da lista de campo):** "P18" lá é o "P18a" no app (exemplo). Sem o nome exato,
  procura pelo número (`partes.pilar_pelo_numero`, mesma `base_do_nome` do capitel), no `montar` do
  `importar_construpoint.py` e no `resolver` do `publicar_historico.py`. Par no mesmo pavimento (P12a e P12aa, exemplo): fica o que
  não é `so_detalhe` no pacote; sem pacote (peças lidas do servidor, que não guarda isso), o nome mais curto
  (empate: ordem alfabética, P13a antes de P13b), com aviso na pendência ou em "conferir". O nome de lá
  aceita até duas letras (P12aa). Ficha que já está no servidor sem peça **não muda** ao rodar de novo
  (gravar ignora o id que já existe): ligar essas pede uma correção à parte, com o "pode" do Nicolas.
- **Verificação só com `local_id`** (regra do contrato v1.7): sem opção, fica só nas contagens da ficha.
  Com `--com-locais` (23/11, item 5.1; a tela "Locais fora da planta" da FVS já mostra), vira registro com
  `local_id` e a ficha de campo ganha `ficha_id` (a ficha modelo vigente do mesmo código), para a tela do local
  mostrar os itens. Ficha modelo que não está no servidor: o registro fica de fora (contado em "fora").
  **Por enquanto `--com-locais` recusa o servidor da obra**: só grava no de testes (`--url`), até o Nicolas liberar.
- **Servidor de testes, 23/11:** a obra piloto de lá só tinha os pavimentos (sem planta e sem fichas modelo).
  Entraram, pela ferramenta SQL do Supabase, as fichas modelo do servidor da obra que têm verificação fora da
  planta, algumas montadas do modelo do Construpoint (blocos, cortina, parede aparente, contenção; `aplica_a` = M
  só lá, porque o banco exige um tipo), as fichas de campo que no servidor da obra não têm peça, os locais delas
  (com os pais) e os registros delas.
  Os ids são os mesmos que o publicador calcula (uuid v5), então publicar de novo não duplica.
- **Não mexe nas fichas modelo do servidor**: as da obra piloto foram montadas pelas frentes da FVS (marcas de
  laje, partes, furos). O registro é ligado ao item da ficha vigente pelo texto do item (sem acento, caixa e
  pontuação). Publicar os modelos de lá por cima trocaria a ficha vigente (revisão maior ganha).
- Concreto (rastreabilidade, caminhões) fica com a frente do Concreto, que cruza com a planta antes de publicar.
- Obra piloto, 21/11, conferido: uns milhares de locais e de fichas (a maioria com peça); a maior parte das
  verificações virou registro (as outras são de laje, bloco, cortina e ambientes); todos os itens acharam o item
  da ficha do servidor.
  Os registros de teste que já estavam no servidor ficaram como estavam.
- Testes: `testes/test_construpoint_leitura.py` (obra EXE, dados inventados).

### Como usar

- Gerar o pacote com o sistema da obra: `py pipeline/fvs/exportar_bancada.py ... --sistema-oficial construpoint`
  (também em `compactar_pacote.py` e `bancada.py`). Sem a opção, a obra não tem sistema oficial.
- O pacote que já está nos tablets não tem o campo: lá o app passa a esconder lançamento, duplicadas e
  "Ficha no ...". **Trocar o pacote da demonstração é decisão do Nicolas**; esta sessão não mexeu nele.
- Bancada: `dev/fvs.html` e `dev/concreto.html` usam o primeiro galho instalado; `?sistema=` (vazio) abre
  sem sistema.
- Tirar o galho: apagar `app/src/integracoes/construpoint/` e `pipeline/integracoes/construpoint/`.

### Prova de que dá para tirar

`python supabase/testes/sem_integracoes.py` (com o `npm install` do app feito): copia o repositório,
apaga todos os galhos e roda build, `vitest run src`, testes do pipeline e a varredura. Em 09/11:
build ok, 316 testes do app, 149 do pipeline, varredura limpa. Com o galho: 317 e 168.
Desde 12/11 também varre o site compilado da cópia (`app/dist`): sem nome de galho (fora as colunas do
banco), sem endereço do sistema oficial e sem segredo (`sb_secret_`, `service_role`, chave privada). Teste em
`pipeline/testes/test_sem_integracoes.py`. Revisão de 12/11: o galho do app só tem id, nome e dicas; o do
pipeline não usa rede, não lê nem grava senha ou token e só grava o `historico.json` (campos escolhidos um a
um) e o CSV de pendências, fora do repositório.

**Job do GitHub:** passo "Sem integrações (galhos apagados numa cópia)" em `.github/workflows/testes.yml`,
logo depois da compilação do app (`python3 supabase/testes/sem_integracoes.py`). Usa o mesmo `NOMES_PROIBIDOS` do job.

### Testes de tela (09/11, neste PC, Chrome instalado)

`SO_BANCADA=1 ... npx vitest run testes/`: 7 arquivos passaram (FVS, Concreto, local, Relatórios, IFC),
101 testes; 6 pulados por precisarem do PostgREST (rodam no GitHub). Novo em `local.e2e.test.ts`, em
375 px e tablet: pacote sem `sistema_oficial` com uma marcação feita não mostra lançamento, duplicadas nem
"Ficha no ..." (FVS e Concreto); o mesmo pacote com o campo mostra de novo, com o nome do galho.
Pacote com `historico.json` e sem `sistema_oficial`: aviso discreto no início da FVS ("Este pacote tem
histórico de um sistema oficial, mas não diz qual. Gere o pacote de novo com --sistema-oficial."), e nada
mais de sistema oficial (`avisoDoSistemaOficial` em `sistema_oficial.ts`, com teste de unidade). Se o pacote
diz um sistema cujo galho não veio nesta versão, o aviso diz o nome dele.

### Pacote novo da obra piloto (09/11, fora do repositório)

Gerado com `exportar_bancada.py`, as mesmas entradas do pacote da demonstração, `--nome` com o nome completo
e `--sistema-oficial construpoint`, numa pasta nova ao lado da entrega (`pacote_novo_com_sistema_oficial\`).
Conferido: plantas, fichas e histórico iguais aos do pacote da demonstração; só o `indice.json` muda. Aberto
nesta branch (375 px e tablet): lançamento, as peças com ficha duplicada e "Ficha no Construpoint"
aparecem, sem aviso e sem erro. **O pacote da demonstração não foi trocado: a troca é decisão do Nicolas.**

### Pendências

- Testes de tela (`app/testes/fvs_bancada.e2e.test.ts`) de lançamento e duplicadas dependem do galho
  instalado (procuram o texto "Construpoint"). Sem o galho, eles falhariam. Próximo passo: um galho
  fictício só para os testes, ou textos genéricos nos testes.
- A obra com servidor (login) ainda não tem `sistema_oficial`: lá as telas ficam sem sistema oficial. Vai
  precisar de um campo na tabela `obras` (migração do núcleo, com o Nicolas).
- Colunas do banco com o nome do Construpoint: ficam (decisão de 09/11). A varredura ignora só esses nomes.
- Docs: `1_fvs.md`, `3_concreto.md`, `03_APP_LOCAL.md` e o LEIA-ME do PC apontam para este arquivo. As seções
  antigas da FVS ("Lançar no Construpoint", "Histórico do Construpoint") ficam como registro do que foi feito.
- `docs/01_ARQUITETURA.md` (linha 8) cita o Construpoint como exemplo: só muda com o Nicolas.

## Por que

Decisão do Nicolas em 09/11/2026: a ligação com o Construpoint (o sistema oficial de FVS da empresa da
obra piloto) não pode ser fixa no app. Tem de ser um **galho**: uma pasta que ele liga ou tira quando
quiser. Sem o galho, o app funciona inteiro e **não mostra nada do Construpoint**.

## 1. Onde o Construpoint aparece hoje (levantamento de 09/11)

63 arquivos citam o Construpoint ou o `historico.json`. Separados pelo tipo de dependência:

### a) Código que só existe por causa do Construpoint (vai para o galho)

| Onde | O que faz |
|---|---|
| `pipeline/fvs/importar_construpoint.py` (agora no galho) | lê os relatórios do Construpoint já salvos no PC e monta o `historico.json` |
| `pipeline/fvs/publicar_fichas.py` (`separar_nome_construpoint`, `de_construpoint`; agora no galho, `fichas.py`) | lê as fichas modelo no formato da tela "Visualizar" do Construpoint |
| `pipeline/testes/test_fvs_construpoint.py` (agora no galho) | testes dos dois acima |
| `app/src/fvs/lancamento.ts` (`planilhaDeLancamento`) | colunas da planilha CSV de lançamento e o nome `lancar_construpoint_...csv` |

### b) Código genérico com nome do Construpoint (fica no app, troca o texto)

A ideia já é genérica, só o nome está fixo:

- **Histórico externo**: `historico.json` no pacote, `HistoricoDoPacote` e `linhasDoHistorico` em
  `app/src/nucleo/pacote_obra.ts`, `pipeline/fvs/publicar_historico.py`, `bancada.py --historico`,
  `exportar_bancada.py --historico`, `compactar_pacote.py`. Formato: fichas abertas (`fvs_fichas_campo`)
  e verificações (`fvs_eventos`), que qualquer sistema pode gerar.
- **Lançamento**: o que foi marcado no app e falta no sistema oficial (`lancamento.ts`, `TelaLancamento.tsx`,
  botão "para lançar no Construpoint" na `TelaInicio.tsx`, "já lançados" em `fvs/dados.ts`).
- **Fichas duplicadas** (`TelaDuplicadas.tsx`, contorno na `TelaPlanta.tsx`, botão na `TelaInicio.tsx`).
- **Código da ficha no sistema oficial**: na área de laje (`areas.ts`, `TelaPlanta.tsx`), na planilha da obra
  (`planilha.ts`: colunas "Ficha no Construpoint" e "Status no Construpoint"), nas reprovações
  (`reprovacoes.ts`, `IrAtePeca.tsx`: local do Construpoint).
- **Concreto**: campo "Ficha no Construpoint" (`concreto/telas/Formularios.tsx`, `TelaConcretagem.tsx`,
  `TelaPavimento.tsx`, `TelaRelatorio.tsx`, coluna em `relatorio.ts`, `ficha_concreto.ts`, `dados.ts`).
- Textos de ajuda e comentários em `situacao.ts`, `tabelas.ts`, `fvs.css`, `app/dev/fvs.tsx`, `app/dev/concreto.tsx`,
  `relatorios/exemplos.ts`.

### c) Banco (migrações): nomes de coluna com "construpoint"

- `setores.nome_construpoint` (núcleo)
- `concretagens.codigo_construpoint`; `cp_resultados.origem` aceita `'construpoint'`
- `fvs_fichas_campo.construpoint_id` e `local_construpoint`; `fichas_modelo.origem` (texto livre, ex. "construpoint")

Só os **nomes** falam do Construpoint; os dados servem para qualquer sistema. Mudar exige migração do
núcleo (regra do CLAUDE.md: só com o Nicolas sabendo).

### d) Docs e testes

`docs/01_ARQUITETURA.md` (linha 8 e 39), `02_CONTRATO_NUCLEO.md` (setores), `03_APP_LOCAL.md`,
`modulos/0_nucleo.md`, `1_fvs.md` (seções "Lançar no Construpoint" e "Histórico do Construpoint"),
`3_concreto.md`, `pipeline/fvs/pc_empresa/LEIA-ME.txt`; testes do app (`lancamento.test.ts`,
`planilha.test.ts`, `pacote_obra.test.ts`, `fvs_bancada.e2e.test.ts` e outros) e do pipeline
(`test_fvs_entrega.py`, `test_fvs_pacote.py`, `test_fvs_compactar.py`).

## 2. Separação (proposta de 09/11, feita como descrito, salvo o que está anotado)

### O "sistema oficial" é configuração do pacote da obra

No `indice.json` do pacote (e, com servidor, numa linha da obra mais tarde) entra um campo novo, opcional. O app guarda na obra do aparelho (`ObraLocal.sistema_oficial`):

```json
"sistema_oficial": { "id": "construpoint" }
```

- **Sem o campo**: o app não mostra lançamento, duplicadas, "Ficha no ..." nem colunas do sistema oficial.
  O `historico.json`, se vier, entra como "histórico de antes do app", sem nome de sistema.
- **Com o campo e o galho instalado**: o app mostra tudo como hoje, com o nome que o galho der.
- **Com o campo e o galho tirado**: igual a sem o campo. (O aviso "integração não instalada" ficou para depois.)

### Interface genérica (fica no app, sem nome de sistema)

`app/src/integracoes/sistema_oficial.ts`:

```ts
export interface SistemaOficial {
  id: string                 // "construpoint"
  nome: string               // "Construpoint", vai nos textos
  dicaLocal?: string         // ex.: "Térreo \ Trecho 1 \ Vigas" (exemplo)
  dicaCodigoFicha?: string   // ex.: "FIC-0215"
}
export function sistemaDaObra(obra): SistemaOficial | null
```

As planilhas (situação, reprovações, lançamento, CSV do concreto) recebem o nome do sistema e tiram as
colunas dele quando não há sistema. Os galhos instalados são achados por `import.meta.glob('./*/index.ts', { eager: true })`: o Vite junta o
que existir na pasta. **Tirou a pasta, o build continua passando** e `sistemaDaObra` devolve `null`.

As telas trocam "Construpoint" por `sistema.nome` e se escondem quando `sistema` é `null`.

### O galho do Construpoint

```
app/src/integracoes/construpoint/
  index.ts                     nome, dicas, colunas da planilha de lançamento
  construpoint.test.ts         testes que hoje falam do Construpoint
pipeline/integracoes/construpoint/
  __init__.py                  o que faz e o que nunca faz (não entra no Construpoint)
  importar_construpoint.py     (era pipeline/fvs/importar_construpoint.py)
  fichas.py                    reconhece(dados) e converter(dados) (era de_construpoint em publicar_fichas.py)
  testes/                      testes do galho, rodados pelo pipeline/testes/test_integracoes.py
```

No pipeline, o mesmo jeito: `publicar_fichas.py --formato construpoint` procura
`pipeline/integracoes/<formato>/fichas.py`; sem a pasta, a opção some e o script avisa. `publicar_historico.py`,
`bancada.py` e `exportar_bancada.py` continuam no `pipeline/fvs/` porque só tratam o formato genérico do
`historico.json`. A trava `--empresa-autorizou` continua no `publicar_historico.py` (vale para dado de
qualquer sistema).

### Banco

- **Agora**: não muda nada no banco. O código passa a ler essas colunas só pelos módulos genéricos,
  com nomes genéricos no TypeScript (`codigoNoSistemaOficial` etc.).
- **Depois, se o Nicolas quiser**: uma migração do núcleo renomeia `nome_construpoint → nome_externo`,
  `codigo_construpoint → codigo_externo`, `construpoint_id → id_externo`, `local_construpoint → local_externo`
  e troca `'construpoint'` por `'sistema_oficial'` no `origem`. É mudança do núcleo: proposta à parte.

### Ordem dos PRs (cada um com os testes verdes)

1. Interface `SistemaOficial`, campo `sistema_oficial` no pacote, telas escondem sem ele. Galho do
   Construpoint no app. Pacotes gerados com `exportar_bancada.py --sistema-oficial construpoint`.
2. Pipeline: mover `importar_construpoint.py` e `de_construpoint` para `pipeline/integracoes/construpoint/`.
3. Docs: `1_fvs.md`, `3_concreto.md`, `03_APP_LOCAL.md` e o LEIA-ME do PC apontam para este arquivo.
4. (Opcional, com ok) migração que renomeia as colunas.

## 3. Como provar que dá para tirar o galho

Um teste que tira a pasta de verdade e roda tudo de novo, no PC e no GitHub:

1. `supabase/testes/sem_integracoes.py` (Windows e Linux): copia o repositório para uma
   pasta temporária, apaga `app/src/integracoes/construpoint/` e `pipeline/integracoes/construpoint/`, e roda
   - `npm run build` e `npm test` no app;
   - `python -m unittest discover -s pipeline/testes` no pipeline;
   - uma varredura: `grep -ri construpoint app/src pipeline` (fora `integracoes/`) tem de voltar **vazia**.
     As migrações e os docs ficam de fora da varredura (histórico do banco não se reescreve).
2. Um teste de tela (Playwright, 375 px e tablet) que abre um pacote **sem** `sistema_oficial` e confere:
   nenhum texto "Construpoint", sem botão de lançamento, sem duplicadas, sem campo "Ficha no ..." no Concreto.
3. Um job novo no `.github/workflows/testes.yml` ("sem integrações") roda o passo 1 em cada PR.

Se os três passam, o galho sai inteiro sem quebrar nada.

## Perguntas para o Nicolas

1. Renomear as colunas do banco agora (migração do núcleo) ou deixar para depois? Sugestão: depois.
2. O pacote que está hoje nos tablets não tem `sistema_oficial`: com esta versão, ele mostra o aviso e
   perde lançamento, duplicadas e "Ficha no". O pacote novo, com o campo, já está pronto (acima). Trocar o
   da demonstração por ele?
3. O skill de rastreabilidade de concreto (fora do repositório, na conta do Nicolas) fica como está?
