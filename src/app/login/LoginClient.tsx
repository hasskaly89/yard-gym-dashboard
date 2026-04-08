'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function LoginClient() {
  const [role, setRole] = useState<'member' | 'trainer'>('member')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${location.origin}/auth/callback`,
      },
    })

    if (error) {
      setError(error.message)
    } else {
      setSent(true)
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F8F7F5' }}>
      <div className="w-full max-w-md px-4">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4" style={{ backgroundColor: '#FF5722' }}>
            <span className="text-white font-bold text-2xl">Y</span>
          </div>
          <h1 className="text-3xl font-bold" style={{ color: '#1A1A1A' }}>THE YARD</h1>
          <p className="text-lg font-semibold mt-1" style={{ color: '#FF5722' }}>RIG Calculator</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-3xl shadow-sm border p-8" style={{ borderColor: '#E8E6E3' }}>
          {!sent ? (
            <>
              {/* Role Toggle */}
              <div className="flex rounded-xl p-1 mb-6" style={{ backgroundColor: '#F3F2F0' }}>
                {(['member', 'trainer'] as const).map((r) => (
                  <button
                    key={r}
                    onClick={() => setRole(r)}
                    className="flex-1 py-2 rounded-lg text-sm font-semibold transition-all"
                    style={{
                      backgroundColor: role === r ? '#FF5722' : 'transparent',
                      color: role === r ? 'white' : '#888888',
                    }}
                  >
                    {r === 'member' ? 'Gym Member' : 'Trainer'}
                  </button>
                ))}
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: '#1A1A1A' }}>
                    Email address
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    placeholder={role === 'member' ? 'your@email.com' : 'staff@theyardgym.com.au'}
                    className="w-full px-4 rounded-xl border outline-none transition-colors"
                    style={{
                      height: '52px',
                      fontSize: '16px',
                      borderColor: '#E8E6E3',
                      backgroundColor: '#F8F7F5',
                      color: '#1A1A1A',
                    }}
                  />
                  <p className="text-xs mt-2" style={{ color: '#888888' }}>
                    {role === 'member'
                      ? 'Enter the email address you used to join The Yard.'
                      : 'Enter your staff email address.'}
                  </p>
                </div>

                {error && (
                  <p className="text-sm text-red-500">{error}</p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full font-semibold rounded-xl transition-colors"
                  style={{
                    height: '52px',
                    fontSize: '16px',
                    backgroundColor: loading ? '#FFB8A0' : '#FF5722',
                    color: 'white',
                  }}
                >
                  {loading ? 'Sending...' : 'Send me a login link'}
                </button>
              </form>
            </>
          ) : (
            <div className="text-center py-4">
              <div className="text-5xl mb-4">✉️</div>
              <h2 className="text-xl font-bold mb-2" style={{ color: '#1A1A1A' }}>Check your email</h2>
              <p style={{ color: '#888888' }}>
                We&apos;ve sent a login link to <strong style={{ color: '#1A1A1A' }}>{email}</strong>
              </p>
              <button
                onClick={() => { setSent(false); setEmail('') }}
                className="mt-6 text-sm underline"
                style={{ color: '#888888' }}
              >
                Use a different email
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
