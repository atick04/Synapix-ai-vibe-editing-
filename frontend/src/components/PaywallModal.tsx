"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { apiFetch } from "@/utils/api";

type Plan = { id: string; name: string };

export default function PaywallModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    apiFetch("/api/billing/plans")
      .then((res) => res.json())
      .then((data) => setPlans(data.plans || []))
      .catch(() => setPlans([]));
  }, [open]);

  if (!open) return null;

  const startCheckout = async (productId?: string) => {
    setError("");
    setBusy(productId || "checkout");
    try {
      const res = await apiFetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product_id: productId || "" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.detail === "string" ? data.detail : "billing_request_failed");
      window.location.href = data.checkout_url;
    } catch {
      setError("Не удалось открыть оплату. Попробуйте в кабинете.");
      setBusy("");
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-[420px] rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6 text-neutral-900 dark:text-white">
        <h2 className="text-[18px] font-semibold">Бесплатный ролик уже использован</h2>
        <p className="mt-2 text-[13px] text-neutral-500 leading-relaxed">
          Один Reel можно собрать бесплатно. Чтобы монтировать дальше, привяжите карту — пробный период начнётся сразу.
        </p>
        {error && <p className="mt-3 text-[13px] text-rose-500">{error}</p>}
        <div className="mt-4 grid gap-2">
          {(plans.length ? plans : [{ id: "", name: "Starter" }]).map((plan) => (
            <button
              key={plan.id || plan.name}
              type="button"
              disabled={Boolean(busy)}
              onClick={() => startCheckout(plan.id)}
              className="h-11 px-4 rounded-xl bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-[13px] font-semibold cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {busy === (plan.id || "checkout") && <Loader2 className="w-4 h-4 animate-spin" />}
              {plan.name}
            </button>
          ))}
        </div>
        <button type="button" onClick={onClose} className="mt-3 w-full h-10 text-[13px] text-neutral-500 cursor-pointer">
          Пока остаться в этом ролике
        </button>
      </div>
    </div>
  );
}
