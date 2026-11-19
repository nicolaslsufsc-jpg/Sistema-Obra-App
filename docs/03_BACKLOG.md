# Backlog: pedidos e decisões do Nicolas

Índice do que o Nicolas pediu nas conversas. **O status de cada item fica só no arquivo do módulo** (FVS: [modulos/1_fvs_status.md](modulos/1_fvs_status.md)); aqui fica uma linha por item, com o link. Itens novos entram no fim, numerados. Só o Nicolas tira item da lista.

| # | Pedido | Data | Módulo | Status em |
|---|---|---|---|---|
| 1 | Lista de reprovações que leva ao local exato | 05/11/2026 | FVS | feito (na `main`); como funciona: [1_fvs.md](modulos/1_fvs.md), "Lista de reprovações"; texto original do pedido: [1_fvs_historico.md](modulos/1_fvs_historico.md) |
| 2 | Correções e melhorias da FVS (itens 5, 1, 4, 2, 3+7 e 6) | 17/11/2026 | FVS | [1_fvs_status.md](modulos/1_fvs_status.md), "Pedido de 17/11" |
| 3 | Fatia 1 da conferência por elemento: furação de viga (absorve o 3+7 do item 2) | 17/11/2026 | FVS | [1_fvs_status.md](modulos/1_fvs_status.md), "Pedido de 17/11" |
| 4 | Servidor com login no ar (Cloudflare Pages + Supabase) | 17/11/2026 | núcleo | [0_nucleo.md](modulos/0_nucleo.md) |
| 5 | Limpeza do repositório e da documentação | 17/11/2026 | todos | [1_fvs_status.md](modulos/1_fvs_status.md), "Estado" |

## Critérios de campo (valem para todo módulo)

Ditos pelo Nicolas em 04/11/2026, a partir dos problemas que ele tem com a ferramenta atual
(não abre com internet fraca, marca e não registra, sincronização que precisa de pessoa):

- abre em menos de 2 s, com ou sem internet;
- marcar um item responde em menos de 0,1 s e nunca depende da rede;
- sincronização sem intervenção de ninguém; nenhum registro se perde, mesmo com queda no meio;
- funciona com 10 Mbit/s ou menos; só o pacote da planta é pesado, e baixa uma vez por trecho,
  com progresso na tela;
- foto reduzida no aparelho antes do envio (a FVS já reduz para 1600 px).

O núcleo atende os quatro primeiros (PR 3). Os módulos não podem quebrá-los: entram como
critério nos testes de tela quando houver medição.

## Em aberto, à espera do Nicolas

- Autorização da empresa por e-mail para subir dados da obra piloto (pranchas, fichas, registros). Sem ela,
  a demonstração de 20 a 25/11 usa a obra TESTE. Projeto antigo nos EUA ainda precisa ser
  pausado e apagado (ver `docs/modulos/0_nucleo.md`).
- Seed da obra piloto ("nome da obra piloto"): aplicar agora ou só depois do ok da empresa.
- Parte 3 da FVS (ambientes): retomada em 18/11/2026, decisões respondidas pelo Nicolas; estado em [1_fvs_status.md](modulos/1_fvs_status.md).
- Publicação no Cloudflare Pages (entrega 7 do núcleo): sem ela não há instalação no celular.
