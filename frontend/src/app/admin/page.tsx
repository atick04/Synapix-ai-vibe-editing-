'use client';

import { useState, useEffect, useCallback } from 'react';

const BACKEND_URL = (
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  'http://localhost:8001'
).replace(/\/$/, '');

interface Key {
  id: string;
  label: string;
  created_at: string;
  expires_at: string;
  tokens_limit: number;
  tokens_used: number;
  status: string;
}

interface User {
  login: string;
  key_label: string;
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
  active_keys: number;
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
  const [keys, setKeys] = useState<Key[]>([]);
  const [newLabel, setNewLabel] = useState('');
  const [newLimit, setNewLimit] = useState(100000);
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'keys' | 'users'>('dashboard');

  const headers = { 'X-Admin-Token': token };

  const fetchData = useCallback(async () => {
    if (!token) return;
    try {
      const [statsRes, keysRes] = await Promise.all([
        fetch(`${BACKEND_URL}/api/admin/stats`, { headers }),
        fetch(`${BACKEND_URL}/api/admin/keys`,  { headers }),
      ]);
      if (statsRes.ok) setStats(await statsRes.json());
      if (keysRes.ok) setKeys(await keysRes.json());
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
    const res = await fetch(`${BACKEND_URL}/api/admin/stats`, { headers: { 'X-Admin-Token': token } });
    if (res.ok) {
      setAuthed(true);
      setStats(await res.json());
    } else {
      setAuthError('Неверный пароль администратора.');
    }
  };

  const handleCreateKey = async () => {
    if (!newLabel.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/admin/keys`, {
        method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: newLabel, tokens_limit: newLimit, days: 7 }),
      });
      if (res.ok) {
        const created = await res.json();
        setKeys(prev => [created, ...prev]);
        setNewLabel('');
        setCopiedId(created.id);
        navigator.clipboard.writeText(created.id).catch(() => {});
        setTimeout(() => setCopiedId(null), 4000);
      }
    } finally { setLoading(false); }
  };

  const handleRevoke = async (keyId: string) => {
    if (!confirm('Отозвать ключ?')) return;
    const res = await fetch(`${BACKEND_URL}/api/admin/keys/${keyId}`, { method: 'DELETE', headers });
    if (res.ok) {
      setKeys(prev => prev.map(k => k.id === keyId ? { ...k, status: 'revoked' } : k));
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
          borderRadius: 20, padding: '44px 40px', width: 380,
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
        padding: '0 32px', height: 56,
        background: 'rgba(255,255,255,0.03)',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 28, height: 28, background: 'linear-gradient(135deg,#7C3AED,#3B82F6)', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>⚙</div>
          <span style={{ fontWeight: 700, fontSize: 15 }}>Admin Panel</span>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', marginLeft: 4 }}>Synapix</span>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['dashboard', 'keys', 'users'] as const).map(t => (
            <button key={t} style={tabStyle(t)} onClick={() => setActiveTab(t)}>
              {{ dashboard: '📊 Дашборд', keys: '🔑 Ключи', users: '👥 Пользователи' }[t]}
            </button>
          ))}
        </div>
        <button
          onClick={fetchData}
          style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'rgba(255,255,255,0.5)', fontSize: 12, cursor: 'pointer' }}
        >↻ Обновить</button>
      </div>

      <div style={{ padding: '32px' }}>
        {/* ─── DASHBOARD TAB ─── */}
        {activeTab === 'dashboard' && stats && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 32 }}>
              <StatCard label="Всего пользователей" value={stats.total_users} gradient="linear-gradient(135deg,#7C3AED,#3B82F6)" />
              <StatCard label="Онлайн сейчас" value={stats.online_users} sub="за последние 5 мин" gradient="linear-gradient(135deg,#10B981,#06B6D4)" />
              <StatCard label="Активных ключей" value={stats.active_keys} gradient="linear-gradient(135deg,#F59E0B,#EF4444)" />
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

        {/* ─── KEYS TAB ─── */}
        {activeTab === 'keys' && (
          <div>
            {/* Create Key */}
            <div style={{
              background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 14, padding: '20px 24px', marginBottom: 24,
            }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>Создать новый ключ доступа (7 дней)</div>
              <div style={{ display: 'flex', gap: 12 }}>
                <input
                  id="new-key-label"
                  value={newLabel}
                  onChange={e => setNewLabel(e.target.value)}
                  placeholder="Метка (напр. «Клиент Анна»)"
                  style={{
                    flex: 1, padding: '10px 14px', background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10,
                    color: '#fff', fontSize: 14, outline: 'none',
                  }}
                />
                <input
                  id="new-key-limit"
                  type="number"
                  value={newLimit}
                  onChange={e => setNewLimit(parseInt(e.target.value) || 1000)}
                  style={{
                    width: 120, padding: '10px 14px', background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10,
                    color: '#fff', fontSize: 14, outline: 'none',
                  }}
                  placeholder="Лимит токенов"
                />
                <button
                  id="create-key-btn"
                  onClick={handleCreateKey}
                  disabled={loading}
                  style={{
                    padding: '10px 20px', background: 'linear-gradient(135deg,#7C3AED,#3B82F6)',
                    border: 'none', borderRadius: 10, color: '#fff', fontSize: 14,
                    fontWeight: 600, cursor: 'pointer', opacity: loading ? 0.6 : 1,
                  }}
                >{loading ? 'Создаём...' : '+ Создать'}</button>
              </div>
              {copiedId && (
                <div style={{
                  marginTop: 12, padding: '10px 14px', borderRadius: 10,
                  background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.2)',
                  color: '#34D399', fontSize: 13,
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  ✓ Ключ создан и скопирован:
                  <code style={{ fontFamily: 'monospace', color: '#6EE7B7' }}>{copiedId}</code>
                </div>
              )}
            </div>

            {/* Keys Table */}
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.04)' }}>
                    {['Метка', 'ID ключа', 'Токены', 'Истекает', 'Статус', ''].map(h => (
                      <th key={h} style={{ padding: '12px 16px', textAlign: 'left', color: 'rgba(255,255,255,0.4)', fontWeight: 500 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {keys.map(k => (
                    <tr key={k.id} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '12px 16px', fontWeight: 600 }}>{k.label}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <code
                          onClick={() => { navigator.clipboard.writeText(k.id).catch(() => {}); setCopiedId(k.id); setTimeout(() => setCopiedId(null), 2000); }}
                          style={{ fontFamily: 'monospace', fontSize: 12, color: '#A78BFA', cursor: 'pointer' }}
                          title="Нажмите, чтобы скопировать"
                        >{k.id}</code>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ color: k.tokens_used > k.tokens_limit * 0.8 ? '#FCA5A5' : '#9CA3AF' }}>
                          {k.tokens_used.toLocaleString()} / {k.tokens_limit.toLocaleString()}
                        </span>
                        <div style={{ marginTop: 4, height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 99 }}>
                          <div style={{ height: '100%', borderRadius: 99, width: `${Math.min((k.tokens_used / k.tokens_limit) * 100, 100)}%`, background: 'linear-gradient(90deg,#7C3AED,#3B82F6)' }} />
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px', color: 'rgba(255,255,255,0.5)' }}>{fmtDate(k.expires_at)}</td>
                      <td style={{ padding: '12px 16px' }}><Badge status={k.status} /></td>
                      <td style={{ padding: '12px 16px' }}>
                        {k.status === 'active' && (
                          <button onClick={() => handleRevoke(k.id)} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.1)', color: '#F87171', fontSize: 12, cursor: 'pointer' }}>
                            Отозвать
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {keys.length === 0 && (
                    <tr><td colSpan={6} style={{ padding: 32, textAlign: 'center', color: 'rgba(255,255,255,0.25)' }}>Ключей пока нет. Создайте первый!</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ─── USERS TAB ─── */}
        {activeTab === 'users' && (
          <div>
            <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
              <StatCard label="Всего зарегистрировано" value={stats?.total_users ?? '—'} gradient="linear-gradient(135deg,#7C3AED,#3B82F6)" />
              <StatCard label="Онлайн прямо сейчас" value={stats?.online_users ?? '—'} sub="активны < 5 мин назад" gradient="linear-gradient(135deg,#10B981,#06B6D4)" />
            </div>
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.04)' }}>
                    {['Логин', 'Ключ', 'Токены', 'Зарегистрирован', 'Последний визит', 'Статус'].map(h => (
                      <th key={h} style={{ padding: '12px 16px', textAlign: 'left', color: 'rgba(255,255,255,0.4)', fontWeight: 500 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(stats?.users ?? []).map(u => (
                    <tr key={u.login} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '12px 16px', fontWeight: 600, color: u.status === 'online' ? '#34D399' : '#fff' }}>
                        {u.status === 'online' && <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: '#34D399', marginRight: 6 }} />}
                        {u.login}
                      </td>
                      <td style={{ padding: '12px 16px', color: 'rgba(255,255,255,0.5)' }}>{u.key_label}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ color: u.tokens_used > u.tokens_limit * 0.8 ? '#FCA5A5' : '#9CA3AF' }}>
                          {u.tokens_used.toLocaleString()} / {u.tokens_limit.toLocaleString()}
                        </span>
                        <div style={{ marginTop: 4, height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 99 }}>
                          <div style={{ height: '100%', borderRadius: 99, width: `${Math.min((u.tokens_used / u.tokens_limit) * 100, 100)}%`, background: 'linear-gradient(90deg,#7C3AED,#3B82F6)' }} />
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px', color: 'rgba(255,255,255,0.4)' }}>{fmtDate(u.registered_at)}</td>
                      <td style={{ padding: '12px 16px', color: 'rgba(255,255,255,0.4)' }}>{fmtDate(u.last_seen_at)}</td>
                      <td style={{ padding: '12px 16px' }}><Badge status={u.status} /></td>
                    </tr>
                  ))}
                  {(!stats?.users || stats.users.length === 0) && (
                    <tr><td colSpan={6} style={{ padding: 32, textAlign: 'center', color: 'rgba(255,255,255,0.25)' }}>Нет зарегистрированных пользователей</td></tr>
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
