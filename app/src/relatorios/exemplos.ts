// Exemplos do diário de obra e dos relatórios, para a apresentação (pedido do Nicolas em 07/11/2026:
// "crie uns exemplos para facilitar minha vida"). Entram uma vez por obra, como registros já
// baixados (pendente 0), assinados pelo "usuário do pacote": não vão para a fila nem para o
// arquivo .obra. Os nomes de pessoas e empresas são inventados; as peças são as da planta.
import type { BancoLocal, Linha } from '../nucleo/banco_local'
import type { ObraLocal } from '../nucleo/conta'
import { USUARIO_DO_PACOTE, uuidDeterministico } from '../nucleo/pacote_obra'
import { abrirPacote } from '../fvs/pacote'
import { idDaLaje, nomeNoBanco } from '../concreto/lajes'
import { dataLocal } from '../concreto/cps'
import { tirarExemplos as tirarDocumentosDeExemplo } from '../documentos/exemplos'
import { diasAntes, ehLinhaDeExemplo, lajesDeExemplo } from './regras'
import { TABELAS_RELATORIOS } from './tabelas'

// v2 (17/11/2026): mais concretagens com CPs. Aparelho que já tinha os exemplos antigos recebe os novos
// uma vez; os antigos têm os mesmos ids e só são regravados.
const chaveExemplos = (obraId: string) => `exemplos_relatorios_v2:${obraId}`
const DISPOSITIVO = '00000000-0000-0000-0000-000000000000'

/** Tabelas em que o exemplo grava (fora `arquivos` das fotos e a laje em `elementos`). */
const TABELAS_CONCRETO = ['concretagens', 'caminhoes', 'caminhao_areas', 'caminhao_elementos', 'cp_resultados'] as const
const TABELAS_SEMEADAS = [...TABELAS_RELATORIOS.filter((t) => t !== 'diario_cadastro'), ...TABELAS_CONCRETO]
/** Onde alguém pode ter registrado em cima de um exemplo (correção, andamento, foto, marca, CP). */
const TABELAS_EM_CIMA = [...TABELAS_SEMEADAS]
const CAMPOS_DE_LIGACAO = ['substitui_id', 'relatorio_id', 'servico_id', 'ocorrencia_id', 'foto_id', 'concretagem_id', 'caminhao_id'] as const

type Nova = { tabela: string; id: string; linha: Record<string, unknown> }

interface PecaExemplo {
  id: string
  nome: string
  tipo: string
  /** centro do rótulo na planta (pixels), quando a planta está no aparelho */
  centro?: [number, number]
}

/** Uma foto desenhada na hora (JPEG), para a apresentação ter imagem sem fotografia de obra de verdade. */
export async function fotoDeExemplo(texto: string, data: string, tom: number): Promise<Blob | null> {
  if (typeof document === 'undefined') return null
  const c = document.createElement('canvas')
  c.width = 960
  c.height = 720
  const g = c.getContext('2d')
  if (!g) return null
  const fundo = g.createLinearGradient(0, 0, 0, 720)
  fundo.addColorStop(0, `hsl(${tom}, 25%, 78%)`)
  fundo.addColorStop(1, `hsl(${tom}, 20%, 48%)`)
  g.fillStyle = fundo
  g.fillRect(0, 0, 960, 720)
  // formas de obra: pilares e uma viga, só para parecer um canteiro
  g.fillStyle = 'rgba(70, 70, 70, 0.55)'
  for (let i = 0; i < 4; i++) g.fillRect(120 + i * 220, 220, 70, 380)
  g.fillRect(90, 180, 780, 44)
  g.fillStyle = 'rgba(255, 255, 255, 0.85)'
  g.fillRect(0, 610, 960, 110)
  g.fillStyle = '#1b1c1e'
  g.font = 'bold 34px sans-serif'
  g.fillText('FOTO DE EXEMPLO', 30, 655)
  g.font = '26px sans-serif'
  g.fillText(`${texto} · ${data.split('-').reverse().join('/')}`, 30, 695)
  return new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.8))
}

/**
 * Semeia os exemplos na obra (uma vez). Devolve quantos registros entraram (0 = já havia ou a obra
 * não tem pavimento com peças).
 */
export async function semearExemplos(banco: BancoLocal, obra: ObraLocal, hoje = dataLocal(new Date())): Promise<number> {
  if (await banco.lerMeta<boolean>(chaveExemplos(obra.id))) return 0
  // Obra montada pela Nova obra (a de demonstração, por exemplo) é obra de verdade: sem exemplos.
  // A origem vem do indice.json e o núcleo guarda na meta do pacote (nucleo/pacote_obra.ts).
  const doPacote = await banco.lerMeta<{ origem?: string | null }>(`pacote_obra:${obra.id}`)
  if (doPacote?.origem === 'nova_obra') {
    await banco.gravarMeta(chaveExemplos(obra.id), true)
    return 0
  }
  const ler = (t: string) => banco.registros.where('[tabela+obra_id]').equals([t, obra.id]).toArray().then((r) => r.map((x) => x.linha))
  // Obra que já tem diário, relatório ou concretagem de verdade não recebe exemplo (Nova obra, 09/11/2026:
  // na obra real eles apareciam no meio dos registros e a laje virava uma 22ª peça na FVS).
  for (const t of TABELAS_SEMEADAS) {
    if ((await ler(t)).some((l) => !ehLinhaDeExemplo(l))) {
      await banco.gravarMeta(chaveExemplos(obra.id), true)
      return 0
    }
  }
  const [pavimentos, elementos, plantas, setores] = await Promise.all([ler('pavimentos'), ler('elementos'), ler('plantas'), ler('setores')])
  const comPecas = pavimentos.filter((p) => elementos.some((e) => e.pavimento_id === p.id && (e.tipo === 'P' || e.tipo === 'V'))).sort((a, b) => Number(a.ordem) - Number(b.ordem))
  const pav = comPecas.find((p) => /pilotis/i.test(String(p.nome))) ?? comPecas[2] ?? comPecas[0]
  if (!pav) return 0
  // a planta de forma vigente do pavimento (para o ponto das fotos e a referência da prancha)
  const substituidas = new Set(plantas.map((p) => p.substitui_id).filter(Boolean))
  const planta = plantas.find((p) => p.pavimento_id === pav.id && !substituidas.has(p.id) && setores.find((s) => s.id === p.setor_id && (s.disciplina ?? 'estrutura') === 'estrutura'))
  const plantaRef = planta ? `${String(planta.setor_id)}@${String(planta.revisao)}` : null
  const pacote = planta ? await abrirPacote(planta.id).catch(() => null) : null
  const centroDe = (id: string): [number, number] | undefined => {
    const r = pacote?.manifest.elementos[id]?.rotulo
    return r ? [Math.round((r[0] + r[2]) / 2), Math.round((r[1] + r[3]) / 2)] : undefined
  }
  const ordem = new Intl.Collator('pt-BR', { numeric: true })
  // Peças vizinhas na planta (a primeira pelo nome e as mais perto dela, uma a uma). Antes eram as n
  // primeiras pelo nome, que podem estar em cantos opostos: a área do caminhão virava uma faixa que
  // atravessava o prédio (obra de demonstração, 13/11/2026).
  const pecasDe = (tipo: string, n: number): PecaExemplo[] =>
    cadeiaDeVizinhos(
      elementos
        .filter((e) => e.pavimento_id === pav.id && e.tipo === tipo && (!pacote || pacote.manifest.elementos[e.id]))
        .sort((a, b) => ordem.compare(String(a.nome), String(b.nome)))
        .map((e) => ({ id: e.id, nome: String(e.nome), tipo, centro: centroDe(e.id) })),
      n,
    )
  const pilares = pecasDe('P', 6)
  const vigas = pecasDe('V', 4)
  if (pilares.length === 0 && vigas.length === 0) return 0

  const d3 = diasAntes(hoje, 3)
  const d2 = diasAntes(hoje, 2)
  const d1 = diasAntes(hoje, 1)
  const novas: Nova[] = []
  const fotosParaGravar: Array<{ arquivoId: string; blob: Blob }> = []
  const uid = (chave: string) => uuidDeterministico(`${obra.id}:exemplo:${chave}`)
  const hora = (data: string, h: number, m = 0) => new Date(`${data}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00-03:00`).toISOString()

  const registro = async (tabela: string, chave: string, data: string, h: number, campos: Record<string, unknown>) => {
    const id = await uid(chave)
    novas.push({ tabela, id, linha: { id, obra_id: obra.id, usuario_id: USUARIO_DO_PACOTE, dispositivo_id: DISPOSITIVO, criado_em_dispositivo: hora(data, h), apagado: false, cancelado: false, substitui_id: null, exemplo: true, ...campos } })
    return id
  }
  const marcaPeca = (chave: string, data: string, alvo: Record<string, string>, p: PecaExemplo) =>
    registro('rel_marcas', `marca:${chave}:${p.id}`, data, 17, { ...alvo, pavimento_id: pav.id, planta_ref: plantaRef, forma: 'peca', elemento_id: p.id, contorno: null })
  const marcaPonto = (chave: string, data: string, alvo: Record<string, string>, p: PecaExemplo) =>
    p.centro && plantaRef ? registro('rel_marcas', `ponto:${chave}`, data, 17, { ...alvo, pavimento_id: pav.id, planta_ref: plantaRef, forma: 'ponto', elemento_id: null, contorno: [p.centro] }) : Promise.resolve(null)
  const foto = async (chave: string, data: string, h: number, legenda: string, alvo: Record<string, string> | null, onde: PecaExemplo | undefined, tom: number) => {
    const arquivoId = await uid(`arquivo:${chave}`)
    const blob = await fotoDeExemplo(legenda, data, tom)
    novas.push({
      tabela: 'arquivos',
      id: arquivoId,
      linha: { id: arquivoId, obra_id: obra.id, usuario_id: USUARIO_DO_PACOTE, dispositivo_id: DISPOSITIVO, criado_em_dispositivo: hora(data, h), apagado: false, exemplo: true, caminho: `${obra.id}/relatorios/${arquivoId}.jpg`, nome_original: 'foto.jpg', hash: '0'.repeat(64), tamanho: blob?.size ?? 0, tipo: 'image/jpeg' },
    })
    if (blob) fotosParaGravar.push({ arquivoId, blob })
    const fotoId = await registro('rel_fotos', `foto:${chave}`, data, h, { data, arquivo_id: arquivoId, legenda, servico_id: null, ocorrencia_id: null, relatorio_id: null, ...(alvo ?? {}) })
    if (onde) await marcaPonto(`foto:${chave}`, data, { foto_id: fotoId }, onde)
  }
  const clima = (data: string, periodo: string, tempo: string, condicao: string) => registro('diario_clima', `clima:${data}:${periodo}`, data, periodo === 'manha' ? 7 : 13, { data, periodo, tempo, condicao })
  const efetivo = async (data: string, lista: Array<[string, string, number]>) => {
    for (const [empresa, funcao, quantidade] of lista) await registro('diario_efetivo', `efetivo:${data}:${empresa}:${funcao}`, data, 7, { data, empresa, funcao, quantidade, observacao: null })
  }
  const equipamento = (data: string, nome: string, quantidade: number, situacao: string) => registro('diario_equipamentos', `equip:${data}:${nome}`, data, 7, { data, nome, quantidade, situacao, observacao: null })
  const servico = (data: string, chave: string, descricao: string, situacao: string, avanco: number | null, empresa = 'Construtora Exemplo') =>
    registro('diario_servicos', `servico:${data}:${chave}`, data, 16, { data, descricao, empresa, situacao, avanco_pct: avanco, local_texto: null, observacao: null })
  const ocorrencia = (data: string, chave: string, tipo: string, descricao: string, horas: number | null = null) =>
    registro('diario_ocorrencias', `ocorrencia:${data}:${chave}`, data, 17, { data, tipo, descricao, horas_paradas: horas, local_texto: null })

  const nomes = (l: PecaExemplo[]) => l.map((p) => p.nome).join(', ')
  const pil3 = pilares.slice(0, 3)
  const pil6 = pilares
  const vig2 = vigas.slice(0, 2)

  // ---- há 3 dias: fôrma dos pilares, dia fechado (RDO nº 1)
  await clima(d3, 'manha', 'sol', 'praticavel')
  await clima(d3, 'tarde', 'nublado', 'praticavel')
  await efetivo(d3, [['Construtora Exemplo', 'Encarregado', 1], ['Construtora Exemplo', 'Carpinteiro', 6], ['Construtora Exemplo', 'Armador', 4], ['Construtora Exemplo', 'Servente', 5]])
  await equipamento(d3, 'Grua', 1, 'operando')
  await equipamento(d3, 'Serra circular', 2, 'operando')
  const s31 = await servico(d3, 'forma', `Montagem de fôrma dos pilares ${nomes(pil6)} (${pav.nome})`, 'em_andamento', 60)
  for (const p of pil6) await marcaPeca(`s31`, d3, { servico_id: s31 }, p)
  const s32 = await servico(d3, 'armacao', `Armação das vigas ${nomes(vig2)}`, 'iniciado', 20)
  for (const v of vig2) await marcaPeca(`s32`, d3, { servico_id: s32 }, v)
  await registro('diario_materiais', `material:${d3}:aco`, d3, 10, { data: d3, material: 'Aço CA-50 (barras 10 e 12,5 mm)', quantidade: 2400, unidade: 'kg', fornecedor: 'Siderúrgica Exemplo', nota_fiscal: '10234', observacao: null })
  await ocorrencia(d3, 'relato', 'relato', `Dia normal de trabalho. Equipe de carpintaria concentrada nos pilares do ${pav.nome}; armação das vigas começou no fim da tarde. Sem intercorrências.`)
  await foto(`${d3}-1`, d3, 15, `Fôrma dos pilares ${nomes(pil3)} em montagem`, { servico_id: s31 }, pil3[0], 30)
  await registro('diario_fechamentos', `fech:${d3}`, d3, 18, { data: d3, acao: 'fechado', numero: 1, observacao: null })

  // ---- anteontem: chuva à tarde, visita, RDO nº 2
  await clima(d2, 'manha', 'nublado', 'praticavel')
  await clima(d2, 'tarde', 'chuva_forte', 'impraticavel')
  await efetivo(d2, [['Construtora Exemplo', 'Encarregado', 1], ['Construtora Exemplo', 'Carpinteiro', 6], ['Construtora Exemplo', 'Armador', 5], ['Construtora Exemplo', 'Pedreiro', 3], ['Construtora Exemplo', 'Servente', 6], ['Instaladora Exemplo', 'Eletricista', 2]])
  await equipamento(d2, 'Grua', 1, 'parado')
  await equipamento(d2, 'Serra circular', 2, 'operando')
  const s21 = await servico(d2, 'forma', `Montagem de fôrma dos pilares ${nomes(pil6)} (${pav.nome})`, 'concluido', 100)
  for (const p of pil6) await marcaPeca(`s21`, d2, { servico_id: s21 }, p)
  const s22 = await servico(d2, 'armacao', `Armação das vigas ${nomes(vig2)}`, 'em_andamento', 70)
  for (const v of vig2) await marcaPeca(`s22`, d2, { servico_id: s22 }, v)
  await servico(d2, 'eletrica', 'Passagem de eletrodutos na laje (instaladora)', 'paralisado', 30, 'Instaladora Exemplo')
  await ocorrencia(d2, 'chuva', 'interrupcao', 'Chuva forte das 14h às 16h30. Equipes recolhidas; concretagem prevista para hoje transferida para amanhã.', 2.5)
  const o22 = await ocorrencia(d2, 'visita', 'visita', 'Visita do engenheiro da fiscalização. Conferiu a armadura das vigas e pediu reforço de espaçadores.')
  for (const v of vig2) await marcaPeca(`o22`, d2, { ocorrencia_id: o22 }, v)
  await ocorrencia(d2, 'relato', 'relato', 'Manhã produtiva com a fôrma dos pilares concluída e conferida pela FVS. À tarde a chuva parou a obra; a concretagem dos pilares ficou para amanhã. Fiscalização visitou a armação das vigas.')
  await foto(`${d2}-1`, d2, 9, `Pilares ${nomes(pil3)} com fôrma concluída`, null, pil3[1], 120)
  await foto(`${d2}-2`, d2, 14, 'Chuva forte no canteiro', null, undefined, 210)
  await registro('diario_fechamentos', `fech:${d2}`, d2, 18, { data: d2, acao: 'fechado', numero: 2, observacao: null })

  // ---- ontem: concretagem dos pilares, dia aberto, com relatórios
  await clima(d1, 'manha', 'sol', 'praticavel')
  await clima(d1, 'tarde', 'sol', 'praticavel')
  await efetivo(d1, [['Construtora Exemplo', 'Encarregado', 1], ['Construtora Exemplo', 'Carpinteiro', 5], ['Construtora Exemplo', 'Armador', 5], ['Construtora Exemplo', 'Pedreiro', 4], ['Construtora Exemplo', 'Servente', 7], ['Instaladora Exemplo', 'Eletricista', 2]])
  await equipamento(d1, 'Grua', 1, 'operando')
  await equipamento(d1, 'Bomba de concreto', 1, 'operando')
  await equipamento(d1, 'Vibrador de imersão', 3, 'operando')
  const s11 = await servico(d1, 'concretagem', `Concretagem dos pilares ${nomes(pil6)} (fck 40 MPa)`, 'concluido', 100)
  for (const p of pil6) await marcaPeca(`s11`, d1, { servico_id: s11 }, p)
  const s12 = await servico(d1, 'armacao', `Armação das vigas ${nomes(vig2)}`, 'concluido', 100)
  for (const v of vig2) await marcaPeca(`s12`, d1, { servico_id: s12 }, v)
  await servico(d1, 'escoramento', `Escoramento da laje do ${pav.nome}`, 'em_andamento', 40)
  await registro('diario_materiais', `material:${d1}:concreto`, d1, 9, { data: d1, material: 'Concreto usinado fck 40 MPa, brita 1', quantidade: 24, unidade: 'm³', fornecedor: 'Concreteira Exemplo', nota_fiscal: '55012', observacao: '3 caminhões; slump 12 ± 2' })
  await ocorrencia(d1, 'relato', 'relato', `Concretagem dos pilares ${nomes(pil6)} entre 8h e 11h30, com 3 caminhões (24 m³). Corpos de prova moldados. Tarde dedicada ao escoramento da laje e ao fechamento da armação das vigas.`)
  await foto(`${d1}-1`, d1, 8, 'Bomba de concreto posicionada', null, pil6[3] ?? pil3[0], 200)
  await foto(`${d1}-2`, d1, 10, `Concretagem do pilar ${pil6[4]?.nome ?? pil3[2]?.nome ?? ''}`, { servico_id: s11 }, pil6[4] ?? pil3[2], 20)
  await foto(`${d1}-3`, d1, 16, 'Escoramento da laje em andamento', null, vigas[2] ?? vig2[0], 90)

  // relatórios avulsos
  const r1 = await registro('relatorios', `rel:problema`, d1, 15, {
    tipo: 'problema',
    data: d1,
    titulo: `Vazamento de nata na fôrma da ${vig2[0]?.nome ?? 'viga'}`,
    descricao: 'Fôrma com frestas no fundo; nata escorrendo durante a concretagem de teste. Calafetar antes da concretagem das vigas.',
    gravidade: 'alta',
    responsavel: 'Mestre Joaquim',
    prazo: diasAntes(hoje, -2),
    local_texto: null,
    itens: [],
  })
  if (vig2[0]) await marcaPeca('r1', d1, { relatorio_id: r1 }, vig2[0])
  await foto('r1', d1, 15, 'Fresta no fundo da fôrma da viga', { relatorio_id: r1 }, vig2[0], 0)
  const r2 = await registro('relatorios', `rel:limpeza`, d2, 11, {
    tipo: 'limpeza',
    data: d2,
    titulo: `Vistoria de limpeza · ${pav.nome}`,
    descricao: 'Vistoria semanal.',
    gravidade: 'baixa',
    responsavel: 'Encarregado Paulo',
    prazo: null,
    local_texto: pav.nome,
    itens: [
      { item: 'Entulho removido do pavimento', resultado: 'ok' },
      { item: 'Acessos e circulação livres', resultado: 'ok' },
      { item: 'Materiais organizados e empilhados', resultado: 'atencao' },
      { item: 'Caçambas sem excesso', resultado: 'ok' },
      { item: 'Sanitários e vestiários limpos', resultado: 'ok' },
      { item: 'Refeitório limpo', resultado: 'ok' },
      { item: 'Área externa e calçada limpas', resultado: 'ok' },
    ],
  })
  await registro('relatorio_andamentos', `and:r2`, d2, 12, { relatorio_id: r2, situacao: 'resolvido', comentario: 'Madeira reorganizada no mesmo dia.' })
  const r3 = await registro('relatorios', `rel:seguranca`, d1, 9, {
    tipo: 'seguranca',
    data: d1,
    titulo: `Vistoria de segurança · ${pav.nome}`,
    descricao: 'Guarda-corpo da periferia removido para a passagem da bomba e não recolocado.',
    gravidade: 'alta',
    responsavel: 'Técnico de segurança Carla',
    prazo: hoje,
    local_texto: null,
    itens: [
      { item: 'Uso de EPI pelas equipes', resultado: 'ok' },
      { item: 'Guarda-corpo e proteção de periferia', resultado: 'ruim' },
      { item: 'Aberturas de piso protegidas', resultado: 'ok' },
      { item: 'Instalações elétricas provisórias', resultado: 'atencao' },
      { item: 'Escadas e andaimes em ordem', resultado: 'ok' },
      { item: 'Sinalização', resultado: 'ok' },
    ],
  })
  if (pil6[5] ?? pil3[0]) await marcaPonto('r3', d1, { relatorio_id: r3 }, pil6[5] ?? pil3[0])
  await registro('relatorio_andamentos', `and:r3`, d1, 10, { relatorio_id: r3, situacao: 'em_andamento', comentario: 'Guarda-corpo sendo recolocado.' })

  // ---- Concreto: a concretagem de ontem, caminhão por caminhão, com as áreas das duas canetas
  // (pilares; vigas e laje) e a laje do trecho, para o mapa de concretagens ter o que mostrar
  const trecho = planta ? String(setores.find((s) => s.id === planta.setor_id)?.nome_projeto ?? 'Trecho 1') : null
  if (planta && plantaRef && pacote && trecho && pil6.length >= 2) {
    const caixaDe = (ids: string[], folga: number): Array<[number, number]> | null =>
      caixaNaPlanta(
        ids.flatMap((id) => (pacote.manifest.elementos[id]?.polys ?? []).flat()),
        folga / 100,
        pacote.manifest.largura,
        pacote.manifest.altura,
      )
    const conc = await registro('concretagens', 'conc:1', d1, 7, {
      pavimento_id: pav.id,
      data: d1,
      local_descricao: `${pav.nome} \\ ${trecho} \\ Pilares`,
      codigo_construpoint: 'EXEMPLO-0001',
      fornecedor: 'Concreteira Exemplo',
      fck_mpa: 40,
      slump_cm: 12,
      slump_tolerancia_cm: 2,
      idades_dias: [7, 28],
      cps_por_idade: 2,
      observacao: 'Exemplo para a apresentação.',
    })
    const grupos = [pil6.slice(0, 2), pil6.slice(2, 4), pil6.slice(4, 6).length ? pil6.slice(4, 6) : pil6.slice(0, 1)]
    const horaBR = (h: number, m: number) => new Date(`${d1}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00-03:00`).toISOString()
    for (let i = 0; i < grupos.length; i++) {
      const seq = i + 1
      const cam = await registro('caminhoes', `cam:${seq}`, d1, 8 + i, {
        concretagem_id: conc,
        sequencia: seq,
        nota_fiscal: `5501${seq}`,
        volume_m3: 8,
        saida_usina: horaBR(7 + i, 10),
        chegada_obra: horaBR(7 + i, 50),
        inicio_descarga: horaBR(8 + i, 0),
        fim_descarga: horaBR(8 + i, 40),
        slump_medido_cm: [12, 13, 11.5][i],
        agua_adicionada_l: i === 1 ? 20 : 0,
        cps_moldados: 4,
        observacao: null,
      })
      const pilaresDoCam = grupos[i]
      const contorno = caixaDe(pilaresDoCam.map((p) => p.id), 30)
      if (contorno) await registro('caminhao_areas', `area:${seq}:p`, d1, 8 + i, { caminhao_id: cam, planta_ref: plantaRef, contorno, alvo: 'pilares' })
      for (const p of pilaresDoCam) await registro('caminhao_elementos', `ce:${seq}:${p.id}`, d1, 8 + i, { caminhao_id: cam, elemento_id: p.id, origem: 'desenho', fracao: 1, incluido: true })
      if (seq === 3 && vig2.length) {
        // o último caminhão fechou as vigas e a laje do trecho: área da outra caneta, tracejada no mapa
        const contornoVigas = caixaDe(vig2.map((v) => v.id), 25)
        if (contornoVigas) await registro('caminhao_areas', `area:${seq}:v`, d1, 11, { caminhao_id: cam, planta_ref: plantaRef, contorno: contornoVigas, alvo: 'vigas_laje' })
        for (const v of vig2) await registro('caminhao_elementos', `ce:${seq}:${v.id}`, d1, 11, { caminhao_id: cam, elemento_id: v.id, origem: 'desenho', fracao: 1, incluido: true })
        const lajeId = await idDaLaje(pav.id, trecho)
        if (!elementos.some((e) => e.id === lajeId)) {
          novas.push({ tabela: 'elementos', id: lajeId, linha: { id: lajeId, obra_id: obra.id, usuario_id: USUARIO_DO_PACOTE, dispositivo_id: DISPOSITIVO, criado_em_dispositivo: hora(d1, 11), apagado: false, exemplo: true, pavimento_id: pav.id, tipo: 'L', nome: nomeNoBanco(trecho), secao: null } })
        }
        await registro('caminhao_elementos', `ce:${seq}:laje`, d1, 11, { caminhao_id: cam, elemento_id: lajeId, origem: 'manual', fracao: null, incluido: true })
      }
    }
  }


  // ---- Concreto: mais concretagens, em outros pavimentos e mais antigas, com CPs rompidos (demo de
  // 17/11/2026: "crie umas amostras melhores"). Uma delas com o CP de 28 dias abaixo do fck, para o
  // laudo mostrar o que acontece quando reprova.
  const cenarios: Array<{ chave: string; dias: number; alvo: 'pilares' | 'vigas_laje'; volumes: number[]; slumps: number[]; cp7: number[]; cp28: number[] | null; nf: number; obs?: string }> = [
    { chave: 'a', dias: 41, alvo: 'pilares', volumes: [8, 8, 6.5], slumps: [12, 11, 13], cp7: [31.2, 29.8, 32.5], cp28: [44.1, 42.6, 45.3], nf: 54870 },
    { chave: 'b', dias: 33, alvo: 'vigas_laje', volumes: [8, 8, 8, 5], slumps: [12, 14, 12.5, 11], cp7: [30.4, 28.9, 27.1, 31], cp28: [43.8, 41.2, 37.6, 44.9], nf: 54960, obs: 'Caminhão 3 com água adicionada na obra (25 L). Acompanhar o CP de 28 dias.' },
    { chave: 'c', dias: 12, alvo: 'pilares', volumes: [8, 7], slumps: [12, 12], cp7: [30.9, 32.2], cp28: null, nf: 55180 },
    { chave: 'd', dias: 5, alvo: 'vigas_laje', volumes: [8, 8, 8], slumps: [11.5, 12, 13], cp7: [], cp28: null, nf: 55300 },
  ]
  const outrosPavs = comPecas.filter((p) => p.id !== pav.id)
  for (let k = 0; k < cenarios.length && k < outrosPavs.length; k++) {
    const cen = cenarios[k]
    const pv = outrosPavs[k]
    const data = diasAntes(hoje, cen.dias)
    const pl = plantas.find((p) => p.pavimento_id === pv.id && !substituidas.has(p.id) && setores.find((s) => s.id === p.setor_id && (s.disciplina ?? 'estrutura') === 'estrutura'))
    const ref = pl ? `${String(pl.setor_id)}@${String(pl.revisao)}` : null
    const pac = pl ? await abrirPacote(pl.id).catch(() => null) : null
    const centro = (id: string): [number, number] | undefined => {
      const r = pac?.manifest.elementos[id]?.rotulo
      return r ? [Math.round((r[0] + r[2]) / 2), Math.round((r[1] + r[3]) / 2)] : undefined
    }
    const tipo = cen.alvo === 'pilares' ? 'P' : 'V'
    const porCam = cen.alvo === 'pilares' ? 3 : 2
    const pecas = cadeiaDeVizinhos(
      elementos
        .filter((e) => e.pavimento_id === pv.id && e.tipo === tipo && (!pac || pac.manifest.elementos[e.id]))
        .sort((a, b) => ordem.compare(String(a.nome), String(b.nome)))
        .map((e) => ({ id: e.id, nome: String(e.nome), tipo, centro: centro(e.id) })),
      porCam * cen.volumes.length,
    )
    if (pecas.length === 0) continue
    const trechoPv = pl ? String(setores.find((s) => s.id === pl.setor_id)?.nome_projeto ?? 'Trecho 1') : 'Trecho 1'
    const parte = cen.alvo === 'pilares' ? 'Pilares' : 'Vigas e laje'
    const conc = await registro('concretagens', `conc:${cen.chave}`, data, 7, {
      pavimento_id: pv.id,
      data,
      local_descricao: `${pv.nome} \\ ${trechoPv} \\ ${parte}`,
      codigo_construpoint: `EXEMPLO-000${k + 2}`,
      fornecedor: 'Concreteira Exemplo',
      fck_mpa: 40,
      slump_cm: 12,
      slump_tolerancia_cm: 2,
      idades_dias: [7, 28],
      cps_por_idade: 2,
      observacao: cen.obs ?? 'Exemplo para a apresentação.',
    })
    const horaDe = (h: number, m: number) => new Date(`${data}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00-03:00`).toISOString()
    let lajeFeita = false
    for (let i = 0; i < cen.volumes.length; i++) {
      const seq = i + 1
      const h0 = 7 + i
      const cam = await registro('caminhoes', `cam:${cen.chave}:${seq}`, data, 8 + i, {
        concretagem_id: conc,
        sequencia: seq,
        nota_fiscal: String(cen.nf + seq),
        volume_m3: cen.volumes[i],
        saida_usina: horaDe(h0, 5),
        chegada_obra: horaDe(h0, 45 + (i % 2) * 5),
        inicio_descarga: horaDe(h0 + 1, 0),
        fim_descarga: horaDe(h0 + 1, 35 + (i % 3) * 5),
        slump_medido_cm: cen.slumps[i],
        agua_adicionada_l: cen.chave === 'b' && seq === 3 ? 25 : 0,
        cps_moldados: 4,
        observacao: null,
      })
      const doCam = pecas.slice(i * porCam, (i + 1) * porCam)
      const contorno = pac && doCam.length ? caixaNaPlanta(doCam.flatMap((p) => (pac.manifest.elementos[p.id]?.polys ?? []).flat()), 0.3, pac.manifest.largura, pac.manifest.altura) : null
      if (contorno && ref) await registro('caminhao_areas', `area:${cen.chave}:${seq}`, data, 8 + i, { caminhao_id: cam, planta_ref: ref, contorno, alvo: cen.alvo })
      for (const p of doCam) await registro('caminhao_elementos', `ce:${cen.chave}:${seq}:${p.id}`, data, 8 + i, { caminhao_id: cam, elemento_id: p.id, origem: 'desenho', fracao: 1, incluido: true })
      if (cen.alvo === 'vigas_laje' && !lajeFeita) {
        // a laje do trecho entra no primeiro caminhão (marcada à mão, como na obra)
        lajeFeita = true
        const lajeId = await idDaLaje(pv.id, trechoPv)
        if (!elementos.some((e) => e.id === lajeId) && !novas.some((n) => n.id === lajeId)) {
          novas.push({ tabela: 'elementos', id: lajeId, linha: { id: lajeId, obra_id: obra.id, usuario_id: USUARIO_DO_PACOTE, dispositivo_id: DISPOSITIVO, criado_em_dispositivo: hora(data, 8), apagado: false, exemplo: true, pavimento_id: pv.id, tipo: 'L', nome: nomeNoBanco(trechoPv), secao: null } })
        }
        await registro('caminhao_elementos', `ce:${cen.chave}:${seq}:laje`, data, 8, { caminhao_id: cam, elemento_id: lajeId, origem: 'manual', fracao: null, incluido: true })
      }
      // corpos de prova rompidos: 2 por idade; o exemplar é o maior, o outro um pouco abaixo
      const rompe = async (idade: number, valor: number | undefined) => {
        if (valor === undefined) return
        const dataEnsaio = diasAntes(hoje, cen.dias - idade)
        for (const n of [1, 2]) {
          await registro('cp_resultados', `cp:${cen.chave}:${seq}:${idade}:${n}`, dataEnsaio, 10, {
            caminhao_id: cam,
            idade_dias: idade,
            numero_cp: n,
            data_ensaio: dataEnsaio,
            resistencia_mpa: Math.round((n === 1 ? valor : valor - 1.4 - (i % 2) * 0.6) * 10) / 10,
            origem: 'manual',
            laudo_arquivo_id: null,
            observacao: null,
          })
        }
      }
      await rompe(7, cen.cp7[i])
      if (cen.cp28) await rompe(28, cen.cp28[i])
    }
  }

  await banco.transaction('rw', banco.registros, banco.conteudos, banco.meta, async () => {
    await banco.registros.bulkPut(novas.map((n) => ({ tabela: n.tabela, id: n.id, obra_id: obra.id, linha: n.linha as unknown as Linha, pendente: 0 as const })))
    for (const f of fotosParaGravar) await banco.conteudos.put({ id: f.arquivoId, bytes: await f.blob.arrayBuffer() })
    await banco.gravarMeta(chaveExemplos(obra.id), true)
  })
  return novas.length
}

/**
 * Tira os exemplos da apresentação deste aparelho: diário, relatórios, marcas, fotos, a concretagem
 * com os caminhões, a laje que o exemplo criou e os documentos de exemplo. Leva junto o que alguém
 * registrou em cima de um exemplo (correção, andamento, foto, marca ou CP de um caminhão fictício):
 * sozinho, isso não faz sentido. Não volta: a marca de "já semeado" fica. Devolve quantos registros saíram.
 */
export async function tirarExemplos(banco: BancoLocal, obraId: string): Promise<number> {
  const ler = (t: string) => banco.registros.where('[tabela+obra_id]').equals([t, obraId]).toArray()
  const porTabela = new Map<string, Awaited<ReturnType<typeof ler>>>()
  for (const t of TABELAS_EM_CIMA) porTabela.set(t, await ler(t))
  const sai = new Set<string>()
  for (const t of TABELAS_SEMEADAS) for (const r of porTabela.get(t) ?? []) if (ehLinhaDeExemplo(r.linha)) sai.add(r.id)
  // o que foi feito em cima de um exemplo, até não achar mais nada
  for (let mudou = true; mudou; ) {
    mudou = false
    for (const lista of porTabela.values()) {
      for (const r of lista) {
        if (sai.has(r.id)) continue
        const l = r.linha as unknown as Record<string, unknown>
        if (CAMPOS_DE_LIGACAO.some((c) => typeof l[c] === 'string' && sai.has(l[c] as string))) {
          sai.add(r.id)
          mudou = true
        }
      }
    }
  }
  const linhas: Array<{ tabela: string; id: string }> = []
  const arquivos = new Set<string>()
  for (const [tabela, lista] of porTabela) {
    for (const r of lista) {
      if (!sai.has(r.id)) continue
      linhas.push({ tabela, id: r.id })
      const arq = (r.linha as unknown as Record<string, unknown>).arquivo_id
      if (tabela === 'rel_fotos' && typeof arq === 'string') arquivos.add(arq)
    }
  }
  // a laje do exemplo sai se nada que fica aponta para ela (uma concretagem ou ficha de verdade nela, fica)
  const lajes = [...lajesDeExemplo((await ler('elementos')).map((r) => r.linha), (await ler('pavimentos')).map((r) => r.linha))]
  const lajesSaem: string[] = []
  if (lajes.length) {
    const usadas = new Set<string>()
    await banco.registros
      .where('obra_id')
      .equals(obraId)
      .each((r) => {
        const e = (r.linha as unknown as Record<string, unknown>).elemento_id
        if (typeof e === 'string' && !sai.has(r.id)) usadas.add(e)
      })
    lajesSaem.push(...lajes.filter((id) => !usadas.has(id)))
  }
  const chaves = new Set([...linhas.map((l) => `${l.tabela}|${l.id}`), ...[...arquivos].map((id) => `arquivos|${id}`)])
  await banco.transaction('rw', banco.registros, banco.conteudos, banco.fila, banco.meta, async () => {
    for (const l of linhas) await banco.registros.delete([l.tabela, l.id])
    for (const id of arquivos) {
      await banco.registros.delete(['arquivos', id])
      await banco.conteudos.delete(id)
    }
    for (const id of lajesSaem) await banco.registros.delete(['elementos', id])
    // registrado aqui em cima de um exemplo e ainda não enviado: sai da fila também (o exemplo nunca vai ao servidor)
    await banco.fila
      .where('obra_id')
      .equals(obraId)
      .filter((f) => chaves.has(`${f.tabela}|${f.id}`))
      .delete()
    await banco.gravarMeta(chaveExemplos(obraId), true)
  })
  const docs = await tirarDocumentosDeExemplo(banco, obraId)
  return linhas.length + lajesSaem.length + docs
}

/**
 * As `n` peças mais juntas: a primeira da lista e, uma a uma, a mais perto da última escolhida. Peça
 * sem posição na planta vai para o fim (sem planta, fica a ordem da lista).
 */
export function cadeiaDeVizinhos<T extends { centro?: [number, number] }>(pecas: readonly T[], n: number): T[] {
  const com = pecas.filter((p) => p.centro)
  if (com.length === 0) return pecas.slice(0, n)
  const resto = [...com]
  const saida: T[] = [resto.shift()!]
  while (saida.length < n && resto.length) {
    const [ax, ay] = saida[saida.length - 1].centro!
    let melhor = 0
    let dist = Infinity
    resto.forEach((p, i) => {
      const d = (p.centro![0] - ax) ** 2 + (p.centro![1] - ay) ** 2
      if (d < dist) [melhor, dist] = [i, d]
    })
    saida.push(resto.splice(melhor, 1)[0])
  }
  return [...saida, ...pecas.filter((p) => !p.centro)].slice(0, n)
}

/**
 * Retângulo em volta dos pontos, com folga proporcional ao tamanho dele (`fracao` do lado maior, no
 * mínimo 4 px) e preso dentro da planta (0..largura, 0..altura). Antes a folga era fixa (30 px) e a
 * caixa podia sair da folha.
 */
export function caixaNaPlanta(pts: ReadonlyArray<readonly [number, number]>, fracao: number, largura: number, altura: number): Array<[number, number]> | null {
  if (pts.length === 0) return null
  const xs = pts.map((p) => p[0])
  const ys = pts.map((p) => p[1])
  const [mx0, mx1, my0, my1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  const folga = Math.max(4, fracao * Math.max(mx1 - mx0, my1 - my0))
  const prender = (v: number, max: number) => Math.round(Math.min(Math.max(v, 0), max > 0 ? max : v))
  const [x0, x1, y0, y1] = [prender(mx0 - folga, largura), prender(mx1 + folga, largura), prender(my0 - folga, altura), prender(my1 + folga, altura)]
  if (x1 <= x0 || y1 <= y0) return null
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
}
