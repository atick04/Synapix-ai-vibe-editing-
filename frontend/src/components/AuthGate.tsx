"use client";

import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, Loader2, Lock, Mail, User } from "lucide-react";
import { apiFetch } from "@/utils/api";
import { useAuth } from "@/context/AuthContext";

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (cfg: Record<string, unknown>) => void;
          renderButton: (el: HTMLElement, cfg: Record<string, unknown>) => void;
        };
      };
    };
  }
}

const ERRORS: Record<string, string> = {
  google_token_invalid: "Google не подтвердил вход. Попробуйте ещё раз.",
  google_client_id_missing: "Google вход ещё не настроен на сервере.",
  invalid_email: "Введите корректный email.",
  password_too_short: "Пароль должен быть не короче 8 символов.",
  password_too_long: "Пароль слишком длинный.",
  email_taken: "Этот email уже зарегистрирован. Войдите.",
  account_exists_google: "Этот email уже через Google. Войдите через Google или задайте пароль во вкладке Регистрация.",
  invalid_credentials: "Неверный email или пароль.",
  login_rate_limited: "Слишком много попыток. Подождите минуту.",
  account_disabled: "Аккаунт отключён.",
  email_unverified: "Подтвердите email — мы отправили код на почту.",
  invalid_code: "Неверный код. Проверьте письмо.",
  code_expired: "Код истёк. Запросите новый.",
  code_attempts_exceeded: "Слишком много попыток. Запросите новый код.",
  code_resent_too_soon: "Код уже отправлен. Подождите чуть-чуть.",
  email_send_failed: "Не удалось отправить письмо. Попробуйте ещё раз.",
};

type Mode = "login" | "register" | "verify";

export default function AuthGate() {
  const { user, ready, loginWithGoogle, loginWithPassword, registerWithPassword, verifyEmail, resendCode } = useAuth();
  const [clientId, setClientId] = useState("");
  const [mailConfigured, setMailConfigured] = useState(false);
  const [googleReady, setGoogleReady] = useState(false);
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const btnRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    apiFetch("/api/auth/config")
      .then((r) => r.json())
      .then((data) => {
        setClientId(data.google_client_id || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "");
        setMailConfigured(Boolean(data.mail_configured));
      })
      .catch(() => setClientId(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || ""));
  }, []);

  useEffect(() => {
    if (!clientId || user) return;
    const existing = document.getElementById("google-gsi");
    if (existing) {
      setGoogleReady(true);
      return;
    }
    const script = document.createElement("script");
    script.id = "google-gsi";
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => setGoogleReady(true);
    document.head.appendChild(script);
  }, [clientId, user]);

  useEffect(() => {
    if (!googleReady || !clientId || !btnRef.current || user || mode === "verify" || !window.google) return;
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: async (response: { credential?: string }) => {
        if (!response.credential) return;
        setLoading(true);
        setError("");
        try {
          await loginWithGoogle(response.credential);
        } catch (err: any) {
          setError(ERRORS[err?.message] || "Не удалось войти через Google.");
        } finally {
          setLoading(false);
        }
      },
    });
    btnRef.current.innerHTML = "";
    window.google.accounts.id.renderButton(btnRef.current, {
      theme: "filled_black",
      size: "large",
      shape: "pill",
      text: "continue_with",
      width: 360,
    });
  }, [googleReady, clientId, user, loginWithGoogle, mode]);

  if (!ready || user) return null;

  const goVerify = (nextEmail: string, nextDev?: string) => {
    setEmail(nextEmail);
    setDevCode(nextDev || "");
    setCode("");
    setMode("verify");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (mode === "verify") {
      if (code.trim().length !== 6) {
        setError("Введите 6-значный код из письма.");
        return;
      }
      setLoading(true);
      try {
        await verifyEmail(email.trim(), code.trim());
      } catch (err: any) {
        setError(ERRORS[err?.message] || "Не удалось подтвердить email.");
      } finally {
        setLoading(false);
      }
      return;
    }
    if (!email.trim() || !password) {
      setError("Заполните email и пароль.");
      return;
    }
    if (mode === "register") {
      if (password.length < 8) {
        setError(ERRORS.password_too_short);
        return;
      }
      if (password !== confirm) {
        setError("Пароли не совпадают.");
        return;
      }
    }
    setLoading(true);
    try {
      if (mode === "register") {
        const pending = await registerWithPassword(name.trim(), email.trim(), password);
        goVerify(pending.email, pending.devCode);
      } else {
        await loginWithPassword(email.trim(), password);
      }
    } catch (err: any) {
      if (err?.message === "email_unverified") {
        try {
          const again = await resendCode(email.trim());
          goVerify(again.email, again.devCode);
          setError(ERRORS.email_unverified);
        } catch {
          goVerify(email.trim());
          setError(ERRORS.email_unverified);
        }
      } else {
        setError(ERRORS[err?.message] || (mode === "register" ? "Не удалось создать аккаунт." : "Не удалось войти."));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError("");
    setLoading(true);
    try {
      const again = await resendCode(email.trim());
      setDevCode(again.devCode || "");
    } catch (err: any) {
      setError(ERRORS[err?.message] || "Не удалось отправить код.");
    } finally {
      setLoading(false);
    }
  };

    const fieldClass =
    "w-full h-12 pl-11 pr-4 rounded-2xl bg-white/[0.05] border border-white/10 text-[16px] sm:text-[14px] text-white placeholder:text-white/30 outline-none transition-colors duration-200 focus:border-white/25 focus:bg-white/[0.07]";

  return (
    <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center bg-[#0B0D12] px-3 sm:px-4 py-0 sm:py-6 overflow-y-auto">
      <div className="relative w-full max-w-[420px] rounded-t-[28px] sm:rounded-[28px] border border-white/10 bg-[#14161C] p-5 sm:p-8 text-white my-0 sm:my-auto max-h-[100dvh] overflow-y-auto pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div className="text-center mb-5 sm:mb-7">
          <div className="w-[56px] h-[56px] sm:w-[68px] sm:h-[68px] rounded-full overflow-hidden border border-white/15 mx-auto mb-4 bg-neutral-800">
            <img src="/main-logo.jpg" alt="Synapix" className="w-full h-full object-cover" />
          </div>
          <h2 className="text-[22px] sm:text-[26px] font-semibold tracking-tight">Synapix</h2>
          <p className="mt-1.5 text-[13px] text-white/45">
            {mode === "login" && "Войдите в свою студию"}
            {mode === "register" && "Создайте аккаунт и откройте студию"}
            {mode === "verify" && (mailConfigured
              ? `Код отправлен на ${email}. Проверьте входящие и Спам.`
              : `Код для ${email}`)}
          </p>
        </div>

        {mode !== "verify" && (
          <div className="mb-5 grid grid-cols-2 p-1 rounded-2xl bg-white/[0.04] border border-white/8">
            <button
              type="button"
              onClick={() => { setMode("login"); setError(""); }}
              className={`h-10 rounded-xl text-[13px] font-medium cursor-pointer transition-all duration-200 ${
                mode === "login" ? "bg-white text-neutral-950 shadow-sm" : "text-white/45 hover:text-white/80"
              }`}
            >
              Вход
            </button>
            <button
              type="button"
              onClick={() => { setMode("register"); setError(""); }}
              className={`h-10 rounded-xl text-[13px] font-medium cursor-pointer transition-all duration-200 ${
                mode === "register" ? "bg-white text-neutral-950 shadow-sm" : "text-white/45 hover:text-white/80"
              }`}
            >
              Регистрация
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          {mode === "verify" ? (
            <label className="relative block">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                inputMode="numeric"
                autoComplete="one-time-code"
                className="w-full h-14 rounded-2xl bg-white/[0.05] border border-white/10 text-center text-[22px] tracking-[0.4em] font-semibold outline-none focus:border-white/25"
              />
            </label>
          ) : (
            <>
              {mode === "register" && (
                <label className="relative block">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/35" />
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Имя"
                    autoComplete="name"
                    className={fieldClass}
                  />
                </label>
              )}
              <label className="relative block">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/35" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email"
                  autoComplete="email"
                  className={fieldClass}
                />
              </label>
              <label className="relative block">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/35" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === "register" ? "Пароль · минимум 8 символов" : "Пароль"}
                  autoComplete={mode === "register" ? "new-password" : "current-password"}
                  className={`${fieldClass} pr-12`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/35 hover:text-white/70 cursor-pointer"
                  aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </label>
              {mode === "register" && (
                <label className="relative block">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/35" />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Повторите пароль"
                    autoComplete="new-password"
                    className={fieldClass}
                  />
                </label>
              )}
            </>
          )}

          {error && (
            <div className="text-[13px] text-rose-200 bg-rose-500/10 border border-rose-500/20 rounded-2xl px-3.5 py-2.5">
              {error}
            </div>
          )}

          {mode === "verify" && !mailConfigured && devCode && (
            <p className="text-[12px] text-white/35 text-center">Почта ещё не настроена. Локальный код: {devCode}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full h-12 rounded-2xl bg-white text-neutral-950 text-[16px] sm:text-[14px] font-semibold cursor-pointer transition-all duration-200 hover:bg-white/90 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {mode === "login" && "Войти"}
            {mode === "register" && "Получить код"}
            {mode === "verify" && "Подтвердить"}
          </button>
        </form>

        {mode === "verify" ? (
          <div className="mt-4 flex items-center justify-between text-[12px] text-white/40">
            <button type="button" onClick={() => { setMode("register"); setError(""); }} className="cursor-pointer hover:text-white/70">
              Назад
            </button>
            <button type="button" onClick={handleResend} className="cursor-pointer hover:text-white/70">
              Отправить код ещё раз
            </button>
          </div>
        ) : (
          <>
            <div className="my-5 flex items-center gap-3 text-[11px] uppercase tracking-[0.16em] text-white/30">
              <span className="flex-1 h-px bg-white/10" />
              или
              <span className="flex-1 h-px bg-white/10" />
            </div>
            {clientId ? (
              <div className="flex flex-col items-center gap-2">
                <div ref={btnRef} className="min-h-[44px] w-full flex justify-center" />
              </div>
            ) : (
              <p className="text-center text-[12px] text-white/35">
                Google вход можно подключить позже
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
