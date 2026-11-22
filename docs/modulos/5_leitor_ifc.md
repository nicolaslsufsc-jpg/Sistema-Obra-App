# Módulo Leitor de IFC

Dono do pedido: Nicolas, 06/11/2026. Branch: `modulo/ifc`.

**Status (21/11/2026): no menu do app, sem selo beta** (com e sem conta), com a lista "IFCs da obra" para baixar e usar sem internet (#53). Histórico abaixo, por data.

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

## 20/11/2026: mais leve para IFC grande (branch `ifc/otimizar`)
O Nicolas reativou o módulo e pediu para tirar do beta e otimizar ("arquivos grandes ele fica meio lento").

**O que pesava:** em cada quadro o 3D era desenhado duas vezes por inteiro: uma passada para as peças opacas e outra, do bloco inteiro de novo, para o vidro e as peças transparentes. Na torre da obra piloto eram 8,4 milhões de triângulos por quadro para um modelo de 4,7 milhões.

**O que mudou (`app/src/ifc/`):**
- `motor/visor.ts`: a passada transparente desenha só os triângulos que podem sair transparentes: o vidro do próprio IFC e, nos modos de cor que deixam a categoria "vidro" transparente, as peças dessa categoria. Os vértices são os mesmos do bloco (nada é copiado); muda só a lista de triângulos. Com o modelo a menos de 100% de opacidade, continua desenhando tudo, como antes.
- `motor/geometria.ts`: duas contas novas para montar essa lista (`triangulosComAlfa`, `indiceSoDoVidro`) e a busca de arestas deixou de zerar uma tabela grande a cada peça pequena.
- `sessao.ts`: passa ao visor a lista de peças da categoria vidro (antes era só "este bloco tem vidro").

**Medido no PC do Nicolas** (Chrome, tela de tablet 1280 x 800 com densidade 2, o tamanho do SM-P620), antes = `main` 806adec, depois = esta branch, mesma vista:

| Modelo | Triângulos por quadro, antes | depois | Tempo da placa por quadro, antes | depois |
|---|---|---|---|---|
| torre da obra piloto (298 MB, 42.476 peças) | 8,4 mi | 4,8 mi (−43%) | 6,8 a 8,8 ms | 4,6 a 6,2 ms |
| um pavimento da obra piloto | 919 mil | 511 mil (−44%) | 1,5 a 1,8 ms | 1,1 a 1,4 ms |
| torre a 50% de opacidade | 9,4 mi | 9,4 mi (igual, de propósito) | | |

- **A imagem não mudou:** prints de antes e depois comparados pixel a pixel nos modos por categoria, cores do arquivo e a 50% de opacidade, nos dois modelos: 0 pixels diferentes.
- **Ler o IFC pela primeira vez continua igual** (torre: 26 a 44 s no PC; um pavimento: 3,4 a 4,5 s). Quase todo o tempo é do `web-ifc` montando a geometria; a nossa parte é cerca de 6 s de 30. Reabrir o modelo guardado: torre 0,6 a 1,3 s, pavimento 0,1 a 0,2 s.
- **Memória:** pico de cerca de +1,1 a 1,3 GB no Chrome lendo a torre. Não mudou.
- **Sem número de quadros por segundo no SM-P620 e no S23:** não há aparelho ligado ao PC. A placa do tablet é bem mais fraca que a do PC; o ganho esperado é proporcional (cerca de 40% menos trabalho por quadro ao girar). O visor já baixa a resolução e esconde as arestas quando um quadro passa de 45 ms.

**Testes:** `testes/ifc_vidro.test.ts` (novo), todos os testes do app, build, `ifc_bancada.e2e` (375 px e tablet) e `local.e2e`.

**Ideias para a leitura ficar mais rápida (não feitas, precisam de decisão):**
1. Converter no PC e levar o `.obra3d` para o tablet (já existe "Levar para outro aparelho"): é o caminho mais rápido hoje para a torre.
2. No tablet, usar os IFCs por pavimento em vez da torre inteira.
3. `web-ifc` com várias threads: exige os cabeçalhos COOP/COEP no site (mexe na hospedagem e no núcleo).
4. Ler o arquivo em mais de um worker, dividindo as peças.

**Próximo passo:** abrir a torre guardada no SM-P620 de verdade.

## 21/11/2026: IFCs da obra, baixar para usar sem internet (branch `ifc/baixar`)
Pedido do Nicolas: "deixa uma opção da pessoa baixar os IFCs dentro do app pra ficar mais facil ai fica disponivel para ela offline". O Professor aprovou a proposta: sem tabela nova, sem migração e sem mudar o núcleo.

**Como funciona**
- **Onde fica no servidor:** no bucket `obras` e na tabela `arquivos`, que já existem, pelo `registrarArquivo` do núcleo (módulo `ifc`, caminho `{obra}/ifc/{id}`).
- **Tamanho:** o plano gratuito aceita no máximo 50 MB por arquivo. Por isso o IFC sobe comprimido (gzip) e cortado em partes de até 40 MB, com no máximo 10 partes.
  - A torre da obra piloto (298 MB) vira 49 MB, em 2 partes.
  - O `nome_original` de cada parte diz o envio e a parte, por exemplo "Torre.ifc (parte 1 de 2, envio 3f2a9c1e)".
- **Quem envia:** gestor e admin, com conta, pelo botão "Enviar IFC para a obra" (Modelos, ou a tela inicial do IFC). As partes entram na fila e sobem na próxima sincronização.
- **Quem baixa:** todos com conta. A lista "IFCs da obra" mostra nome, tamanho, data e "Baixar para usar offline" com a barra de progresso.
  - Cada parte é conferida pelo tamanho e pelo SHA-256 registrados.
  - As partes se juntam, o gzip abre e o IFC passa pelo leitor de sempre.
  - O modelo convertido fica guardado no aparelho (OPFS), o mesmo lugar do "Importar".
  - Depois aparecem "Abrir" e "Apagar do aparelho". O aparelho lembra qual envio virou qual modelo (`localStorage`, `ifc.baixados.{obra}`).
- **Sem conta** (pacote da obra), a lista não aparece. O "Importar IFC" continua igual.
- **Versões:** arquivo do núcleo é imutável. De cada nome, a lista mostra só o envio completo mais novo, e mais o que ainda está subindo. O envio velho fica no servidor até alguém limpar pelo painel do Supabase.

**Servidor em 20/11:** o bucket `obras` está em 174 MB de 1 GB e o plano dá 10 GB de saída por mês. Cabem uns 15 IFCs do tamanho da torre. **Nenhum IFC de obra foi enviado**: só os testes, com a amostra fictícia.

**Arquivos**
- `app/src/ifc/obra.ts`: lista, partes, baixar, apagar, enviar.
- `obra_servidor.ts`: a fonte do servidor.
- `telas/IfcsDaObra.tsx`: a tela.
- `telas/ComObra.tsx`: a sincronização do módulo e a decisão "com conta / sem conta".
- `ModuloIfc.tsx` e `PainelModelos.tsx`: onde a lista aparece.
- `ifc.css`: a aparência.
- **Bancada:** `dev/ifc.html?obra=exe` mostra a lista com uma fonte de mentira na memória (obra EXE, a amostra escrita à mão).

**Testes**
- `testes/ifc_obra.test.ts` (novo).
- Em `testes/ifc_bancada.e2e.test.ts`, um passo novo em 375 px e no tablet: baixar, ver "neste aparelho", recarregar e abrir sem servidor, apagar e enviar.
- Todos os testes do app, o build e o `local.e2e`.

**Pendências**
- Testar com conta de verdade: enviar um IFC fictício da EXE pelo PC e baixar no tablet.
- A torre inteira no tablet ainda converte no próprio aparelho: deve levar alguns minutos e pede cerca de 1,2 GB de memória. Para o tablet, o melhor é enviar os IFCs por pavimento.
- Se o Storage encher: o IFC grande vem do PC por .zip ou pasta, ou por `.obra3d` pelo "Importar".

## 21/11/2026: no menu, fora do beta (confirmado)
O Nicolas confirmou no chat do Professor: "O menu, o leitor de FC entra no menu? Sim, entra." A linha do IFC em `app/src/modulos.ts` já estava sem `beta` e sem `foraDoMenu` desde 20/11. Hoje só os textos foram acertados: a bancada (`dev/ifc.html`), o comentário do teste e este arquivo. Conferido de novo em 375 px e no tablet: o menu mostra "IFC" sem selo e o leitor abre a amostra sem internet (`local.e2e`), e a bancada passa nos dois tamanhos (`ifc_bancada.e2e`).

## 21/11/2026: "Baixar modelo da obra" (Google Drive) (branch `ifc/drive`)
Anotação de teste do Nicolas: "IFC - Ainda sem botão de puxar do drive e baixar". Os IFCs da obra ficam numa pasta do Google Drive da obra e nunca vão para o servidor (de 9 MB a 1,6 GB).

**Como funciona**
- A lista de modelos é **dado da obra, fora do repositório**: um JSON pequeno (`modelos_drive.json`) com nome, disciplina, tamanho, situação e o id do arquivo no Drive de cada modelo, mais a pasta.
- **Com conta:** gestor e admin carregam o JSON no leitor ("Carregar a lista de modelos"). Ele vira um arquivo do núcleo (módulo `ifc`) e desce para todos os aparelhos. Sem tabela nova.
- **Sem conta:** o JSON fica só no aparelho.
- **Obra EXE:** sem lista, aparece uma de exemplo (`modelos_drive.ts`).
- Tocar em "Baixar" mostra o tamanho e os avisos. Acima de 20 MB, pede Wi-Fi, ou "Conecte no Wi-Fi" se o navegador disser que está nos dados móveis. Acima de 300 MB, "pode travar no celular e no tablet, prefira o PC ou o IFC por pavimento".
- "Abrir no Drive para baixar" usa o link de baixar direto do Drive (`drive.google.com/uc?export=download&id=…`, desde 21/11). O link é montado pelo app, só para `drive.google.com`, e nunca copiado do JSON. Arquivo pequeno começa a baixar na hora. Arquivo grande (acima de uns 100 MB) passa antes por uma página do Drive avisando que ele não verificou vírus; a pessoa toca em "Baixar assim mesmo".
- Depois, "Importar IFC" abre o arquivo baixado. O modelo importado com o mesmo nome aparece como "neste aparelho", com "Abrir".
- Para baixar, a pessoa precisa ter acesso à pasta do Drive.
- Formato do JSON e regras: `app/src/ifc/modelos_drive.ts`.

**Arquivos:** `modelos_drive.ts`, `telas/ModelosDaObra.tsx`, `obra_servidor.ts` (`fonteListaDoServidor`), `telas/ComObra.tsx`, `ModuloIfc.tsx`, `ifc.css`. Bancada: `dev/ifc.html?obra=exe`.

**Testes:**
- `testes/ifc_modelos_drive.test.ts` (novo).
- Em `ifc_bancada.e2e`, um passo novo em 375 px e tablet: lista de exemplo, avisos de tamanho e Wi-Fi, link do Drive, carregar uma lista, importar e ver "neste aparelho".

**Dado da obra piloto:**
- A lista dos 7 modelos foi montada fora do repositório, em `modelos_drive.json`, na pasta de projetos da obra no PC do Nicolas.
- Ela tem o id da pasta e o id de cada arquivo. Os ids reais não entram no código nem nos testes; os testes usam ids fictícios.
- Falta carregá-la no app pela conta de gestor da obra: Leitor de IFC → Modelos → "Carregar a lista de modelos (.json)". Uma vez só; depois desce para todos os aparelhos.
- O Nicolas deixou a pasta como "qualquer pessoa com o link: leitor" em 21/11. Assim qualquer aparelho baixa sem entrar na conta Google.

**Por que o app não lista a pasta sozinho, só com o id dela:** listar uma pasta do Drive exige a Drive API, que pede uma chave do Google e a liberação de `https://www.googleapis.com` no app. É a proposta abaixo. Sem isso, a lista vem do JSON.

**Teste real em 21/11** (fora do repositório, script no PC):
- Bancada `dev/ifc.html?obra=exe` com a lista real da obra piloto.
- Em tablet (1280×800) e celular (375×812):
  - listou os 7 modelos, sem rolagem lateral;
  - "Baixar" na Furação (10 MB) baixou do Drive de verdade em cerca de 2 s;
  - o arquivo baixado é igual ao da pasta de projetos (mesmo md5);
  - "Importar IFC" abriu 3.747 elementos;
  - o item ficou "neste aparelho", com "Abrir";
  - sem erro na página.
- O arquivo baixado foi apagado depois. Nada foi para o servidor.
- Detalhe do Chrome: o download aparece na aba do leitor, e a aba nova do Drive fecha sozinha.

**Proposta, não feita: baixar dentro do app, com barra de progresso, sem abrir o Drive.** Precisa de três coisas:
1. A pasta compartilhada como "qualquer pessoa com o link" (feito em 21/11).
2. Uma chave de API do Google (Drive API) restrita ao endereço do site.
3. Acrescentar `https://www.googleapis.com` na lista de permissões do navegador (`app/vite.config.ts`).

## 22/11/2026: teste dos pacotes do Drive (frente 13)

- Link de baixar passou a ser o de download do Drive (`drive.usercontent.google.com`, `confirm=t`): no Android o link `drive.google.com` abria o app do Drive.
- `.obra3d` versão 2: os psets vão em pedaços de 2.000 (antes um JSON só passava do limite de texto do navegador nos modelos de ~1 GB e o "neste aparelho" falhava). Versão 1 continua abrindo.
- Erro de memória ao abrir modelo grande no celular mostra mensagem clara (abrir no PC ou IFC por pavimento).
- Tela vazia com barra curta: botão "Importar IFC" não some mais (`safe center`). Mensagem "lista carregada" não sai mais com cara de erro.
- PC: os 7 modelos abriram. Celular: FR e AR abriram; o de 1,6 GB baixou e não abriu (memória). Tablet: lista e download ok, abertura interrompida.
- Pendente: confirmar no PC que os modelos de ~1 GB agora ficam "neste aparelho" com o formato v2; teste no site depois do merge do #61.
