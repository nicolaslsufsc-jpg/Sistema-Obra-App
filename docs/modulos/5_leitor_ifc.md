# Módulo Leitor de IFC

Dono do pedido: Nicolas, 06/11/2026. Branch: `modulo/ifc`.

**Status: em teste, ainda não ligado ao app.** O Nicolas pediu para ligar ao programa só se der certo. O código já está no repositório, mas não aparece no menu e não entra no pacote do app publicado. Abre só pela bancada.

## O que ele faz

1. **Ver IFCs, vários um por cima do outro.** Cada modelo liga e desliga, tem régua de opacidade e fica guardado no aparelho.
2. **Buscar elementos.** Busca por texto (nome, tag, GUID, tipo, material, camada e valor de propriedade) e lista de filtros por pavimento, categoria, camada, material, tipo, classe IFC e modelo. O resultado pode destacar (o resto fica transparente), isolar (o resto some) ou só listar. Tocar numa peça abre a ficha com todas as propriedades.
3. **Gerar cortes.** Planta de um pavimento (altura acima do piso à escolha), corte longitudinal, corte transversal, ou corte pela face tocada. O plano se move por régua ou em passos de 10 cm e 1 m. O corte tampa as peças no 3D e abre um desenho 2D sem perspectiva, com os níveis dos pavimentos. Sai em DXF (1 unidade = 1 metro), SVG e imagem.

As cores têm quatro modos: por categoria (padrão), por modelo, por pavimento e cores do arquivo.

## Como abrir

No PC:

```bash
cd app
npm install
npm run dev
```

Depois abrir `http://localhost:5173/dev/ifc.html`.

No celular ou tablet, na mesma rede: `npm run dev -- --host` e abrir `http://<ip do PC>:5173/dev/ifc.html`. Sem https o aparelho não guarda os modelos (o navegador só libera essa área em página segura), o resto funciona.

## Decisões

- **Motor:** `web-ifc` (MPL-2.0) para ler o IFC e `three` (MIT) para desenhar. Não usei o pacote pronto da That Open porque as telas e os cortes precisam ser nossos, e porque ele muda muito de versão.
- **Tudo no aparelho.** O IFC é lido no próprio navegador, numa thread separada. Nada sobe para o servidor. Por isso nenhuma tabela nova no banco, por enquanto.
- **Modelo guardado (`.obra3d`).** Depois da primeira leitura, o modelo convertido fica na área privada do navegador (OPFS) e reabre em segundos. "Levar para outro aparelho" gera um arquivo comprimido: converte no PC e abre no tablet sem ler o IFC de novo. É o caminho previsto para IFC grande em celular.
- **Categoria não vem só da classe IFC.** A torre da obra piloto exporta quase tudo como `IfcBuildingElementProxy` ou `IfcBuildingElementPart`. A categoria sai da classe, do nome da peça e do pai, da camada e do material, nessa ordem (`motor/categorias.ts`).
- **Arquivo fora de coordenada: a pessoa decide.** O ARQ e o EST do outra obra ficam a 145 m um do outro. O app avisa e oferece marcar pontos (corrige deslocamento e giro), encaixar pelo centro (aproximado) ou deixar assim. Não move sozinho, para não esconder erro de projeto. O ajuste fica guardado por modelo no aparelho.
- **Sem IfcSpace e sem abertura no desenho:** os dois tapariam o modelo.

## Como está organizado (`app/src/ifc/`)

- `motor/leitor.ts` e `leitor.worker.ts`: IFC → modelo em memória.
- `motor/tipos.ts`, `pacote.ts`, `guardados.ts`: formato, arquivo `.obra3d`, área do aparelho.
- `motor/visor.ts`, `materiais.ts`: cena 3D. Um desenho por bloco, com o estado de cada peça em textura: filtrar 40 mil peças é atualizar uma textura.
- `motor/corte.ts`, `exportar.ts`: plano × triângulos, laços fechados, preenchimento, DXF e SVG.
- `motor/indice.ts`, `categorias.ts`: busca e paleta.
- `motor/alinhamento.ts`: ajuste de posição entre modelos.
- `sessao.ts`: o que está aberto e o que cada botão faz.
- `telas/`: as telas. `ifc.css`: tudo com prefixo `.ifc`.

## Testes

- `testes/ifc_leitor.test.ts` e `testes/ifc_motor.test.ts`: leitura com web-ifc de verdade (`testes/ifc/amostra.ts`, IFC escrito à mão, sem dado de obra), cortes, busca, categorias, alinhamento, pacote.
- `testes/ifc_bancada.e2e.test.ts`: tela no Chrome, tablet e 375 px, com o 3D rodando por software. No PC do Nicolas:
  `SO_BANCADA=1 SO_PLAYWRIGHT=<pasta>/node_modules/playwright SO_CHROME=chrome npx vitest run testes/ifc_bancada.e2e.test.ts`

Medido em 06/11/2026 no PC do Nicolas (RTX 4070 Laptop), com IFCs de verdade fora do repositório:

| Arquivo | Tamanho | Elementos | Triângulos | Primeira leitura | Reabrir guardado |
|---|---|---|---|---|---|
| outra obra EST | 12 MB | 1.079 | 81 mil | 2,6 s | não medido |
| outra obra ARQ + EST juntos | 110 MB | 4.729 | 4,4 mi | 19 s | não medido |
| obra piloto torre | 298 MB | 42.476 | 4,7 mi | 48 s | 1,5 s |

Na obra piloto, girar o modelo ficou a 60 quadros por segundo; a planta cortou 5.085 peças em cerca de 1 s.

## O que ainda não foi testado

- **Celular e tablet de verdade.** O layout foi conferido em 375 px e 1280 x 800, mas no Chrome do PC. Falta ver memória e fluidez num Android. A obra piloto guardada pesa 317 MB: é o teste que decide.
- **DXF no AutoCAD.** O arquivo foi conferido por teste automático, não aberto no AutoCAD.
- **Marcar pontos com o dedo.** Testado com toques simulados na amostra e por conta (giro e deslocamento). Falta alinhar de verdade o ARQ com o EST do outra obra, marcando cantos.

## Para ligar ao app (se der certo)

Pedidos ao núcleo, nenhum feito ainda:

1. Em `app/src/modulos.ts`: acrescentar `'ifc'` em `IdModulo` e a linha `{ id: 'ifc', nome: 'IFC', descricao: 'Modelos 3D e cortes', Tela: IfcSobDemanda }`. A tela já aceita `aoSair`.
2. Em `app/vite.config.ts`: acrescentar `wasm` em `globPatterns` e subir `maximumFileSizeToCacheInBytes`, para o leitor funcionar sem internet.
3. Tratar o "voltar" do Android dentro do módulo (hoje o painel fecha só pelo X ou pela aba), conforme "Casca do app" no contrato.
4. Decidir se os modelos convertidos vão para o Supabase por obra, para o tablet baixar sem passar arquivo à mão. Aí sim precisa de tabela e o limite do plano gratuito pesa.

Mudança já feita fora do módulo: `optimizeDeps` em `app/vite.config.ts`, só para desenvolvimento (sem isso o Vite recarregava a página no meio da leitura), e as dependências `three`, `web-ifc` e `@types/three` em `app/package.json`. Enquanto o módulo não for ligado, elas não entram no pacote do app.

## Próximo passo

Nicolas abre os IFCs dele no PC e no tablet e diz se vale ligar. Ideias para depois, só se fizerem falta: caixa de corte (6 planos), medir no desenho 2D, grade de eixos, cotas.

## Pendências

- Definir o nome do módulo no menu.
- Licença do `web-ifc` (MPL-2.0): pode usar em projeto fechado; se alterar os arquivos dele, a alteração tem que ser aberta. Não alteramos nada. Entra na conversa sobre de quem é o código (acordo com a empresa, em `docs/01_ARQUITETURA.md`).

## 07/11/2026 à noite (branch `app/local`): ligado ao menu
O Nicolas pediu o módulo no app com "uma aba para eu colocar esse IFC". `modulos.ts` ganhou `{ id: 'ifc', nome: 'IFC', descricao: 'Importe seu IFC: modelo 3D, busca e cortes' }`; a tela vazia diz "Importe aqui seu IFC" com o botão "Importar IFC" (e arrastar). `vite.config.ts`: `.wasm` entra no cache do app (limite 12 MB) e a lista de permissões libera WebAssembly (`'wasm-unsafe-eval'`). Celular e tablet de verdade continuam sem teste.

## 13/11/2026: de volta ao menu, como beta (para a demo de segunda)
Estava fora do menu desde 08/11. Agora volta com um selo amarelo **BETA** no cartão.
- `app/src/modulos.ts`: a linha do IFC perdeu o `foraDoMenu` e ganhou `beta: true` (campo novo, opcional, serve para qualquer módulo).
- `app/src/telas/Menu.tsx` e `app/src/style.css` (casca do núcleo): o cartão mostra o selo quando `beta` está ligado. São 6 linhas na tela e uma classe `.selo-beta` no CSS.
- Testes: `testes/local.e2e.test.ts` ganhou "menu mostra IFC beta e abre o visor" (celular 375 px e tablet 768x1024, app compilado, **sem internet**, lê a amostra escrita à mão e volta ao menu). `testes/telas.e2e.test.ts` agora espera o IFC no menu.

Medido no PC do Nicolas com o app compilado, sem internet depois de carregado, Chrome com o processador freado 4x no celular e no tablet (imita um Android médio; o freio vale para a tela, talvez não para a leitura, que roda em outra thread). Modelos públicos de exemplo (fora do repositório): uma casa de 2,6 MB e um prédio de escritórios de 11 MB.

| Aparelho | Modelo | Abrir o módulo | Ler o IFC | Memória a mais |
|---|---|---|---|---|
| celular 375 px | casa 2,6 MB | 1,0 s | 2,1 s | ~90 MB |
| celular 375 px | prédio 11 MB | 1,0 s | 4,4 s | ~130 MB |
| tablet 768x1024 | casa 2,6 MB | 0,8 s | 1,7 s | ~100 MB |
| tablet 768x1024 | prédio 11 MB | 0,8 s | 4,1 s | ~155 MB |
| PC | casa 2,6 MB | 0,1 s | 1,2 s | ~130 MB |
| PC | prédio 11 MB | 0,2 s | 3,2 s | ~175 MB |

Sem erro, sem rolagem para o lado. **Android de verdade continua sem teste**: num celular real a leitura deve levar de 2 a 4 vezes mais. Para a demo: arquivo pequeno (até ~15 MB) no celular; IFC grande da obra, só no tablet ou no PC.

## 13/11/2026: "Enquadrar" ignora peças soltas longe do prédio
Com o `Building-Architecture.ifc` público da buildingSMART, o botão de enquadrar deixava a casa num canto: o arquivo traz um marcador de georreferência a ~40 m dela. Agora o enquadrar (e as vistas prontas) usam a caixa do conjunto principal (`motor/enquadramento.ts`): em cada eixo, a peça só sai se estiver separada do conjunto por um vão vazio maior que 10 m **e** maior que o próprio conjunto. Prédio contínuo, por mais alto ou comprido, não perde nada; dois prédios vizinhos ficam; com menos de 5 peças nada sai. Cortes, planta e níveis continuam usando a caixa inteira. Conferido: nos IFCs que já abriam bem (amostra, casa de 2,6 MB e prédio de 11 MB públicos) a caixa ficou idêntica. Testes em `testes/ifc_enquadramento.test.ts`.

## 16/11/2026: tela inicial do IFC ilegível no tema escuro (Professor, branch demo/rede-17-11)
Com o tema escuro (#59), o título e o texto de "Importe aqui seu IFC" ficavam claros sobre o fundo cinza claro do 3D. A tela vazia (`.ifc-vazio`) agora tem fundo próprio do tema (`--ifc-superficie-2`). Ela só aparece sem modelo aberto, então o 3D não muda. Conferido a 375 px.
