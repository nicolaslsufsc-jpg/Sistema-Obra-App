import { describe, expect, it } from 'vitest'
import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js'
import { traduzirErroLogin } from './conta'

const FALHA_EMAIL = 'Não conseguimos mandar o e-mail agora. Tente de novo em alguns minutos. Se continuar, avise o administrador.'
const SEM_INTERNET = 'Sem internet. Para entrar o aparelho precisa estar conectado.'

describe('traduzirErroLogin', () => {
  // É o erro que o supabase-js entrega quando o Supabase responde 500 (o Gmail recusou a senha SMTP, 18/11/2026).
  it('servidor sem conseguir mandar o e-mail não vira "Sem internet"', () => {
    expect(traduzirErroLogin(new AuthRetryableFetchError('Error sending magic link email', 500), 'pedir')).toBe(FALHA_EMAIL)
    expect(traduzirErroLogin(new AuthRetryableFetchError('Error sending confirmation email', 500), 'pedir')).toBe(FALHA_EMAIL)
  })

  it('servidor fora (502 a 530) ao pedir o código também avisa para tentar depois', () => {
    expect(traduzirErroLogin(new AuthRetryableFetchError('Bad Gateway', 502), 'pedir')).toBe(FALHA_EMAIL)
  })

  it('servidor fora ao confirmar o código', () => {
    expect(traduzirErroLogin(new AuthRetryableFetchError('Service Unavailable', 503), 'confirmar')).toBe(
      'O servidor não respondeu agora. Tente de novo em alguns minutos.',
    )
  })

  it('falta de internet de verdade (status 0) continua "Sem internet"', () => {
    expect(traduzirErroLogin(new AuthRetryableFetchError('Failed to fetch', 0), 'pedir')).toBe(SEM_INTERNET)
    expect(traduzirErroLogin(new AuthRetryableFetchError('Failed to fetch', 0), 'confirmar')).toBe(SEM_INTERNET)
  })

  it('limite de pedidos continua com a mensagem própria', () => {
    expect(traduzirErroLogin(new AuthApiError('email rate limit exceeded', 429, 'over_email_send_rate_limit'), 'pedir')).toBe(
      'Muitos pedidos de código seguidos. Espere alguns minutos e tente de novo.',
    )
  })

  it('e-mail inválido continua com a mensagem própria', () => {
    expect(traduzirErroLogin(new AuthApiError('Email address is invalid', 400, 'email_address_invalid'), 'pedir')).toBe(
      'E-mail inválido. Confira o endereço.',
    )
  })

  it('código errado ao confirmar não vira falha de e-mail', () => {
    expect(traduzirErroLogin(new AuthApiError('Token has expired or is invalid', 403, 'otp_expired'), 'confirmar')).toBe(
      'Código errado ou vencido. Confira ou peça um novo.',
    )
  })
})
