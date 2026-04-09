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
  const searchParams = useSearchParams()

  useEffect(() => {
    // Check URL search params
    const errParam = searchParams.get('error')
    if (errParam === 'not_found') {
      setError("We couldn't find your membership. Enter your name and email below to sign up.")
    } else if (errParam === 'auth') {
      setError('Something went wrong. Please request a new link.')
    } else if (errParam === 'no-role') {
      setError('Account not set up correctly. Please contact The Yard.')
    }

    // Check URL hash for Supabase error responses (e.g. expired OTP)
    const hash = window.location.hash
    if (hash.includes('error_code=otp_expired') || hash.includes('otp_expired')) {
      setError('Your login link expired — just enter your details again to get a fresh one.')
      // Clean the hash from the URL without reloading
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

  const routeMap = {
    member: { icon: '🏋️', dest: 'RIG Calculator', path: '/rig/home' },
    admin:  { icon: '⚡', dest: 'Full Dashboard',  path: '/' },
  }
  const route = routeMap[role]

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&display=swap');
        .rig-page { font-family: 'DM Sans', sans-serif; }
        .rig-heading { font-family: 'Bebas Neue', cursive; }
        .rig-btn-submit:hover:not(:disabled) {
          background: #E64A19 !important;
          transform: translateY(-1px);
          box-shadow: 0 8px 24px rgba(255,87,34,0.3);
        }
        .rig-btn-submit:active { transform: translateY(0); }
        .rig-input:focus { border-color: #FF5722 !important; background: #fff !important; }
        .rig-role-btn { transition: all 0.2s; }
        .card-fadein { animation: fadeUp 0.5s ease both; }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div className="rig-page min-h-screen flex flex-col items-center justify-center px-6 relative overflow-hidden" style={{ backgroundColor: '#F8F7F5' }}>

        {/* Background glow */}
        <div style={{
          position: 'absolute', top: -120, left: '50%', transform: 'translateX(-50%)',
          width: 500, height: 500, pointerEvents: 'none',
          background: 'radial-gradient(circle, rgba(255,87,34,0.08) 0%, transparent 70%)',
        }} />

        <div className="card-fadein w-full max-w-sm relative z-10">
          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <div className="flex items-center gap-2.5 mb-1">
              <div className="flex items-center justify-center rounded-xl" style={{ width: 36, height: 36, backgroundColor: '#FF5722' }}>
                <svg viewBox="0 0 24 24" style={{ width: 20, height: 20, fill: '#fff' }}>
                  <path d="M20.57 14.86L22 13.43 20.57 12 17 15.57 8.43 7 12 3.43 10.57 2 9.14 3.43 7.71 2 5.57 4.14 4.14 2.71 2.71 4.14l1.43 1.43L2 7.71l1.43 1.43L2 10.57 3.43 12 7 8.43 15.57 17 12 20.57 13.43 22l1.43-1.43L16.29 22l2.14-2.14 1.43 1.43 1.43-1.43-1.43-1.43L22 16.29z"/>
                </svg>
              </div>
              <span className="rig-heading" style={{ fontSize: 28, letterSpacing: 3, color: '#1A1A1A', lineHeight: 1 }}>
                THE <span style={{ color: '#FF5722' }}>YARD</span>
              </span>
            </div>
            <span style={{ fontSize: 11, letterSpacing: 3, textTransform: 'uppercase', color: '#aaa' }}>
              Gym Management Platform
            </span>
          </div>

          {/* Card */}
          <div className="bg-white" style={{ borderRadius: 28, padding: '40px 32px 36px', boxShadow: '0 2px 40px rgba(0,0,0,0.07)' }}>
            {!success ? (
              <>
                {/* Role Toggle */}
                <div className="flex gap-1 mb-7" style={{ backgroundColor: '#F3F2F0', borderRadius: 14, padding: 4 }}>
                  {(['member', 'admin'] as const).map((r) => (
                    <button
                      key={r}
                      onClick={() => { setRole(r); setError(''); setName('') }}
                      className="rig-role-btn flex-1"
                      style={{
                        padding: '10px 12px',
                        border: 'none',
                        borderRadius: 10,
                        fontFamily: 'DM Sans, sans-serif',
                        fontSize: 14,
                        fontWeight: 500,
                        cursor: 'pointer',
                        backgroundColor: role === r ? '#fff' : 'transparent',
                        color: role === r ? '#1A1A1A' : '#888',
                        boxShadow: role === r ? '0 1px 6px rgba(0,0,0,0.10)' : 'none',
                      }}
                    >
                      {r === 'member' ? '🏋️ Member' : '⚡ Admin'}
                    </button>
                  ))}
                </div>

                {/* Full Name — members only */}
                {role === 'member' && (
                  <>
                    <label style={{ fontSize: 12, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', color: '#888', display: 'block', marginBottom: 8 }}>
                      Full Name
                    </label>
                    <input
                      className="rig-input"
                      type="text"
                      placeholder="Jane Smith"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                      style={{
                        width: '100%', height: 52, backgroundColor: '#F8F7F5',
                        border: '1.5px solid #E8E6E3', borderRadius: 14,
                        padding: '0 16px', fontFamily: 'DM Sans, sans-serif',
                        fontSize: 16, color: '#1A1A1A', outline: 'none',
                        marginBottom: 12, boxSizing: 'border-box',
                        transition: 'border-color 0.2s',
                      }}
                    />
                  </>
                )}

                {/* Email */}
                <label style={{ fontSize: 12, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', color: '#888', display: 'block', marginBottom: 8 }}>
                  Email Address
                </label>
                <input
                  className="rig-input"
                  type="email"
                  placeholder={role === 'member' ? 'your@email.com' : 'admin@theyardgym.com.au'}
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                  style={{
                    width: '100%', height: 52, backgroundColor: '#F8F7F5',
                    border: '1.5px solid #E8E6E3', borderRadius: 14,
                    padding: '0 16px', fontFamily: 'DM Sans, sans-serif',
                    fontSize: 16, color: '#1A1A1A', outline: 'none',
                    marginBottom: 12, boxSizing: 'border-box',
                    transition: 'border-color 0.2s',
                  }}
                />

                {/* Admin password */}
                {role === 'admin' && (
                  <>
                    <label style={{ fontSize: 12, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', color: '#888', display: 'block', marginBottom: 8 }}>
                      Password
                    </label>
                    <div style={{ position: 'relative', marginBottom: 12 }}>
                      <input
                        className="rig-input"
                        type={showPw ? 'text' : 'password'}
                        placeholder="••••••••"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                        style={{
                          width: '100%', height: 52, backgroundColor: '#F8F7F5',
                          border: '1.5px solid #E8E6E3', borderRadius: 14,
                          padding: '0 48px 0 16px', fontFamily: 'DM Sans, sans-serif',
                          fontSize: 16, color: '#1A1A1A', outline: 'none',
                          boxSizing: 'border-box', transition: 'border-color 0.2s',
                        }}
                      />
                      <button
                        onClick={() => setShowPw(!showPw)}
                        style={{ position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#bbb', fontSize: 18 }}
                      >
                        {showPw ? '🙈' : '👁️'}
                      </button>
                    </div>
                  </>
                )}

                {/* Hint */}
                <p style={{ fontSize: 13, color: '#aaa', marginBottom: 24, lineHeight: 1.5, textAlign: 'center', marginTop: role === 'member' ? 0 : 12 }}>
                  {role === 'member'
                    ? <>We&apos;ll send a <strong style={{ color: '#888', fontWeight: 500 }}>magic link</strong> to your email — no password needed.</>
                    : <>Sign in with your <strong style={{ color: '#888', fontWeight: 500 }}>staff credentials</strong> for full dashboard access.</>
                  }
                </p>

                {error && (
                  <p style={{ fontSize: 13, color: '#EF4444', marginBottom: 16, textAlign: 'center' }}>{error}</p>
                )}

                {/* Submit */}
                <button
                  className="rig-btn-submit"
                  onClick={handleSubmit}
                  disabled={loading}
                  style={{
                    width: '100%', height: 54, backgroundColor: loading ? '#FFB09A' : '#FF5722',
                    border: 'none', borderRadius: 14, color: '#fff',
                    fontFamily: 'DM Sans, sans-serif', fontSize: 16, fontWeight: 600,
                    cursor: loading ? 'not-allowed' : 'pointer', letterSpacing: 0.3,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    transition: 'all 0.2s',
                  }}
                >
                  {loading ? 'Signing you in...' : role === 'member' ? 'Send Login Link ✉️' : 'Sign In →'}
                </button>

                {/* Route info */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, backgroundColor: '#F3F2F0', borderRadius: 10, padding: '10px 14px', marginTop: 20, fontSize: 12, color: '#888' }}>
                  <span>{route.icon}</span>
                  <span>You&apos;ll be taken to</span>
                  <span style={{ fontSize: 14, color: '#FF5722', fontWeight: 700 }}>→</span>
                  <span style={{ fontWeight: 600, color: '#555' }}>{route.dest}</span>
                </div>
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: '16px 0' }}>
                <div style={{ width: 64, height: 64, backgroundColor: 'rgba(34,197,94,0.1)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: 28 }}>
                  ✉️
                </div>
                <div className="rig-heading" style={{ fontSize: 26, letterSpacing: 2, color: '#1A1A1A', marginBottom: 10 }}>
                  {name ? `LET'S GO, ${name.split(' ')[0].toUpperCase()}!` : 'CHECK YOUR EMAIL'}
                </div>
                <p style={{ fontSize: 14, color: '#888', lineHeight: 1.6 }}>
                  We&apos;ve sent a login link to <strong>{email}</strong>.<br />Tap it to access your RIG Calculator.
                </p>
                <button
                  onClick={() => { setSuccess(false); setEmail('') }}
                  style={{ background: 'none', border: 'none', color: '#FF5722', marginTop: 20, cursor: 'pointer', fontSize: 13 }}
                >
                  ← Back to login
                </button>
              </div>
            )}
          </div>

          <p style={{ marginTop: 24, fontSize: 12, color: '#ccc', textAlign: 'center' }}>
            The Yard Gym · Sydney · 2026
          </p>
        </div>
      </div>
    </>
  )
}
