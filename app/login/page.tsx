'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const supabase = createClient()
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (authError) {
      setError('Incorrect email or password. Please try again.')
      setLoading(false)
      return
    }

    window.location.href = '/today'
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#F6F3EE',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
    >
      <div
        style={{
          backgroundColor: '#FFFFFF',
          border: '1px solid #D9CFC2',
          width: '100%',
          maxWidth: '380px',
          padding: '40px 32px',
        }}
      >
        {/* Logo / Heading */}
        <div style={{ marginBottom: '32px', textAlign: 'center' }}>
          <div
            style={{
              fontSize: '22px',
              fontWeight: 800,
              color: '#17130E',
              letterSpacing: '-0.5px',
            }}
          >
            Athleta
          </div>
          <div
            style={{
              fontSize: '13px',
              color: '#84776A',
              marginTop: '4px',
              fontWeight: 500,
            }}
          >
            Front of House
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <label
              htmlFor="email"
              style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 600,
                color: '#17130E',
                marginBottom: '6px',
              }}
            >
              Email address
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '9px 12px',
                border: '1px solid #D9CFC2',
                borderRadius: 0,
                fontSize: '14px',
                color: '#17130E',
                backgroundColor: '#FFFFFF',
                outline: 'none',
                fontFamily: 'inherit',
              }}
            />
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label
              htmlFor="password"
              style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: 600,
                color: '#17130E',
                marginBottom: '6px',
              }}
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '9px 12px',
                border: '1px solid #D9CFC2',
                borderRadius: 0,
                fontSize: '14px',
                color: '#17130E',
                backgroundColor: '#FFFFFF',
                outline: 'none',
                fontFamily: 'inherit',
              }}
            />
          </div>

          {error && (
            <div
              style={{
                backgroundColor: '#FDF2F0',
                border: '1px solid #B23A24',
                color: '#B23A24',
                padding: '10px 12px',
                fontSize: '13px',
                fontWeight: 500,
                marginBottom: '16px',
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '11px',
              backgroundColor: loading ? '#EFE8DE' : '#E26839',
              color: loading ? '#84776A' : '#FFFFFF',
              border: 'none',
              borderRadius: 0,
              fontSize: '14px',
              fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              letterSpacing: '0.2px',
            }}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
