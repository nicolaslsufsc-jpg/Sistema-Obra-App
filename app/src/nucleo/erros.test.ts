import { describe, expect, it } from 'vitest'
import { erroDoArmazenamento, erroDoBanco } from './erros'

describe('classificação de erros', () => {
  it('sem internet e servidor fora são transitórios', () => {
    expect(erroDoBanco(0, { message: 'TypeError: fetch failed' }).gravidade).toBe('transitorio')
    expect(erroDoBanco(503, { message: 'x' }).gravidade).toBe('transitorio')
    expect(erroDoBanco(401, { code: 'PGRST303', message: 'JWT expired' }).gravidade).toBe('transitorio')
  })

  it('sem permissão e dado inválido são permanentes', () => {
    expect(erroDoBanco(403, { code: '42501', message: 'rls' }).gravidade).toBe('permanente')
    expect(erroDoBanco(409, { code: '23503', message: 'fk' }).gravidade).toBe('permanente')
    expect(erroDoBanco(400, { code: '23514', message: 'check' }).gravidade).toBe('permanente')
  })

  it('armazenamento: "já existe" é reconhecido nos dois formatos do Supabase', () => {
    expect(erroDoArmazenamento({ message: 'The resource already exists', status: 400, statusCode: '409' }).duplicado).toBe(true)
    expect(erroDoArmazenamento({ message: 'Duplicate', status: 409 }).duplicado).toBe(true)
  })

  it('armazenamento: sem status é falha de rede', () => {
    const e = erroDoArmazenamento(new TypeError('Failed to fetch'))
    expect(e.gravidade).toBe('transitorio')
    expect(e.duplicado).toBe(false)
  })

  it('armazenamento: RLS é permanente, token vencido é transitório', () => {
    expect(erroDoArmazenamento({ message: 'rls', status: 403, statusCode: '403' }).gravidade).toBe('permanente')
    expect(erroDoArmazenamento({ message: 'jwt expired', status: 400, statusCode: '401' }).gravidade).toBe('transitorio')
    expect(erroDoArmazenamento({ message: 'jwt expired', status: 400, statusCode: '403' }).gravidade).toBe('transitorio')
  })
})
