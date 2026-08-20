'use client';

import { useState, useEffect, useCallback } from 'react';

const BACKEND_URL = (
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  'http://localhost:8001'
).replace(/\/$/, '');

interface User {
  id?: string;
  login: string;
  name?: string;
  key_label: string;
  plan?: string;
  plan_status?: string;
  tokens_used: number;
  tokens_limit: number;
  registered_at: string;
  last_seen_at: string;
  status: 'online' | 'offline';
}

interface Stats {
  total_users: number;
  online_users: number;
  disk_free_gb: number;
  disk_total_gb: number;
  disk_used_pct: number;
  active_projects: number;
  media_library_size_mb: number;
  users: User[];
}

function Badge({ status }: { status: string }) {
  const map: Record<string, { bg: string; text: string; label: string }> = {
    active:   { bg: 'rgba(16,185,129,0.15)', text: '#34D399', label: 'Активный' },
    expired:  { bg: 'rgba(239,68,68,0.15)',  text: '#F87171', label: 'Истёк' },
    revoked:  { bg: 'rgba(107,114,128,0.15)',text: '#9CA3AF', label: 'Отозван' },
    online:   { bg: 'rgba(16,185,129,0.15)', text: '#34D399', label: 'Онлайн' },
    offline:  { bg: 'rgba(107,114,128,0.12)',text: '#6B7280', label: 'Оффлайн' },
  };
  const s = map[status] || map.offline;
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 99,
      fontSize: 11, fontWeight: 600, background: s.bg, color: s.text,
    }}>{s.label}</span>
  );
}

function StatCard({ label, value, sub, gradient }: { label: string; value: string | number; sub?: string; gradient: string }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 16, padding: '20px 24px',
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', top: 0, right: 0, width: 80, height: 80,
        background: gradient, borderRadius: '0 16px 0 100%', opacity: 0.15,
      }} />
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: '#fff', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

export default function AdminPage() {
  const [token, setToken] = useState('');
  const [authed, setAuthed] = useState(false);
  const [authError, setAuthError] = useState('');
  const [stats, setStats] = useState<Stats | null>(null);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'users'>('dashboard');

  const headers = { 'X-Admin-Token': token };

  const fetchData = useCallback(async () => {
    if (!token) return;
    try {
      const statsRes = await fetch(`${BACKEND_URL}/api/admin/stats`, { headers, credentials: "include" });
      if (statsRes.ok) setStats(await statsRes.json());
    } catch { /* ignore */ }
  }, [token]);

  useEffect(() => {
    if (!authed) return;
    fetchData();
    const interval = setInterval(fetchData, 15000); // auto-refresh every 15s
    return () => clearInterval(interval);
  }, [authed, fetchData]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    const res = await fetch(`${BACKEND_URL}/api/admin/stats`, { headers: { 'X-Admin-Token': token }, credentials: "include" });
    if (res.ok) {
      setAuthed(true);
      setStats(await res.json());
    } else {
      setAuthError('Неверный пароль администратора.');
    }
  };

  const fmtDate = (iso: string) => {
    try { return new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', year: 'numeric' }); }
    catch { return iso; }
  };

  // ─── Login Screen ─────────────────────────────────────────────────────────
  if (!authed) {
    return (
      <div style={{
        minHeight: '100vh', background: '#0a0b0d',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: '"Inter", sans-serif', color: '#fff',
      }}>
        <div style={{
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 20, padding: '32px 24px', width: 'min(380px, calc(100% - 32px))',
          boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
        }}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{
              width: 48, height: 48, background: 'linear-gradient(135deg,#7C3AED,#3B82F6)',
              borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 22, margin: '0 auto 14px',
            }}>⚙</div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Admin Panel</h2>
            <p style={{ margin: '6px 0 0', fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>
              Synapix · Только для администратора
            </p>
          </div>
          <form onSubmit={handleLogin}>
            <input
              type="password"
              id="admin-password"
              placeholder="Пароль администратора"
              value={token}
              onChange={e => setToken(e.target.value)}
              style={{
                width: '100%', padding: '12px 16px', background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10,
                color: '#fff', fontSize: 14, outline: 'none', boxSizing: 'border-box',
              }}
            />
            {authError && (
              <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 8,
                background: 'rgba(239,68,68,0.12)', color: '#FCA5A5', fontSize: 13 }}>
                {authError}
              </div>
            )}
            <button
              id="admin-login-btn"
              type="submit"
              style={{
                marginTop: 16, width: '100%', padding: 13,
                background: 'linear-gradient(135deg,#7C3AED,#3B82F6)',
                border: 'none', borderRadius: 10, color: '#fff', fontSize: 14,
                fontWeight: 600, cursor: 'pointer',
              }}
            >Войти в панель →</button>
          </form>
        </div>
      </div>
    );
  }

  // ─── Admin Dashboard ───────────────────────────────────────────────────────
  const tabStyle = (t: string) => ({
    padding: '8px 20px', borderRadius: 8, fontSize: 14, fontWeight: 500,
    cursor: 'pointer', border: 'none',
    background: activeTab === t ? 'rgba(124,58,237,0.25)' : 'transparent',
    color: activeTab === t ? '#A78BFA' : 'rgba(255,255,255,0.45)',
    transition: 'all 0.15s',
  });

  return (
    <div style={{ minHeight: '100vh', background: '#0a0b0d', color: '#fff', fontFamily: '"Inter", sans-serif' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 16px', minHeight: 56, gap: 12, flexWrap: 'wrap',
        background: 'rgba(255,255,255,0.03)',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 28, height: 28, background: 'linear-gradient(135deg,#7C3AED,#3B82F6)', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>⚙</div>
          <span style={{ fontWeight: 700, fontSize: 15 }}>Admin Panel</span>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginLeft: 4 }}>Synapix</span>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['dashboard', 'users'] as const).map(t => (
            <button key={t} style={tabStyle(t)} onClick={() => setActiveTab(t)}>
              {{ dashboard: 'Дашборд', users: 'Пользователи' }[t]}
            </button>
          ))}
        </div>
        <button
          onClick={fetchData}
          style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'rgba(255,255,255,0.5)', fontSize: 12, cursor: 'pointer' }}
        >↻ Обновить</button>
      </div>

      <div style={{ padding: '16px', overflowX: 'auto' }}>
        {/* ─── DASHBOARD TAB ─── */}
        {activeTab === 'dashboard' && stats && (
          <div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-8">
              <StatCard label="Всего пользователей" value={stats.total_users} gradient="linear-gradient(135deg,#7C3AED,#3B82F6)" />
              <StatCard label="Онлайн сейчас" value={stats.online_users} sub="за последние 5 мин" gradient="linear-gradient(135deg,#10B981,#06B6D4)" />
              <StatCard label="Проектов" value={stats.active_projects} gradient="linear-gradient(135deg,#F59E0B,#EF4444)" />
              <StatCard label="Медиа-библиотека" value={`${stats.media_library_size_mb} MB`} sub={`${stats.active_projects} проектов`} gradient="linear-gradient(135deg,#EC4899,#8B5CF6)" />
            </div>

            {/* Disk Usage */}
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: '20px 24px' }}>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 10 }}>Использование диска — {stats.disk_used_pct}%</div>
              <div style={{ height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 99, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 99, transition: 'width 0.5s',
                  width: `${stats.disk_used_pct}%`,
                  background: stats.disk_used_pct > 80 ? '#EF4444' : 'linear-gradient(90deg,#7C3AED,#3B82F6)',
                }} />
              </div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginTop: 6 }}>
                Занято: {(stats.disk_total_gb - stats.disk_free_gb).toFixed(1)} GB из {stats.disk_total_gb} GB · Свободно: {stats.disk_free_gb} GB
              </div>
            </div>
          </div>
        )}

        {/* ─── USERS TAB ─── */}
        {activeTab === 'users' && (
          <div>
            <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
              <StatCard label="Всего зарегистрировано" value={stats?.total_users ?? '—'} gradient="linear-gradient(135deg,#7C3AED,#3B82F6)" />
              <StatCard label="Онлайн прямо сейчас" value={stats?.online_users ?? '—'} sub="активны < 5 мин назад" gradient="linear-gradient(135deg,#10B981,#06B6D4)" />
            </div>
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, overflow: 'auto' }}>
              <table style={{ width: '100%', minWidth: 720, borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.04)' }}>
                    {['Аккаунт', 'Способ входа', 'План', 'Токены', 'Зарегистрирован', 'Последний визит', 'Статус'].map(h => (
                      <th key={h} style={{ padding: '12px 16px', textAlign: 'left', color: 'rgba(255,255,255,0.4)', fontWeight: 500 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(stats?.users ?? []).map(u => (
                    <tr key={u.id || u.login} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '12px 16px', fontWeight: 600, color: u.status === 'online' ? '#34D399' : '#fff' }}>
                        {u.status === 'online' && <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: '#34D399', marginRight: 6 }} />}
                        {u.name ? `${u.name} · ${u.login}` : u.login}
                      </td>
                      <td style={{ padding: '12px 16px', color: 'rgba(255,255,255,0.5)' }}>{u.key_label}</td>
                      <td style={{ padding: '12px 16px', color: 'rgba(255,255,255,0.5)' }}>{u.plan_status && u.plan_status !== 'none' ? `${u.plan || 'pro'} · ${u.plan_status}` : 'free'}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ color: u.tokens_limit > 0 && u.tokens_used > u.tokens_limit * 0.8 ? '#FCA5A5' : '#9CA3AF' }}>
                          {u.tokens_limit > 0 ? `${u.tokens_used.toLocaleString()} / ${u.tokens_limit.toLocaleString()}` : u.tokens_used.toLocaleString()}
                        </span>
                        <div style={{ marginTop: 4, height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 99 }}>
                          <div style={{ height: '100%', borderRadius: 99, width: `${u.tokens_limit > 0 ? Math.min((u.tokens_used / u.tokens_limit) * 100, 100) : 0}%`, background: 'linear-gradient(90deg,#7C3AED,#3B82F6)' }} />
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px', color: 'rgba(255,255,255,0.4)' }}>{fmtDate(u.registered_at)}</td>
                      <td style={{ padding: '12px 16px', color: 'rgba(255,255,255,0.4)' }}>{fmtDate(u.last_seen_at)}</td>
                      <td style={{ padding: '12px 16px' }}><Badge status={u.status} /></td>
                    </tr>
                  ))}
                  {(!stats?.users || stats.users.length === 0) && (
                    <tr><td colSpan={7} style={{ padding: 32, textAlign: 'center', color: 'rgba(255,255,255,0.25)' }}>Нет зарегистрированных пользователей</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
