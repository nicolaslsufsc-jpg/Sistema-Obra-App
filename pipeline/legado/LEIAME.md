# Gerador legado do app de FVS (HTML offline)

Primeira versão da conferência de pilares e vigas, antes do módulo FVS. Fica aqui como referência e ponto de partida do módulo FVS.

## O que faz
Lê os PDFs do projeto estrutural (formas, detalhamento de pilares e de vigas) e gera um `.html` offline por trecho: planta com zoom, pilares e vigas clicáveis, detalhe recortado da prancha, tabela de aço do elemento e a ficha. Cada C/NC/NA grava a hora real do toque. Exporta CSV e backup JSON.

## Como rodar
```
pip install pymupdf pillow numpy scipy
npm install leaflet@1.9.4
python3 gerador_fvs.py --config CONFIG_DA_OBRA.json
python3 indice.py CONFIG_DA_OBRA.json "DD/MM/AAAA" indice_publicar.html
```
O config e o arquivo de fichas da obra ficam **fora do repositório** (são da empresa). No repositório só há exemplos fictícios: `config.exemplo.json` e `itens_fvs.exemplo.json`. O config aponta para os PDFs em `in/forma`, `in/pil` e `in/vig`, que também não ficam no repositório.

## Requisitos dos PDFs
- Exportados do AutoCAD com layers (PILAR_CONCRETO e VIG_FACES na forma; CORTE_LINHAS_DA_TABELA_DE_DETALHE e QUADRO_PILAR nas pranchas de pilar; TABELAS e TEXTO_TABELAS nas tabelas de aço).
- Textos SHX exportados como comentários (é assim que "P124" e "V 46" ficam legíveis).
- Título do detalhe de viga com "Escala vigas" logo abaixo do nome (padrão do Eberick).

## Limitações conhecidas
- Pilares cortados na emenda de trecho: só o rótulo é tocável.
- Vigas em L: só o trecho reto onde está o nome fica destacado.
- Alguns detalhes de viga pegam pedaço do desenho vizinho.

## Armazenamento das marcações (app HTML)
localStorage do navegador, uma chave por elemento e um log por trecho, prefixo `fvs:CHAVE:` (a `chave` do config). O backup JSON exportado pelo app é a entrada para migrar esses registros para o sistema novo.

## Arquivo de fichas
Formato: `{"P": {"codigo", "titulo", "itens": [...]}, "V": {...}}`. O código e o título vêm do arquivo; `publicar_fichas.py` recusa ficha sem código.
