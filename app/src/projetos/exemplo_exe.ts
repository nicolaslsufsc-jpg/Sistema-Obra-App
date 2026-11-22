// Base de exemplo do painel de Projetos, só para testes (obra fictícia EXE).
// Cobre: desatualizada por número, LO depois da entrega, recolhida, conferir (revisão maior, não achada,
// LO bem posterior, data com erro), duas folhas com o mesmo número e devolvida.
// Obra fictícia EXE (nada de obra real no repositório).
export const VIGENTES_EXE = [
  'disciplina;pasta;numero_de;numero_ate;codigo_exemplo;revisao;data;status;titulo',
  'ESTRUTURAL;LO/Formas;100;105;EXE.ES.LO.100.FORPILOTIS;R02;22/10/2026;Aprovado;FORMAS DO PILOTIS',
  'ESTRUTURAL;LO/Pilares;200;205;EXE.ES.LO.200.PILSUBSOLO;R00;01/11/2026;Aprovado;PILARES DO SUBSOLO',
  'HIDRO;LO/Hidro;001;010;EXE.HI.LO.001.AGUAFRIA;R00;05/11/2026;Liberado para Obra;AGUA FRIA',
  'ARQUITETÔNICO;EX/Projeto Executivo;001;008;EXE.AR.EX.001.SUBSOLO;R03;14/10/2026;Aprovado;SUBSOLO - GERAL e SETORES',
  'ARQUITETÔNICO;EX/Plantas privativas;001;001;EXE.AR.EX.001.CASA01;R06;30/09/2026;Aprovado;CASA 01 (número repetido com a planta geral)',
  'FUNDAÇÃO;LO/Blocos;004;009;EXE.FU.LO.004.BLOCOS;R11;07/05/2026;Aprovado;BLOCOS',
].join('\n')

export const DISTRIBUICAO_EXE = [
  'linha;codigo;revisao;titulo;disciplina;copias;entrega;empresa;colaborador;devolucao',
  '1;100;R01 LO;FORMAS DO PILOTIS;ESTRUTURAL;1;2026-10-15;Empreiteira Alfa;João;', // desatualizada (R01 < R02), 23 d
  '2;101;R02 LO;FORMAS DO PILOTIS;ESTRUTURAL;1;2026-10-24;Formas Delta;Ana;', // em dia
  '3;200;R00;PILARES DO SUBSOLO;ESTRUTURAL;1;2026-09-01;Empreiteira Alfa;Pedro;', // EX R00 antes da LO R00 → desatualizada
  '4;200;R00;PILARES DO SUBSOLO;ESTRUTURAL;1;2026-11-03;Formas Delta;Ana;', // entregue depois da LO → em dia
  '5;4;R00;AGUA FRIA;HIDRO;1;2026-07-20;Hidráulica Beta;Maria;', // "4" = "004"; desatualizada (LO depois)
  '6;004;R00;AGUA FRIA;HIDRO;1;2026-07-10;Hidráulica Beta;Maria;', // mesma pessoa e prancha: provavelmente recolhida
  '7;002;R01;AGUA FRIA;HIDRO;1;2026-10-01;Elétrica Gama;Rui;', // revisão maior → conferir
  '8;300;R00;VIGAS;ESTRUTURAL;1;2026-10-01;Formas Delta;Ana;', // não achada → conferir
  '9;1;R00;PLANTA BAIXA SUBSOLO GERAL;ARQUITETÔNICO;1;2026-07-22;Empreiteira Alfa;Paulo;', // 2 folhas; pelo título: geral R03 → desatualizada
  '10;005;R11 LO;BLOCOS;FUNDAÇÃO;1;2026-04-01;Empreiteira Alfa;João;', // já diz LO, mas a LO é bem posterior → conferir
  '11;101;R02 LO;FORMAS DO PILOTIS;ESTRUTURAL;1;12/10/202;Elétrica Gama;Rui;', // data com erro → conferir
  'DISCIPLINA;CÓDIGO DA PRANCHA;REVISÃO;TÍTULO;DISCIPLINA;Nº DE CÓPIAS ENTREGUES;DATA DE ENTREGA;EMPRESA;COLABORADOR;DEVOLUÇÃO',
  '12;102;R00 LO;FORMAS DO PILOTIS;ESTRUTURAL;1;2026-08-01;Empreiteira Alfa;João;2026-10-30', // devolvida
].join('\n')

