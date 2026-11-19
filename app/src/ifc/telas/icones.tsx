// Ícones desenhados para o visor: traço único, cantos arredondados, 24 x 24.
import type { ComponentChildren } from 'preact'

function Icone({ children, tamanho = 22 }: { children: ComponentChildren; tamanho?: number }) {
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

export const IcModelos = () => (
  <Icone>
    <path d="M12 3 3 8l9 5 9-5-9-5Z" />
    <path d="m3 12.5 9 5 9-5" />
    <path d="m3 17 9 5 9-5" />
  </Icone>
)
export const IcBuscar = () => (
  <Icone>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m20 20-4.2-4.2" />
  </Icone>
)
export const IcCorte = () => (
  <Icone>
    <path d="M4 8 12 4l8 4v8l-8 4-8-4V8Z" />
    <path d="M2 14 22 9" stroke-dasharray="2.5 2.5" />
  </Icone>
)
export const IcCores = () => (
  <Icone>
    <path d="M12 3a9 9 0 1 0 0 18c1.4 0 2-.9 2-1.9 0-1.2-.9-1.6-.9-2.7 0-.9.8-1.5 1.7-1.5H17a4 4 0 0 0 4-4C21 6.5 17 3 12 3Z" />
    <circle cx="7.5" cy="11.5" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="10.5" cy="7.5" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="15.5" cy="7.8" r="1.1" fill="currentColor" stroke="none" />
  </Icone>
)
export const IcVoltar = () => (
  <Icone>
    <path d="M15 5l-7 7 7 7" />
  </Icone>
)
export const IcFechar = () => (
  <Icone>
    <path d="M6 6l12 12M18 6 6 18" />
  </Icone>
)
export const IcEnquadrar = () => (
  <Icone>
    <path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4" />
  </Icone>
)
export const IcTopo = () => (
  <Icone>
    <rect x="5" y="5" width="14" height="14" rx="1.5" />
    <path d="M12 5v14M5 12h14" />
  </Icone>
)
export const IcIso = () => (
  <Icone>
    <path d="M12 3 4 7.5v9L12 21l8-4.5v-9L12 3Z" />
    <path d="M4 7.5 12 12l8-4.5M12 12v9" />
  </Icone>
)
export const IcFrente = () => (
  <Icone>
    <path d="M4 20h16M6 20V8l6-4 6 4v12" />
    <path d="M10 20v-6h4v6" />
  </Icone>
)
export const IcOlho = () => (
  <Icone>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
    <circle cx="12" cy="12" r="2.8" />
  </Icone>
)
export const IcOlhoFechado = () => (
  <Icone>
    <path d="M4 4l16 16" />
    <path d="M9.6 5.9A9 9 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-3.4 4.2M6 7.8A16 16 0 0 0 2.5 12S6 18.5 12 18.5c1.5 0 2.9-.4 4.1-1" />
  </Icone>
)
export const IcAbrir = () => (
  <Icone>
    <path d="M12 16V5" />
    <path d="m7.5 9.5 4.5-4.5 4.5 4.5" />
    <path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15" />
  </Icone>
)
export const IcBaixar = () => (
  <Icone>
    <path d="M12 4v11" />
    <path d="m7.5 10.5 4.5 4.5 4.5-4.5" />
    <path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15" />
  </Icone>
)
export const IcAlinhar = () => (
  <Icone>
    <rect x="3.5" y="9" width="10" height="11" rx="1" />
    <rect x="10.5" y="4" width="10" height="11" rx="1" stroke-dasharray="2.5 2" />
    <circle cx="13.5" cy="9" r="1.2" fill="currentColor" stroke="none" />
  </Icone>
)
export const IcLixo = () => (
  <Icone>
    <path d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l.8 12.5h9.4L17.5 7" />
  </Icone>
)
export const IcSeta = ({ aberta }: { aberta: boolean }) => (
  <Icone tamanho={18}>
    <path d={aberta ? 'm6 9 6 6 6-6' : 'm9 6 6 6-6 6'} />
  </Icone>
)
export const IcInverter = () => (
  <Icone>
    <path d="M4 8h13l-3.5-3.5M20 16H7l3.5 3.5" />
  </Icone>
)
export const IcPlanta = () => (
  <Icone>
    <path d="M4 4h16v16H4z" />
    <path d="M4 12h7M11 4v5M15 20v-6h5" />
  </Icone>
)
export const IcCorteV = () => (
  <Icone>
    <path d="M3 21h18M5 21V10l7-6 7 6v11" />
    <path d="M5 15h14" />
    <path d="M12 2v20" stroke-dasharray="2.5 2.5" />
  </Icone>
)
export const IcCorteH = () => (
  <Icone>
    <path d="M3 21h18M5 21V10l7-6 7 6v11" />
    <path d="M5 15h14" />
    <path d="M9 21V4" stroke-dasharray="2.5 2.5" />
  </Icone>
)
export const IcToque = () => (
  <Icone>
    <path d="M9 11V5.5a1.5 1.5 0 0 1 3 0V11l5 1.2a2 2 0 0 1 1.5 2.3l-.8 4.5a2 2 0 0 1-2 1.6h-4.3a2 2 0 0 1-1.6-.8L5.5 15a1.4 1.4 0 0 1 2-2L9 14.5" />
  </Icone>
)
export const IcFoco = () => (
  <Icone>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
  </Icone>
)
export const IcSalvar = () => (
  <Icone>
    <path d="M6 3.5h12a1 1 0 0 1 1 1V21l-7-4.5L5 21V4.5a1 1 0 0 1 1-1Z" />
  </Icone>
)
