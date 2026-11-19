// IFC pequeno escrito à mão para os testes: dois pavimentos, duas paredes, um pilar, uma laje e uma janela.
// Não é dado de obra. Unidade do arquivo: milímetro (o leitor tem que converter para metros).
//
//   Parede A: x de 0 a 5 m, y de 0 a 0,2 m, z de 0 a 3 m (térreo)
//   Parede B: mesma planta, z de 3 a 6 m (1º pavimento)
//   Pilar P1: 0,4 x 0,4 m centrado em (2, 2), z de 0 a 3 m (térreo)
//   Laje L1:  5 x 4 m, 0,1 m de espessura, topo em z = 3 m (1º pavimento)
//   Janela J1: caixa de 1 x 0,1 x 1 m com cor transparente (térreo)

function solidoExtrudado(id: number, x: number, y: number, z: number, dx: number, dy: number, altura: number): string {
  return [
    `#${id}=IFCCARTESIANPOINT((${(x + dx / 2).toFixed(1)},${(y + dy / 2).toFixed(1)},${z.toFixed(1)}));`,
    `#${id + 1}=IFCAXIS2PLACEMENT3D(#${id},$,$);`,
    `#${id + 2}=IFCRECTANGLEPROFILEDEF(.AREA.,$,#24,${dx.toFixed(1)},${dy.toFixed(1)});`,
    `#${id + 3}=IFCEXTRUDEDAREASOLID(#${id + 2},#${id + 1},#20,${altura.toFixed(1)});`,
  ].join('\n')
}

function produto(tipo: string, id: number, solido: number, nome: string, tag: string): string {
  const guid = String(id).padStart(22, '0')
  const extra = tipo === 'IFCSLAB' ? ',.FLOOR.' : ''
  return [
    `#${id}=IFCSHAPEREPRESENTATION(#30,'Body','SweptSolid',(#${solido}));`,
    `#${id + 1}=IFCPRODUCTDEFINITIONSHAPE($,$,(#${id}));`,
    `#${id + 2}=${tipo}('${guid}',#5,'${nome}',$,$,#40,#${id + 1},'${tag}'${extra});`,
  ].join('\n')
}

export function amostraIfc(): string {
  const linhas = [
    'ISO-10303-21;',
    'HEADER;',
    "FILE_DESCRIPTION(('Teste'),'2;1');",
    "FILE_NAME('amostra.ifc','2026-11-06T00:00:00',('Sistema Obra'),('Sistema Obra'),'','','');",
    "FILE_SCHEMA(('IFC4'));",
    'ENDSEC;',
    'DATA;',
    "#1=IFCPROJECT('0000000000000000000001',#5,'Amostra',$,$,$,$,(#31),#6);",
    "#2=IFCPERSON($,'Teste',$,$,$,$,$,$);",
    "#3=IFCORGANIZATION($,'Teste',$,$,$);",
    '#4=IFCPERSONANDORGANIZATION(#2,#3,$);',
    "#7=IFCAPPLICATION(#3,'1','Teste','Teste');",
    '#5=IFCOWNERHISTORY(#4,#7,$,.ADDED.,$,$,$,0);',
    '#6=IFCUNITASSIGNMENT((#8));',
    '#8=IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.);',
    '#20=IFCDIRECTION((0.,0.,1.));',
    '#21=IFCDIRECTION((1.,0.,0.));',
    '#22=IFCCARTESIANPOINT((0.,0.,0.));',
    '#23=IFCAXIS2PLACEMENT3D(#22,$,$);',
    '#25=IFCCARTESIANPOINT((0.,0.));',
    '#24=IFCAXIS2PLACEMENT2D(#25,$);',
    "#31=IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,#23,$);",
    "#30=IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Body','Model',*,*,*,*,#31,$,.MODEL_VIEW.,$);",
    '#40=IFCLOCALPLACEMENT($,#23);',
    "#41=IFCSITE('0000000000000000000002',#5,'Terreno',$,$,#40,$,$,.ELEMENT.,$,$,$,$,$);",
    "#42=IFCBUILDING('0000000000000000000003',#5,'Predio',$,$,#40,$,$,.ELEMENT.,$,$,$);",
    "#43=IFCBUILDINGSTOREY('0000000000000000000004',#5,'Terreo',$,$,#40,$,$,.ELEMENT.,0.);",
    "#44=IFCBUILDINGSTOREY('0000000000000000000005',#5,'1 Pavimento',$,$,#40,$,$,.ELEMENT.,3000.);",
    "#45=IFCRELAGGREGATES('0000000000000000000006',#5,$,$,#1,(#41));",
    "#46=IFCRELAGGREGATES('0000000000000000000007',#5,$,$,#41,(#42));",
    "#47=IFCRELAGGREGATES('0000000000000000000008',#5,$,$,#42,(#43,#44));",
    solidoExtrudado(100, 0, 0, 0, 5000, 200, 3000),
    solidoExtrudado(110, 0, 0, 3000, 5000, 200, 3000),
    solidoExtrudado(120, 1800, 1800, 0, 400, 400, 3000),
    solidoExtrudado(130, 0, 0, 2900, 5000, 4000, 100),
    solidoExtrudado(140, 2000, 3000, 1000, 1000, 100, 1000),
    produto('IFCWALL', 200, 103, 'Parede A', 'T-001'),
    produto('IFCWALL', 210, 113, 'Parede B', 'T-002'),
    produto('IFCCOLUMN', 220, 123, 'P1', 'T-003'),
    produto('IFCSLAB', 230, 133, 'L1', 'T-004'),
    produto('IFCWINDOW', 240, 143, 'J1', 'T-005'),
    "#300=IFCRELCONTAINEDINSPATIALSTRUCTURE('0000000000000000000009',#5,$,$,(#202,#222,#242),#43);",
    "#301=IFCRELCONTAINEDINSPATIALSTRUCTURE('000000000000000000000A',#5,$,$,(#212,#232),#44);",
    // Camada, material e propriedades
    "#310=IFCPRESENTATIONLAYERASSIGNMENT('Alvenaria Externa',$,(#200,#210),$);",
    "#311=IFCPRESENTATIONLAYERASSIGNMENT('Estrutura',$,(#220,#230),$);",
    "#320=IFCMATERIAL('Concreto C30',$,$);",
    "#321=IFCRELASSOCIATESMATERIAL('000000000000000000000B',#5,$,$,(#222,#232),#320);",
    "#330=IFCPROPERTYSINGLEVALUE('Fck',$,IFCPRESSUREMEASURE(30.),$);",
    "#331=IFCPROPERTYSINGLEVALUE('Resistente ao fogo',$,IFCBOOLEAN(.T.),$);",
    "#332=IFCPROPERTYSET('000000000000000000000C',#5,'Dados do concreto',$,(#330,#331));",
    "#333=IFCRELDEFINESBYPROPERTIES('000000000000000000000D',#5,$,$,(#222),#332);",
    // Janela transparente
    '#340=IFCCOLOURRGB($,0.6,0.8,0.9);',
    '#341=IFCSURFACESTYLERENDERING(#340,0.7,$,$,$,$,$,$,.FLAT.);',
    "#342=IFCSURFACESTYLE('Vidro',.BOTH.,(#341));",
    '#343=IFCSTYLEDITEM(#143,(#342),$);',
    'ENDSEC;',
    'END-ISO-10303-21;',
  ]
  return linhas.join('\n')
}

export function amostraBytes(): Uint8Array {
  return new TextEncoder().encode(amostraIfc())
}
