// Shaders do visor. Um desenho só para todas as peças de um bloco: o que muda por peça (visível,
// selecionada, fantasma, cor) está em duas texturas, indexadas pelo número do elemento.
// Assim, filtrar 40 mil peças é atualizar uma textura, e não refazer a geometria.
import * as THREE from 'three'

export const PASSADA_OPACA = 0
export const PASSADA_TRANSPARENTE = 1
export const PASSADA_ID = 2
export const PASSADA_FANTASMA = 3

/** Uniforms compartilhados por todos os modelos: o plano de corte e o clima da vista. */
export interface UniformsComuns {
  uPlano: { value: THREE.Vector4 }
  uTemPlano: { value: number }
  uDessatura: { value: number }
  /** Força das arestas: fracas de longe (senão o prédio vira uma massa escura), fortes de perto. */
  uAlfaAresta: { value: number }
}

export function novosComuns(): UniformsComuns {
  return {
    uPlano: { value: new THREE.Vector4() },
    uTemPlano: { value: 0 },
    uDessatura: { value: 0 },
    uAlfaAresta: { value: 0.34 },
  }
}

const VERTICE_COMUM = /* glsl */ `
  precision highp float;
  precision highp int;
  uniform highp sampler2D uEstado;
  uniform highp sampler2D uCor;
  uniform int uLargura;
  uniform float uOpacidade;
  uniform int uPassada;
  uniform int uChave;
  uniform float uDessatura;
  uniform float uAlfaAresta;
  in float aEl;
  in vec4 aCor;
  out vec3 vMundo;
  flat out vec4 vId;
  out vec4 vCor;

  const vec3 COR_FANTASMA = vec3(0.77, 0.81, 0.85);
  const vec3 COR_DESTAQUE = vec3(1.0, 0.45, 0.07);
  const vec3 COR_VIDRO = vec3(0.486, 0.776, 0.871);

  // Decide cor e transparência da peça. Devolve false se ela não deve sair nesta passada.
  bool montarCor(out vec3 cor, out float alfa, out bool destaque) {
    int e = int(aEl + 0.5);
    ivec2 p = ivec2(e % uLargura, e / uLargura);
    vec4 st = texelFetch(uEstado, p, 0);
    vec4 ov = texelFetch(uCor, p, 0);
    bool oculto = st.r < 0.5;
    destaque = st.g > 0.5;
    bool fantasma = st.b > 0.5;
    if (oculto) return false;

    if (ov.a > 0.0) {
      // Janela do Revit é uma peça só com caixilho e vidro: o vidro continua vidro em qualquer modo de cor.
      bool vidroProprio = aCor.a < 0.7;
      cor = vidroProprio ? COR_VIDRO : ov.rgb;
      alfa = min(ov.a, vidroProprio ? aCor.a : 1.0);
    } else {
      cor = aCor.rgb;
      alfa = aCor.a;
    }
    alfa *= uOpacidade;
    if (uDessatura > 0.0) {
      float cinza = dot(cor, vec3(0.3, 0.59, 0.11));
      cor = mix(cor, vec3(cinza) * 0.5 + 0.48, uDessatura);
    }
    if (destaque) {
      cor = COR_DESTAQUE;
      alfa = 1.0;
      fantasma = false;
    }
    if (fantasma) {
      cor = COR_FANTASMA;
      alfa = 0.07;
    }
    bool transparente = alfa < 0.995;
    if (uPassada == 0 && (transparente || fantasma)) return false;
    if (uPassada == 1 && (!transparente || fantasma)) return false;
    if (uPassada == 2 && fantasma) return false;
    if (uPassada == 3 && !fantasma) return false;

    int id = e + 1;
    vId = vec4(float(id & 255), float((id >> 8) & 255), float((id >> 16) & 255), float(uChave)) / 255.0;
    return true;
  }
`

const VERTICE_MALHA = /* glsl */ `
  ${VERTICE_COMUM}
  void main() {
    vec3 cor; float alfa; bool destaque;
    if (!montarCor(cor, alfa, destaque)) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0); // fora da tela: a placa de vídeo descarta
      return;
    }
    vec4 mundo = modelMatrix * vec4(position, 1.0);
    vMundo = mundo.xyz;
    vec3 N = normalize(mat3(modelMatrix) * normal);

    // Luz de maquete: cada face do prédio com um tom próprio e nada estourado ou preto.
    const vec3 SOL = vec3(0.4319, 0.7775, 0.4319);
    const vec3 CONTRA = vec3(-0.5774, 0.1925, -0.7935);
    float luz = 0.56 + 0.34 * max(dot(N, SOL), 0.0) + 0.16 * max(dot(N, CONTRA), 0.0) + 0.06 * (N.y * 0.5 + 0.5);
    if (destaque) luz = 0.82 + 0.18 * luz;
    vCor = vec4(cor * min(luz, 1.04), alfa);
    gl_Position = projectionMatrix * viewMatrix * mundo;
  }
`

const FRAGMENTO_MALHA = /* glsl */ `
  precision highp float;
  precision highp int;
  uniform vec4 uPlano;
  uniform int uTemPlano;
  uniform int uPassada;
  in vec3 vMundo;
  flat in vec4 vId;
  in vec4 vCor;
  out vec4 saida;
  void main() {
    if (uTemPlano == 1 && dot(vec4(vMundo, 1.0), uPlano) > 0.0) discard;
    if (uPassada == 2) {
      saida = vId;
      return;
    }
    vec3 c = vCor.rgb;
    if (!gl_FrontFacing) c *= 0.78; // o lado de dentro da casca, visto pelo corte
    saida = vec4(c, vCor.a);
  }
`

const VERTICE_LINHA = /* glsl */ `
  ${VERTICE_COMUM}
  void main() {
    vec3 cor; float alfa; bool destaque;
    if (!montarCor(cor, alfa, destaque) || alfa < 0.05) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      return;
    }
    vec4 mundo = modelMatrix * vec4(position, 1.0);
    vMundo = mundo.xyz;
    vec3 base = destaque ? vec3(0.62, 0.22, 0.0) : vec3(0.11, 0.16, 0.22);
    vCor = vec4(base, (destaque ? 0.9 : uAlfaAresta) * min(1.0, alfa * 1.6) * (1.0 - uDessatura * 0.55));
    gl_Position = projectionMatrix * viewMatrix * mundo;
  }
`

const FRAGMENTO_LINHA = /* glsl */ `
  precision highp float;
  precision highp int;
  uniform vec4 uPlano;
  uniform int uTemPlano;
  in vec3 vMundo;
  flat in vec4 vId;
  in vec4 vCor;
  out vec4 saida;
  void main() {
    if (uTemPlano == 1 && dot(vec4(vMundo, 1.0), uPlano) > 0.0) discard;
    saida = vCor;
  }
`

export interface MateriaisModelo {
  opaco: THREE.ShaderMaterial
  transparente: THREE.ShaderMaterial
  fantasma: THREE.ShaderMaterial
  linha: THREE.ShaderMaterial
  id: THREE.ShaderMaterial
}

export function criarMateriais(comuns: UniformsComuns, texEstado: THREE.DataTexture, texCor: THREE.DataTexture, largura: number, chave: number): MateriaisModelo {
  const opacidade = { value: 1 }
  const base = (passada: number) => ({
    uEstado: { value: texEstado },
    uCor: { value: texCor },
    uLargura: { value: largura },
    uChave: { value: chave },
    uOpacidade: opacidade,
    uPassada: { value: passada },
    uPlano: comuns.uPlano,
    uTemPlano: comuns.uTemPlano,
    uDessatura: comuns.uDessatura,
    uAlfaAresta: comuns.uAlfaAresta,
  })
  const opaco = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: base(PASSADA_OPACA),
    vertexShader: VERTICE_MALHA,
    fragmentShader: FRAGMENTO_MALHA,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  })
  const transparente = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: base(PASSADA_TRANSPARENTE),
    vertexShader: VERTICE_MALHA,
    fragmentShader: FRAGMENTO_MALHA,
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
  })
  // O fantasma é desenhado antes de tudo e não marca profundidade: as peças destacadas saem por cima
  // dele com a cor limpa, mesmo com dezenas de lajes e paredes transparentes na frente.
  // `transparent: false` com mistura própria é o que faz o three.js desenhá-lo no começo.
  const fantasma = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: base(PASSADA_FANTASMA),
    vertexShader: VERTICE_MALHA,
    fragmentShader: FRAGMENTO_MALHA,
    side: THREE.FrontSide,
    transparent: false,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.SrcAlphaFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    // O alfa da tela tem que continuar 1, senão o fundo branco da página aparece através do modelo.
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  })
  const linha = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: base(PASSADA_OPACA),
    vertexShader: VERTICE_LINHA,
    fragmentShader: FRAGMENTO_LINHA,
    transparent: true,
    depthWrite: false,
  })
  // Linha só desenha o que é opaco ou quase: a passada dela é "qualquer uma menos fantasma".
  linha.uniforms.uPassada = { value: 2 }
  const id = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: base(PASSADA_ID),
    vertexShader: VERTICE_MALHA,
    fragmentShader: FRAGMENTO_MALHA,
    side: THREE.DoubleSide,
    blending: THREE.NoBlending,
  })
  return { opaco, transparente, fantasma, linha, id }
}

/** Tampa do corte: a parte cheia da peça cortada. Cada vértice já vem com a cor. */
export function criarMaterialTampa(modoId: { value: number }): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    uniforms: { uModoId: modoId },
    vertexShader: /* glsl */ `
      precision highp float;
      in vec3 aCorTampa;
      in vec4 aIdTampa;
      out vec3 vCor;
      flat out vec4 vId;
      void main() {
        vCor = aCorTampa;
        vId = aIdTampa;
        gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform int uModoId;
      in vec3 vCor;
      flat in vec4 vId;
      out vec4 saida;
      void main() {
        saida = uModoId == 1 ? vId : vec4(vCor, 1.0);
      }
    `,
    side: THREE.DoubleSide,
  })
}
