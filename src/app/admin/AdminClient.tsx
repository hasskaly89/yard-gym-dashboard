'use client';

import { useState } from 'react';
import { updateUserAccess } from './actions';
import { ALWAYS_ALLOWED, type PageKey, type Role } from '@/lib/access';
import type { AdminUserRow } from './page';

type PageDef = { key: PageKey; label: string };

export default function AdminClient({
  users,
  pages,
  meEmail,
}: {
  users: AdminUserRow[];
  pages: PageDef[];
  meEmail: string;
}) {
  return (
    <div className="p-4 md:p-8 min-h-screen bg-white">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Team Access</h1>
        <p className="text-gray-500 text-sm mt-1">
          Control what each person can see. Admins see everything; staff see only
          the pages you tick. Changes take effect on their next page load.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {users.map((u) => (
          <UserCard key={u.id} user={u} pages={pages} isMe={u.email === meEmail} />
        ))}
      </div>
    </div>
  );
}

function UserCard({
  user,
  pages,
  isMe,
}: {
  user: AdminUserRow;
  pages: PageDef[];
  isMe: boolean;
}) {
  const [role, setRole] = useState<Role>(user.role);
  const [allowed, setAllowed] = useState<Set<PageKey>>(new Set(user.allowedPages));
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const locked = user.isSuperAdmin; // owner — cannot be demoted or restricted

  function toggle(key: PageKey) {
    if (ALWAYS_ALLOWED.includes(key)) return; // dashboard always on
    setAllowed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setStatus('idle');
  }

  async function save() {
    setSaving(true);
    setStatus('idle');
    const res = await updateUserAccess({
      userId: user.id,
      email: user.email,
      role,
      allowedPages: Array.from(allowed),
    });
    setSaving(false);
    if (res.ok) setStatus('saved');
    else {
      setStatus('error');
      setErrorMsg(res.error);
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <p className="text-gray-900 font-semibold text-sm truncate" title={user.email}>
            {user.email}
          </p>
          <div className="flex items-center gap-1.5 mt-1">
            {isMe && (
              <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">
                You
              </span>
            )}
            {locked && (
              <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">
                Owner
              </span>
            )}
          </div>
        </div>
        <select
          value={role}
          disabled={locked}
          onChange={(e) => {
            setRole(e.target.value as Role);
            setStatus('idle');
          }}
          className="text-sm border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-900 disabled:opacity-60"
        >
          <option value="staff">Staff</option>
          <option value="admin">Admin</option>
        </select>
      </div>

      {role === 'admin' ? (
        <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">
          Sees <span className="font-semibold text-gray-700">everything</span> — full access.
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {pages.map((p) => {
            const on = allowed.has(p.key) || ALWAYS_ALLOWED.includes(p.key);
            const fixed = ALWAYS_ALLOWED.includes(p.key) || locked;
            return (
              <button
                key={p.key}
                type="button"
                disabled={fixed}
                onClick={() => toggle(p.key)}
                className={`text-xs px-2.5 py-1 rounded-full border transition ${
                  on
                    ? 'bg-gym-accent/10 border-gym-accent text-gym-accent'
                    : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                } ${fixed ? 'opacity-60 cursor-default' : ''}`}
                title={ALWAYS_ALLOWED.includes(p.key) ? 'Always visible' : undefined}
              >
                {on ? '✓ ' : ''}
                {p.label}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-between mt-4">
        <span className="text-xs">
          {status === 'saved' && <span className="text-emerald-600 font-medium">Saved ✓</span>}
          {status === 'error' && <span className="text-rose-600">{errorMsg}</span>}
        </span>
        <button
          type="button"
          onClick={save}
          disabled={saving || locked}
          className="text-sm font-medium px-4 py-1.5 rounded-lg bg-gym-accent text-white hover:opacity-90 disabled:opacity-50 transition"
        >
          {saving ? 'Saving…' : locked ? 'Locked' : 'Save'}
        </button>
      </div>
    </div>
  );
}
