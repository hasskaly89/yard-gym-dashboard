'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginClient() {
  const [role, setRole] = useState<'member' | 'admin'>('member')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const [mounted, setMounted] = useState(false)
  const searchParams = useSearchParams()

  useEffect(() => {
    setMounted(true)
    const errParam = searchParams.get('error')
    if (errParam === 'not_found') {
      setError("We couldn't find your membership. Enter your name and email below to sign up.")
    } else if (errParam === 'auth') {
      setError('Something went wrong. Please request a new link.')
    } else if (errParam === 'no-role') {
      setError('Account not set up correctly. Please contact The Yard.')
    }

    const hash = window.location.hash
    if (hash.includes('error_code=otp_expired') || hash.includes('otp_expired')) {
      setError('Your login link expired — just enter your details again to get a fresh one.')
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
    } else if (hash.includes('error=access_denied')) {
      setError('That link is no longer valid. Enter your email below to get a new one.')
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
    }
  }, [searchParams])

  const supabase = createClient()

  async function handleSubmit() {
    if (!email) return
    setLoading(true)
    setError('')

    if (role === 'member') {
      const parts = name.trim().split(' ')
      const firstName = parts[0] ?? ''
      const lastName = parts.slice(1).join(' ')
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${location.origin}/auth/callback`,
          data: { role: 'member', first_name: firstName, last_name: lastName },
        },
      })
      if (error) { setError(error.message); setLoading(false); return }
      setSuccess(true)
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) { setError(error.message); setLoading(false); return }
      window.location.href = '/'
    }
    setLoading(false)
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600;700&display=swap');

        .login-page {
          font-family: 'DM Sans', sans-serif;
          min-height: 100dvh;
          display: flex;
          flex-direction: column;
          position: relative;
          overflow: hidden;
          background: #0A0918;
        }

        /* Animated background gradient orbs */
        .login-page::before {
          content: '';
          position: absolute;
          top: -30%;
          left: -20%;
          width: 600px;
          height: 600px;
          background: radial-gradient(circle, rgba(255,92,62,0.12) 0%, transparent 70%);
          animation: float1 12s ease-in-out infinite;
          pointer-events: none;
        }
        .login-page::after {
          content: '';
          position: absolute;
          bottom: -20%;
          right: -20%;
          width: 500px;
          height: 500px;
          background: radial-gradient(circle, rgba(124,111,255,0.08) 0%, transparent 70%);
          animation: float2 15s ease-in-out infinite;
          pointer-events: none;
        }

        @keyframes float1 {
          0%, 100% { transform: translate(0, 0); }
          50% { transform: translate(40px, 30px); }
        }
        @keyframes float2 {
          0%, 100% { transform: translate(0, 0); }
          50% { transform: translate(-30px, -40px); }
        }

        .login-card {
          animation: cardEnter 0.6s cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        @keyframes cardEnter {
          from { opacity: 0; transform: translateY(32px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }

        .login-success {
          animation: successPop 0.5s cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        @keyframes successPop {
          from { opacity: 0; transform: scale(0.9); }
          to   { opacity: 1; transform: scale(1); }
        }

        .login-input {
          width: 100%;
          height: 52px;
          background: rgba(255,255,255,0.05);
          border: 1.5px solid rgba(255,255,255,0.1);
          border-radius: 14px;
          padding: 0 16px;
          font-family: 'DM Sans', sans-serif;
          font-size: 16px;
          color: #fff;
          outline: none;
          box-sizing: border-box;
          transition: all 0.25s;
        }
        .login-input:focus {
          border-color: #FF5C3E;
          background: rgba(255,92,62,0.06);
          box-shadow: 0 0 0 3px rgba(255,92,62,0.1);
        }
        .login-input::placeholder {
          color: rgba(255,255,255,0.25);
        }

        .login-btn {
          width: 100%;
          height: 54px;
          border: none;
          border-radius: 14px;
          color: #fff;
          font-family: 'DM Sans', sans-serif;
          font-size: 16px;
          font-weight: 700;
          cursor: pointer;
          letter-spacing: 0.3px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          transition: all 0.25s;
          position: relative;
          overflow: hidden;
        }
        .login-btn:not(:disabled):hover {
          transform: translateY(-1px);
          box-shadow: 0 8px 32px rgba(255,92,62,0.4);
        }
        .login-btn:active { transform: translateY(0); }
        .login-btn:disabled { cursor: not-allowed; }

        /* Shimmer effect on button */
        .login-btn::after {
          content: '';
          position: absolute;
          top: 0;
          left: -100%;
          width: 100%;
          height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent);
          transition: left 0.6s;
        }
        .login-btn:not(:disabled):hover::after {
          left: 100%;
        }

        .role-tab {
          flex: 1;
          padding: 11px 12px;
          border: none;
          border-radius: 12px;
          font-family: 'DM Sans', sans-serif;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.25s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
        }

        .field-label {
          display: block;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.4);
          margin-bottom: 8px;
        }

        .stat-pill {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 14px;
          border-radius: 12px;
          font-size: 12px;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.06);
        }
      `}</style>

      <div className="login-page">
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 20px', position: 'relative', zIndex: 10 }}>

          <div className="login-card" style={{ width: '100%', maxWidth: 400, opacity: mounted ? 1 : 0 }}>

            {/* Logo */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 36 }}>
              <div style={{
                width: 56, height: 56, borderRadius: 16,
                background: 'linear-gradient(135deg, #FF5C3E, #FF7A5C)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: 16,
                boxShadow: '0 8px 32px rgba(255,92,62,0.3)',
              }}>
                <svg viewBox="0 0 24 24" style={{ width: 28, height: 28, fill: '#fff' }}>
                  <path d="M20.57 14.86L22 13.43 20.57 12 17 15.57 8.43 7 12 3.43 10.57 2 9.14 3.43 7.71 2 5.57 4.14 4.14 2.71 2.71 4.14l1.43 1.43L2 7.71l1.43 1.43L2 10.57 3.43 12 7 8.43 15.57 17 12 20.57 13.43 22l1.43-1.43L16.29 22l2.14-2.14 1.43 1.43 1.43-1.43-1.43-1.43L22 16.29z"/>
                </svg>
              </div>
              <h1 style={{ fontFamily: "'Bebas Neue', cursive", fontSize: 34, letterSpacing: 5, color: '#fff', lineHeight: 1, margin: 0 }}>
                THE <span style={{ color: '#FF5C3E' }}>YARD</span>
              </h1>
              <p style={{ fontSize: 11, letterSpacing: 4, textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginTop: 6 }}>
                Strength Training Platform
              </p>
            </div>

            {/* Card */}
            <div style={{
              background: 'rgba(255,255,255,0.04)',
              backdropFilter: 'blur(20px)',
              WebkitBackdropFilter: 'blur(20px)',
              borderRadius: 24,
              padding: '32px 28px 28px',
              border: '1px solid rgba(255,255,255,0.08)',
            }}>
              {!success ? (
                <>
                  {/* Role Toggle */}
                  <div style={{ display: 'flex', gap: 4, marginBottom: 28, padding: 4, background: 'rgba(255,255,255,0.04)', borderRadius: 14 }}>
                    {(['member', 'admin'] as const).map((r) => (
                      <button
                        key={r}
                        onClick={() => { setRole(r); setError(''); setName('') }}
                        className="role-tab"
                        style={{
                          background: role === r
                            ? 'linear-gradient(135deg, rgba(255,92,62,0.2), rgba(255,92,62,0.1))'
                            : 'transparent',
                          color: role === r ? '#fff' : 'rgba(255,255,255,0.4)',
                          border: role === r ? '1px solid rgba(255,92,62,0.3)' : '1px solid transparent',
                        }}
                      >
                        <span style={{ fontSize: 16 }}>{r === 'member' ? '🏋️' : '⚡'}</span>
                        {r === 'member' ? 'Member' : 'Admin'}
                      </button>
                    ))}
                  </div>

                  {/* Full Name — members only */}
                  {role === 'member' && (
                    <div style={{ marginBottom: 16 }}>
                      <label className="field-label">Full Name</label>
                      <input
                        className="login-input"
                        type="text"
                        placeholder="Jane Smith"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                      />
                    </div>
                  )}

                  {/* Email */}
                  <div style={{ marginBottom: 16 }}>
                    <label className="field-label">Email Address</label>
                    <input
                      className="login-input"
                      type="email"
                      placeholder={role === 'member' ? 'your@email.com' : 'admin@theyardgym.com.au'}
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                    />
                  </div>

                  {/* Admin password */}
                  {role === 'admin' && (
                    <div style={{ marginBottom: 16 }}>
                      <label className="field-label">Password</label>
                      <div style={{ position: 'relative' }}>
                        <input
                          className="login-input"
                          type={showPw ? 'text' : 'password'}
                          placeholder="Enter password"
                          value={password}
                          onChange={e => setPassword(e.target.value)}
                          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                          style={{ paddingRight: 48 }}
                        />
                        <button
                          onClick={() => setShowPw(!showPw)}
                          style={{
                            position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: 'rgba(255,255,255,0.3)', fontSize: 16,
                          }}
                        >
                          {showPw ? '🙈' : '👁️'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Hint */}
                  <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)', marginBottom: 24, lineHeight: 1.6, textAlign: 'center' }}>
                    {role === 'member'
                      ? <>We&apos;ll send a <strong style={{ color: 'rgba(255,255,255,0.5)' }}>magic link</strong> — no password needed.</>
                      : <>Sign in with your <strong style={{ color: 'rgba(255,255,255,0.5)' }}>staff credentials</strong>.</>
                    }
                  </p>

                  {error && (
                    <div style={{
                      fontSize: 13, color: '#FF6B6B', marginBottom: 16, textAlign: 'center',
                      padding: '10px 14px', borderRadius: 12,
                      background: 'rgba(255,107,107,0.08)', border: '1px solid rgba(255,107,107,0.15)',
                    }}>
                      {error}
                    </div>
                  )}

                  {/* Submit */}
                  <button
                    className="login-btn"
                    onClick={handleSubmit}
                    disabled={loading}
                    style={{
                      background: loading
                        ? 'rgba(255,92,62,0.4)'
                        : 'linear-gradient(135deg, #FF5C3E, #FF7A5C)',
                      boxShadow: loading ? 'none' : '0 4px 20px rgba(255,92,62,0.3)',
                    }}
                  >
                    {loading ? (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{
                          width: 18, height: 18, border: '2px solid rgba(255,255,255,0.3)',
                          borderTopColor: '#fff', borderRadius: '50%',
                          animation: 'spin 0.6s linear infinite', display: 'inline-block',
                        }} />
                        Signing you in...
                      </span>
                    ) : role === 'member' ? (
                      'Send Login Link'
                    ) : (
                      'Sign In'
                    )}
                  </button>

                  {/* Where you'll go */}
                  <div className="stat-pill" style={{ marginTop: 20, justifyContent: 'center' }}>
                    <span style={{ color: 'rgba(255,255,255,0.3)' }}>
                      {role === 'member' ? 'Opens' : 'Opens'}
                    </span>
                    <span style={{ color: '#FF5C3E', fontWeight: 700, fontSize: 13 }}>
                      {role === 'member' ? 'RIG Calculator' : 'Full Dashboard'}
                    </span>
                  </div>
                </>
              ) : (
                <div className="login-success" style={{ textAlign: 'center', padding: '8px 0' }}>
                  {/* Success checkmark animation */}
                  <div style={{
                    width: 72, height: 72, borderRadius: '50%',
                    background: 'linear-gradient(135deg, rgba(0,200,150,0.15), rgba(0,200,150,0.05))',
                    border: '2px solid rgba(0,200,150,0.3)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    margin: '0 auto 20px', fontSize: 32,
                  }}>
                    ✉️
                  </div>
                  <h2 style={{
                    fontFamily: "'Bebas Neue', cursive", fontSize: 28, letterSpacing: 3,
                    color: '#fff', marginBottom: 10, lineHeight: 1.2,
                  }}>
                    {name ? `LET'S GO, ${name.split(' ')[0].toUpperCase()}!` : 'CHECK YOUR EMAIL'}
                  </h2>
                  <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', lineHeight: 1.6 }}>
                    We&apos;ve sent a login link to<br />
                    <strong style={{ color: 'rgba(255,255,255,0.7)' }}>{email}</strong>
                  </p>
                  <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.25)', marginTop: 12 }}>
                    Tap the link to open your RIG Calculator.
                  </p>
                  <button
                    onClick={() => { setSuccess(false); setEmail('') }}
                    style={{
                      background: 'rgba(255,92,62,0.1)', border: '1px solid rgba(255,92,62,0.2)',
                      color: '#FF5C3E', marginTop: 24, cursor: 'pointer',
                      fontSize: 13, fontWeight: 600, padding: '10px 20px', borderRadius: 12,
                    }}
                  >
                    Back to login
                  </button>
                </div>
              )}
            </div>

            <p style={{ marginTop: 28, fontSize: 11, color: 'rgba(255,255,255,0.15)', textAlign: 'center', letterSpacing: 2 }}>
              THE YARD GYM &middot; SYDNEY
            </p>
          </div>
        </div>

        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </>
  )
}
