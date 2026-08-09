import React from "react";
import { useVibe } from "@/context/VibeContext";

export interface BentoGridProps {
  children: React.ReactNode;
  className?: string;
}

export function BentoGrid({ children, className = "" }: BentoGridProps) {
  return (
    <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 w-full h-full max-w-full ${className}`}>
      {children}
    </div>
  );
}

export interface BentoCardProps {
  title: string;
  desc: string;
  icon: string;
  className?: string;
}

export function BentoCard({ title, desc, icon, className = "" }: BentoCardProps) {
  const { vibeConfig } = useVibe();
  const { palette } = vibeConfig;

  return (
    <div
      style={{
        backgroundColor: palette.cardBg,
        borderColor: palette.border,
        boxShadow: `0 0 16px ${palette.glow}`,
        backdropFilter: "blur(12px)",
      }}
      className={`p-4 rounded-2xl border transition-all duration-300 flex flex-col justify-between ${className}`}
    >
      <div className="flex items-center gap-3">
        <span className="text-xl p-2 rounded-lg bg-white/5 flex items-center justify-center">
          {icon}
        </span>
        <h4 style={{ color: palette.primary }} className="text-sm font-bold truncate">
          {title}
        </h4>
      </div>
      <p style={{ color: palette.secondary }} className="text-xs leading-relaxed mt-2 text-left line-clamp-2">
        {desc}
      </p>
    </div>
  );
}
