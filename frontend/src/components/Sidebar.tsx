"use client";

import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import Link from "next/link";
import { 
  Video, 
  FolderClock, 
  Settings, 
  LayoutTemplate,
  Wand2,
  Sun,
  Moon
} from "lucide-react";

import { useLanguage } from "@/context/LanguageContext";
import { useAuth } from "@/context/AuthContext";

export default function Sidebar() {
  const pathname = usePathname();
  const { lang, theme, setTheme } = useTheme() as any;
  const { lang: appLang } = useLanguage();
  const { user, logout } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [lastProjectId, setLastProjectId] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    const savedId = localStorage.getItem('last_project_id');
    if (savedId) {
      setLastProjectId(savedId);
    }
  }, [pathname]);

  if (pathname?.startsWith('/admin')) return null;

  const menuItems = [
    { id: "studio", icon: Video, label: appLang === 'ru' ? "Студия" : "Studio", href: lastProjectId ? `/editor/${lastProjectId}` : "/" },
    { id: "commercials", icon: Wand2, label: appLang === 'ru' ? "ИИ Реклама" : "AI Ads", href: "/ai-commercials" },
    { id: "templates", icon: LayoutTemplate, label: appLang === 'ru' ? "Reels стиль" : "Reels style", href: "/templates" },
    { id: "projects", icon: FolderClock, label: appLang === 'ru' ? "Проекты" : "Projects", href: "/" },
    { id: "account", icon: Settings, label: appLang === 'ru' ? "Кабинет" : "Account", href: "/account" },
  ];

  return (
    <aside className="hidden lg:flex flex-col w-[64px] hover:w-[200px] m-2 p-3.5 rounded-[16px] bg-white/65 dark:bg-neutral-900/65 backdrop-blur-[20px] border border-neutral-200/50 dark:border-neutral-800/50 shadow-sm z-50 shrink-0 h-[calc(100vh-32px)] transition-all duration-300 group overflow-hidden">
      {/* Logo — icon only, no duplicate text */}
      <div className="flex items-center gap-3 mb-6 px-1 mt-1">
        <div className="w-8 h-8 shrink-0 rounded-full overflow-hidden bg-neutral-900 dark:bg-neutral-100 flex items-center justify-center">
          <img src="/main-logo.jpg" alt="Logo" className="w-full h-full object-cover" />
        </div>
        <span className="text-[14px] font-semibold tracking-tight text-neutral-900 dark:text-neutral-100 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-300">Synapix</span>
      </div>

      <nav className="flex-1 flex flex-col gap-2">
        {menuItems.map((item, idx) => {
          const isActive =
            item.id === "studio"
              ? pathname.startsWith("/editor")
              : item.id === "account"
                ? pathname.startsWith("/account")
                : pathname === item.href;
          return (
            <Link
              key={idx}
              href={item.href}
              className={`flex items-center gap-4 px-2.5 py-2.5 rounded-[12px] text-[13px] font-medium transition-all duration-200 ${
                isActive 
                  ? "bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 shadow-sm" 
                  : "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200/50 dark:hover:bg-neutral-800/50 hover:text-neutral-900 dark:hover:text-neutral-100"
              }`}
            >
              <item.icon className="w-4.5 h-4.5 shrink-0" />
              <span className="whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-300">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-2">
        <button 
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="flex items-center gap-4 px-2.5 py-2.5 w-full rounded-[12px] text-[13px] font-medium text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200/50 dark:hover:bg-neutral-800/50 hover:text-neutral-900 dark:hover:text-neutral-100 transition-all duration-200 overflow-hidden"
        >
          {mounted && theme === "dark" ? (
            <>
              <Sun className="w-4.5 h-4.5 shrink-0" />
              <span className="whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-300">Светлая тема</span>
            </>
          ) : (
            <>
              <Moon className="w-4.5 h-4.5 shrink-0" />
              <span className="whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-300">Темная тема</span>
            </>
          )}
        </button>

        {user && (
          <Link href="/account" className="flex items-center gap-3 px-1.5 py-2 rounded-[12px] overflow-hidden hover:bg-neutral-200/50 dark:hover:bg-neutral-800/50">
            {user.picture ? (
              <img src={user.picture} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-neutral-800 text-white text-[11px] font-semibold flex items-center justify-center shrink-0">
                {(user.name || user.email || "?").slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
              <p className="text-[12px] font-semibold truncate text-neutral-900 dark:text-neutral-100">{user.name || user.email}</p>
              <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); logout(); }} className="text-[10px] text-neutral-500 hover:text-rose-400 cursor-pointer">
                Выйти
              </button>
            </div>
          </Link>
        )}
      </div>
    </aside>
  );
}
