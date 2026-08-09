'use client';

import { useState } from 'react';
import { getApiUrl } from '@/utils/api';

interface AccessKeyModalProps {
  onSuccess: (login: string, key: string) => void;
  initialError?: string;
}

export default function AccessKeyModal({ onSuccess, initialError }: AccessKeyModalProps) {
  const [login, setLogin] = useState('');
  const [key, setKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(initialError || '');

  // Prefer NEXT_PUBLIC_API_URL; fall back to NEXT_PUBLIC_BACKEND_URL for older envs
  const BACKEND_URL =
    (typeof process !== 'undefined' && (process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_BACKEND_URL))
    || getApiUrl();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!login.trim() || !key.trim()) {
      setError('Пожалуйста, заполните оба поля.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL.replace(/\/$/, '')}/api/admin/validate-key?key=${encodeURIComponent(key.trim())}&login=${encodeURIComponent(login.trim())}`);
      const data = await res.json();
      if (data.valid) {
        localStorage.setItem('vibe_access_key', key.trim());
        localStorage.setItem('vibe_user_login', login.trim());
        onSuccess(login.trim(), key.trim());
      } else {
        const reasons: Record<string, string> = {
          access_key_invalid: 'Ключ не найден. Проверьте правильность ввода.',
          access_key_expired: 'Срок действия ключа истёк. Обратитесь к администратору.',
          access_key_revoked: 'Ключ был отозван. Обратитесь к администратору.',
          access_key_limit_reached: 'Исчерпан лимит токенов. Обратитесь к администратору.',
        };
        setError(reasons[data.reason] || 'Ключ недействителен.');
      }
    } catch {
      setError('Ошибка соединения с сервером.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(10, 10, 12, 0.8)',
      backdropFilter: 'blur(16px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: '"Inter", sans-serif',
    }}>
      <div style={{
        background: 'rgba(30, 30, 35, 0.65)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: 28,
        padding: '40px 36px',
        width: '100%', maxWidth: 420,
        boxShadow: '0 24px 64px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.1)',
        color: '#fff',
        backdropFilter: 'blur(32px)',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{ position: 'relative', zIndex: 1 }}>
          {/* Logo / Title */}
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <div style={{
              width: 64, height: 64,
              borderRadius: '50%',
              overflow: 'hidden',
              border: '2px solid rgba(255, 255, 255, 0.15)',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 16px',
              background: '#1c1c1e',
            }}>
              <img src="/main-logo.jpg" alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            </div>
            <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: '-0.5px' }}>
              Synapix
            </h2>
            <p style={{ margin: '8px 0 0', fontSize: 14, color: 'rgba(255,255,255,0.45)' }}>
              Введите данные для входа
            </p>
          </div>

          <form onSubmit={handleSubmit}>
            {/* Login */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.8px', fontWeight: 600 }}>
                Ваш логин
              </label>
              <input
                id="vibe-login"
                type="text"
                placeholder="Например: alex_editor"
                value={login}
                onChange={e => setLogin(e.target.value)}
                style={{
                  width: '100%', padding: '12px 16px',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 12,
                  color: '#fff', fontSize: 15,
                  outline: 'none', boxSizing: 'border-box',
                  transition: 'border-color 0.2s, background-color 0.2s',
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = 'rgba(124, 58, 237, 0.5)';
                  e.target.style.backgroundColor = 'rgba(255, 255, 255, 0.06)';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = 'rgba(255, 255, 255, 0.08)';
                  e.target.style.backgroundColor = 'rgba(255, 255, 255, 0.04)';
                }}
              />
            </div>

            {/* Access Key */}
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.8px', fontWeight: 600 }}>
                Ключ доступа (7 дней)
              </label>
              <input
                id="vibe-access-key"
                type="text"
                placeholder="vibe-xxxxxxxxxxxxxxxx"
                value={key}
                onChange={e => setKey(e.target.value)}
                style={{
                  width: '100%', padding: '12px 16px',
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 12,
                  color: '#fff', fontSize: 15,
                  outline: 'none', boxSizing: 'border-box',
                  fontFamily: '"JetBrains Mono", monospace',
                  transition: 'border-color 0.2s, background-color 0.2s',
                }}
                onFocus={(e) => {
                  e.target.style.borderColor = 'rgba(124, 58, 237, 0.5)';
                  e.target.style.backgroundColor = 'rgba(255, 255, 255, 0.06)';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = 'rgba(255, 255, 255, 0.08)';
                  e.target.style.backgroundColor = 'rgba(255, 255, 255, 0.04)';
                }}
              />
            </div>

            {error && (
              <div style={{
                padding: '10px 14px', borderRadius: 10,
                background: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                color: '#FCA5A5', fontSize: 13, marginBottom: 20,
              }}>
                {error}
              </div>
            )}

            <button
              id="vibe-submit-key"
              type="submit"
              disabled={loading}
              style={{
                width: '100%', padding: '14px',
                background: loading ? 'rgba(255,255,255,0.3)' : '#ececec',
                border: 'none', borderRadius: 12,
                color: '#0d0d0d', fontSize: 15, fontWeight: 600,
                cursor: loading ? 'wait' : 'pointer',
                transition: 'opacity 0.2s, transform 0.1s, background-color 0.2s',
                opacity: loading ? 0.7 : 1,
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
              }}
              onMouseOver={(e) => {
                if (!loading) e.currentTarget.style.backgroundColor = '#dcdcdc';
              }}
              onMouseOut={(e) => {
                if (!loading) e.currentTarget.style.backgroundColor = '#ececec';
              }}
              onMouseDown={(e) => {
                if (!loading) e.currentTarget.style.transform = 'scale(0.98)';
              }}
              onMouseUp={(e) => {
                if (!loading) e.currentTarget.style.transform = 'scale(1)';
              }}
            >
              {loading ? 'Проверяем...' : 'Войти в редактор →'}
            </button>
          </form>

          {/* CTO Feedback Section */}
          <div style={{
            marginTop: 24,
            padding: '14px 16px',
            borderRadius: 16,
            background: 'rgba(255, 255, 255, 0.02)',
            border: '1px solid rgba(255, 255, 255, 0.05)',
            textAlign: 'center',
          }}>
            <p style={{ margin: '0 0 8px 0', fontSize: 12.5, color: 'rgba(255, 255, 255, 0.55)', lineHeight: 1.4 }}>
              Напишите свой отзыв и ключевые моменты нашему CTO:
            </p>
            <a 
              href="https://t.me/MrAtick" 
              target="_blank" 
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                color: '#3B82F6',
                textDecoration: 'none',
                fontSize: 13,
                fontWeight: 600,
                transition: 'color 0.2s',
              }}
              onMouseOver={(e) => (e.currentTarget.style.color = '#60A5FA')}
              onMouseOut={(e) => (e.currentTarget.style.color = '#3B82F6')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.2-.08-.06-.19-.04-.27-.02-.11.02-1.93 1.23-5.46 3.62-.51.35-.98.53-1.39.51-.46-.01-1.35-.26-2.01-.48-.81-.27-1.46-.42-1.4-.88.03-.24.37-.49 1.02-.75 3.99-1.74 6.66-2.88 7.99-3.43 3.8-1.56 4.59-1.83 5.1-.1.11.23.1.48.02.73z"/>
              </svg>
              Telegram: @MrAtick
            </a>
          </div>

          <p style={{ textAlign: 'center', marginTop: 16, fontSize: 11, color: 'rgba(255,255,255,0.2)' }}>
            Нет ключа? Обратитесь к администратору.
          </p>
        </div>
      </div>
    </div>
  );
}
