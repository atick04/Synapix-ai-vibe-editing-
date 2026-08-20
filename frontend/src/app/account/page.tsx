"use client";

import { useEffect, useState } from "react";
import { Building2, Check, CreditCard, Loader2, Lock, Mail, User as UserIcon } from "lucide-react";
import { apiFetch } from "@/utils/api";
import AuthGate from "@/components/AuthGate";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";

const ERRORS: Record<string, string> = {
  name_required: "Введите имя.",
  name_too_long: "Имя слишком длинное.",
  invalid_email: "Введите корректный email.",
  google_email_locked: "Email от Google нельзя сменить здесь.",
  email_taken: "Этот email уже занят.",
  password_too_short: "Новый пароль должен быть не короче 8 символов.",
  billing_not_configured: "Оплата ещё не настроена на сервере.",
  billing_product_missing: "В Dodo не выбран продукт.",
  billing_no_customer: "Сначала оформите подписку.",
  billing_request_failed: "Не удалось открыть оплату. Попробуйте ещё раз.",
};

function planLabel(status?: string, plan?: string) {
  if (status === "unlimited") return "Безлимит";
  if (status === "active") return plan === "pro" ? "Synapix Pro" : "Активна";
  if (status === "trialing") return "Пробный период";
  if (status === "on_hold") return "Нужна карта";
  if (status === "cancelled") return "Отменена";
  return "Бесплатный доступ";
}

function BillingCard({
  user,
  onRefresh,
}: {
  user: { plan?: string; plan_status?: string; plan_renews_at?: string; has_subscription?: boolean };
  onRefresh: () => Promise<void>;
}) {
  const [plans, setPlans] = useState<Array<{ id: string; name: string; amount?: number; currency?: string }>>([]);
  const [trialDays, setTrialDays] = useState(7);
  const [configured, setConfigured] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("billing") === "success") {
      setFlash("Оплата прошла. Подписка обновится через несколько секунд.");
      onRefresh();
    }
    apiFetch("/api/billing/plans")
      .then((res) => res.json())
      .then((data) => {
        setPlans(data.plans || []);
        setTrialDays(data.trial_days ?? 7);
        setConfigured(Boolean((data.plans || []).length) || true);
      })
      .catch(() => setConfigured(false));
    apiFetch("/api/billing/config")
      .then((res) => res.json())
      .then((data) => setConfigured(Boolean(data.configured)))
      .catch(() => setConfigured(false));
  }, []);

  const startCheckout = async (productId?: string) => {
    setError("");
    setBusy("checkout");
    try {
      const res = await apiFetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_id: productId || "" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "billing_request_failed");
      window.location.href = data.checkout_url;
    } catch (err: any) {
      setError(ERRORS[err?.message] || "Не удалось открыть оплату.");
      setBusy("");
    }
  };

  const openPortal = async () => {
    setError("");
    setBusy("portal");
    try {
      const res = await apiFetch("/api/billing/portal", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "billing_request_failed");
      window.location.href = data.portal_url;
    } catch (err: any) {
      setError(ERRORS[err?.message] || "Не удалось открыть биллинг.");
      setBusy("");
    }
  };

  const active = user.plan_status === "active" || user.plan_status === "trialing";

  return (
    <section className="p-5 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold">Подписка</h2>
          <p className="mt-1 text-[13px] text-neutral-500">
            {active
              ? `${planLabel(user.plan_status, user.plan)}${user.plan_renews_at ? ` · следующее списание ${user.plan_renews_at.slice(0, 10)}` : ""}`
              : "Студия открыта. Один Reel можно собрать бесплатно, карту просим на следующий."}
          </p>
        </div>
        <CreditCard className="w-4 h-4 text-neutral-400 mt-1" />
      </div>
      {flash && (
        <div className="text-[13px] text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-xl px-3.5 py-2.5">
          {flash}
        </div>
      )}
      {error && (
        <div className="text-[13px] text-rose-600 dark:text-rose-300 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-xl px-3.5 py-2.5">
          {error}
        </div>
      )}
      {!configured ? (
        <p className="text-[13px] text-neutral-400">Оплата подключится, как только в Dodo будет API-ключ.</p>
      ) : active ? (
        <button
          type="button"
          onClick={openPortal}
          disabled={busy === "portal"}
          className="h-11 px-4 rounded-xl border border-neutral-200 dark:border-neutral-800 text-[13px] font-medium cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800 disabled:opacity-60"
        >
          {busy === "portal" ? "Открываем…" : "Управлять подпиской"}
        </button>
      ) : (
        <div className="space-y-3">
          {trialDays > 0 && (
            <p className="text-[12px] text-neutral-400">{trialDays} дней пробного периода на любом плане.</p>
          )}
          <div className="grid gap-2">
            {(plans.length ? plans : [{ id: "", name: "Starter" }]).map((item) => (
              <button
                key={item.id || item.name}
                type="button"
                onClick={() => startCheckout(item.id)}
                disabled={Boolean(busy)}
                className="h-11 px-4 rounded-xl border border-neutral-200 dark:border-neutral-800 text-[13px] font-medium cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800 disabled:opacity-60 flex items-center justify-between"
              >
                <span>{item.name}</span>
                <span className="text-neutral-400">
                  {busy === `checkout:${item.id}` || busy === "checkout" ? "Открываем…" : "Выбрать"}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-[12px] font-medium text-neutral-500 dark:text-neutral-400 mb-1.5">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1.5 block text-[12px] text-neutral-400">{hint}</span>}
    </label>
  );
}

const inputClass =
  "w-full h-11 px-3.5 rounded-xl bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 text-[16px] sm:text-[14px] outline-none transition-colors focus:border-neutral-400 dark:focus:border-neutral-600";

export default function AccountPage() {
  const { user, ready, updateProfile, logout, refresh } = useAuth();
  const { lang, setLang } = useLanguage();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [bio, setBio] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!user) return;
    setName(user.name || "");
    setEmail(user.email || "");
    setCompany(user.company || "");
    setBio(user.bio || "");
  }, [user]);

  if (!ready) return null;
  if (!user) return <AuthGate />;

  const googleLocked = user.auth === "google";
  const initial = (user.name || user.email || "?").slice(0, 1).toUpperCase();
  const registered = user.registered_at
    ? new Date(user.registered_at).toLocaleDateString(lang === "ru" ? "ru-RU" : "en-US", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "";

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSaved(false);
    if (newPassword && newPassword !== confirmPassword) {
      setError("Пароли не совпадают.");
      return;
    }
    setSaving(true);
    try {
      await updateProfile({
        name: name.trim(),
        email: email.trim(),
        company,
        bio,
        current_password: currentPassword || undefined,
        new_password: newPassword || undefined,
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSaved(true);
    } catch (err: any) {
      setError(ERRORS[err?.message] || "Не удалось сохранить профиль.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto pb-mobile-nav lg:pb-0">
      <div className="max-w-2xl mx-auto px-4 py-6 sm:px-6 sm:py-10">
        <div className="mb-6 sm:mb-8">
          <p className="text-[12px] uppercase tracking-[0.16em] text-neutral-400 mb-2">Кабинет</p>
          <h1 className="text-[24px] sm:text-[28px] font-semibold tracking-tight">Профиль</h1>
          <p className="mt-1 text-[14px] text-neutral-500">Имя, контакты и пароль для вашего аккаунта Synapix.</p>
        </div>

        <div className="flex items-center gap-4 mb-8 p-4 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
          {user.picture ? (
            <img src={user.picture} alt="" className="w-14 h-14 rounded-full object-cover" />
          ) : (
            <div className="w-14 h-14 rounded-full bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 text-[18px] font-semibold flex items-center justify-center">
              {initial}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-[15px] font-semibold truncate">{user.name || "Без имени"}</p>
            <p className="text-[13px] text-neutral-500 truncate">{user.email}</p>
            <p className="text-[12px] text-neutral-400 mt-0.5">
              {googleLocked ? "Вход через Google" : "Вход по email"}
              {registered ? ` · с ${registered}` : ""}
            </p>
          </div>
        </div>

        <div className="mb-8">
          <BillingCard user={user} onRefresh={refresh} />
        </div>

        <form onSubmit={handleSave} className="space-y-8">
          <section className="p-5 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 space-y-4">
            <h2 className="text-[15px] font-semibold">Основные данные</h2>
            <Field label="Имя">
              <div className="relative">
                <UserIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                <input value={name} onChange={(e) => setName(e.target.value)} className={`${inputClass} pl-10`} />
              </div>
            </Field>
            <Field
              label="Email"
              hint={googleLocked ? "Почта привязана к Google и не меняется." : undefined}
            >
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={googleLocked}
                  className={`${inputClass} pl-10 disabled:opacity-60 disabled:cursor-not-allowed`}
                />
              </div>
            </Field>
            <Field label="Компания или бренд">
              <div className="relative">
                <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                <input
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="Необязательно"
                  className={`${inputClass} pl-10`}
                />
              </div>
            </Field>
            <Field label="О себе">
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={3}
                maxLength={280}
                placeholder="Коротко о канале или студии"
                className={`${inputClass} h-auto py-3 resize-none`}
              />
            </Field>
          </section>

          <section className="p-5 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 space-y-4">
            <h2 className="text-[15px] font-semibold">Пароль</h2>
            {user.has_password && (
              <Field label="Текущий пароль">
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    autoComplete="current-password"
                    className={`${inputClass} pl-10`}
                  />
                </div>
              </Field>
            )}
            <Field label={user.has_password ? "Новый пароль" : "Задать пароль"}>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                placeholder="Минимум 8 символов"
                className={inputClass}
              />
            </Field>
            <Field label="Повторите пароль">
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                className={inputClass}
              />
            </Field>
            {!user.has_password && (
              <p className="text-[12px] text-neutral-400">
                Можно задать пароль, чтобы входить и без Google.
              </p>
            )}
          </section>

          <section className="p-5 rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
            <h2 className="text-[15px] font-semibold mb-3">Язык интерфейса</h2>
            <div className="grid grid-cols-2 gap-2">
              {([
                { id: "ru", label: "Русский" },
                { id: "en", label: "English" },
              ] as const).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setLang(item.id)}
                  className={`h-11 rounded-xl text-[13px] font-medium cursor-pointer border transition-colors ${
                    lang === item.id
                      ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 border-transparent"
                      : "border-neutral-200 dark:border-neutral-800 text-neutral-500 hover:text-neutral-900 dark:hover:text-neutral-100"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </section>

          {error && (
            <div className="text-[13px] text-rose-600 dark:text-rose-300 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-xl px-3.5 py-2.5">
              {error}
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-3 pb-4">
            <button
              type="button"
              onClick={logout}
              className="h-11 px-4 rounded-xl text-[13px] text-neutral-500 hover:text-rose-500 cursor-pointer"
            >
              Выйти из аккаунта
            </button>
            <button
              type="submit"
              disabled={saving}
              className="h-11 px-5 rounded-xl bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-[14px] font-semibold cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : null}
              {saved ? "Сохранено" : "Сохранить"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
