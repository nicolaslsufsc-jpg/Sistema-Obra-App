# Arquitetura (dono: sessão Núcleo)

Versão 1, 03/11/2026. Decisões tomadas com o Nicolas em 03/11.

## Visão
App único de obra com módulos: FVS, Projetos (revisões e cópias), Concreto, Documentos.
Uso em campo no tablet/celular Android sem internet; gestão no PC do escritório.
O app é genérico e do Nicolas: serve para qualquer obra e qualquer empresa. Cada obra entra como dados (pacote da obra ou servidor), nunca como código. Quando a empresa usa outro sistema como registro oficial (por exemplo o Construpoint para a FVS), o app gera o lançamento pronto para a pessoa lançar lá.
Por isso tudo é por obra (`obra_id`) desde o início.

## Peças
- **Estação no PC:** scripts Python (`pipeline/`). Lê as pranchas (PDF exportado do AutoCAD/Eberick), registra revisão, gera planta clicável e detalhes, publica no servidor. Só precisa estar ligado quando chega revisão nova.
- **Servidor:** Supabase na nuvem (Postgres, arquivos, login). Projeto `zktsuwxgvvyufuihkndj`, região São Paulo (desde 04/11/2026; o primeiro, `wtptoyvyypaeotxiqupy`, ficava nos EUA e foi desativado). Começa no plano gratuito; vai para o Pro (US$ 25/mês) quando passar do limite ou quando a pausa por inatividade de 7 dias atrapalhar.
- **App:** PWA instalada no Chrome (Android/DeX) e no PC. Vite + TypeScript + Preact + Leaflet. Banco local Dexie (IndexedDB). `navigator.storage.persist()` na instalação. Hospedagem prevista: Cloudflare Pages.
- **Código:** este repositório (monorepo `app/`, `pipeline/`, `supabase/`). Uma branch por módulo, tudo por PR.

## Login
- Código numérico por e-mail, digitado no próprio app (decisão de 03/11). Hoje são 8 dígitos (configuração do Supabase, confirmada pelo Nicolas em 03/11); o app aceita de 6 a 10. O link mágico foi descartado porque no Android abre no Chrome e não no app instalado.
- Cadastro livre (decisão do Nicolas, 03/11): qualquer e-mail cria conta, mas sem linha em `acessos` não vê nada. Quem libera é o admin. Pode ser fechado depois no painel do Supabase.
- Precisa de internet só para entrar. Depois o app abre e funciona offline com o usuário guardado no aparelho; a sessão renova sozinha quando a internet volta.
- Outra pessoa entrar no mesmo aparelho apaga o que a anterior baixou. Registro feito offline e ainda não enviado nunca é apagado.

## Propriedade e portabilidade
- Código e dados separados. O repositório tem só código e exemplos fictícios; pranchas, fichas, formulários, cadastros, fotos e registros de cada obra ficam fora dele (pacote da obra ou servidor).
- **Nada de empresa nenhuma no repositório** (decisão do Nicolas, 08/11/2026): nem nome, nem ficha, nem código de formulário, nem prancha, nem cadastro, nem script que entre em sistema da empresa. Os nomes que não podem aparecer ficam numa lista fora do git (`nomes_proibidos.txt`), conferida no build.
- Os dados de cada obra são da empresa dona da obra (e do cliente). Saem inteiros num export (SQL + arquivos) se ela pedir.
- **Pendência de risco alto: propriedade do código.** Não há acordo escrito com a empresa da obra piloto sobre de quem é o app e como ela pode usá-lo. A separação entre app e dados ajuda, mas não substitui o acordo (ver `docs/03_APP_LOCAL.md`).
- Export completo de qualquer obra (banco + arquivos) é requisito do núcleo, não extra.

## Regras de dados
- Escrita offline só no que acontece em campo: eventos de FVS, fotos de NC, recebimento de caminhão de concreto.
- Projetos, cópias e documentos: escrita online no escritório. Offline só leitura (plantas vigentes baixadas).
- Tudo que é escrito offline é evento só de inclusão: id uuid gerado no aparelho, hora do aparelho, hora do servidor, usuário, aparelho. Status é derivado do último evento. Sem conflito de sincronização.
- Sincronização: fila de saída no aparelho + baixar registros com `atualizado_em` maior que o último cursor (com margem de 5 min). Detalhes em `docs/02_CONTRATO_NUCLEO.md`.
- Plantas (tiles) e detalhes são arquivos no armazenamento, nunca linhas do banco. Um pacote por trecho, baixado inteiro para uso offline.
- Toda conferência guarda a revisão da prancha usada.

## Em aberto
- Formato de importação de FVS no Construpoint (perguntar ao TI da empresa / suporte Sienge).
- Como os arquivos chegam do Autodoc: exportados à mão pela pessoa, com o login dela (o app não entra no Autodoc).
- Acordo escrito com a empresa da obra piloto: de quem é o código, como ela usa o app e uso dos dados da obra no servidor.
- Dados da obra piloto só sobem depois do e-mail de ok dos chefes. Até lá, dados de teste.
