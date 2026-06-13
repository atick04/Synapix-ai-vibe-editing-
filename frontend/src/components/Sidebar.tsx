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
  Sparkles,
  Sun,
  Moon
} from "lucide-react";

export default function Sidebar() {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const menuItems = [
    { icon: Video, label: "Studio", href: "/editor/new" }, // Just as placeholder, real app has dynamic routing but dashboard works
    { icon: Wand2, label: "AI Commercials", href: "/ai-commercials" },
    { icon: LayoutTemplate, label: "Templates", href: "/templates" },
    { icon: FolderClock, label: "Projects", href: "/" },
  ];

  return (
    <aside className="hidden lg:flex flex-col w-[64px] hover:w-[200px] m-2 p-3.5 rounded-[16px] bg-white/65 dark:bg-neutral-900/65 backdrop-blur-[20px] border border-neutral-200/50 dark:border-neutral-800/50 shadow-sm z-50 shrink-0 h-[calc(100vh-32px)] transition-all duration-300 group overflow-hidden">
      <div className="flex items-center gap-3 mb-6 px-1 mt-1">
        <div className="w-8 h-8 shrink-0 rounded-full bg-neutral-900 dark:bg-neutral-100 flex items-center justify-center">
          <Sparkles className="w-4 h-4 text-white dark:text-neutral-900" />
        </div>
        <span className="text-[14px] font-semibold tracking-tight text-neutral-900 dark:text-neutral-100 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-300">VibeEdit AI</span>
      </div>

      <nav className="flex-1 flex flex-col gap-2">
        {menuItems.map((item, idx) => {
          const isActive = pathname === item.href || (item.label === "Studio" && pathname.startsWith("/editor"));
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
              <span className="whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-300">Light Mode</span>
            </>
          ) : (
            <>
              <Moon className="w-4.5 h-4.5 shrink-0" />
              <span className="whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-300">Dark Mode</span>
            </>
          )}
        </button>

        <button className="flex items-center gap-4 px-2.5 py-2.5 w-full rounded-[12px] text-[13px] font-medium text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200/50 dark:hover:bg-neutral-800/50 hover:text-neutral-900 dark:hover:text-neutral-100 transition-all duration-200 overflow-hidden">
          <Settings className="w-4.5 h-4.5 shrink-0" />
          <span className="whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-300">Settings</span>
        </button>
      </div>
    </aside>
  );
}
