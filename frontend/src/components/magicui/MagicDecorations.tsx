import React, { useEffect, useState, useRef } from "react";

// 1. RainbowButton
export function RainbowButton({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="relative p-[3px] rounded-xl overflow-hidden active:scale-95 transition-transform pointer-events-auto"
      style={{
        background: "linear-gradient(90deg, #ff007f, #7f00ff, #00e5ff, #ff007f)",
        backgroundSize: "300% 100%",
        animation: "rainbow-flow 3s linear infinite",
      }}
    >
      <div className="bg-slate-900/90 text-white px-5 py-2.5 rounded-[9px] font-bold text-sm tracking-wide shadow-lg uppercase">
        {children}
      </div>
      <style>{`
        @keyframes rainbow-flow {
          0% { background-position: 0% 50%; }
          100% { background-position: 300% 50%; }
        }
      `}</style>
    </button>
  );
}

// 2. ShimmerButton
export function ShimmerButton({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="relative px-6 py-3 rounded-xl overflow-hidden bg-slate-950 border border-slate-800 text-white font-semibold text-sm tracking-wide uppercase shadow-2xl active:scale-95 transition-transform pointer-events-auto"
    >
      <span className="relative z-10">{children}</span>
      <div className="absolute inset-0 w-[40px] h-full bg-white/20 skew-x-[-20deg] blur-md -left-[60px] animate-shimmer" />
      <style>{`
        @keyframes shimmer {
          0% { left: -60px; }
          100% { left: 120%; }
        }
        .animate-shimmer {
          animation: shimmer 2.5s infinite ease-in-out;
        }
      `}</style>
    </button>
  );
}

// 3. RippleButton
export function RippleButton({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number }[]>([]);
  let count = 0;

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setRipples((prev) => [...prev, { id: count++, x, y }]);
    if (onClick) onClick();
  };

  useEffect(() => {
    if (ripples.length > 0) {
      const timer = setTimeout(() => setRipples([]), 600);
      return () => clearTimeout(timer);
    }
  }, [ripples]);

  return (
    <button
      onClick={handleClick}
      className="relative overflow-hidden px-6 py-3 rounded-xl bg-slate-900 border border-slate-700 text-white font-semibold text-sm tracking-wide uppercase active:scale-95 transition-transform pointer-events-auto"
    >
      <span className="relative z-10">{children}</span>
      {ripples.map((r) => (
        <span
          key={r.id}
          style={{
            left: r.x,
            top: r.y,
            transform: "translate(-50%, -50%) scale(0)",
            animation: "ripple-effect 0.6s ease-out",
          }}
          className="absolute w-5 h-5 bg-white/20 rounded-full pointer-events-none"
        />
      ))}
      <style>{`
        @keyframes ripple-effect {
          to {
            transform: translate(-50%, -50%) scale(12);
            opacity: 0;
          }
        }
      `}</style>
    </button>
  );
}

// 4. SafariMock
export function SafariMock({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full h-full flex flex-col rounded-xl overflow-hidden border border-slate-800 bg-slate-950/80 shadow-2xl backdrop-blur-md text-left">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-900 bg-slate-900/40">
        <div className="flex gap-1.5">
          <span className="w-3 h-3 rounded-full bg-red-500/80" />
          <span className="w-3 h-3 rounded-full bg-yellow-500/80" />
          <span className="w-3 h-3 rounded-full bg-green-500/80" />
        </div>
        <div className="mx-auto w-[60%] h-6 rounded-md bg-slate-950/50 border border-slate-900 flex items-center justify-center text-[10px] text-slate-400 font-mono tracking-tight px-3 overflow-hidden text-ellipsis">
          🔒 vibedit.ai/preview
        </div>
      </div>
      <div className="flex-1 p-4 relative overflow-y-auto">{children}</div>
    </div>
  );
}

// 5. IPhoneMock
export function IPhoneMock({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative mx-auto w-[280px] h-[520px] rounded-[42px] border-[10px] border-slate-900 bg-slate-950 shadow-2xl flex flex-col overflow-hidden">
      {/* Notch */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[110px] h-[22px] bg-slate-900 rounded-b-[18px] z-50 flex items-center justify-center gap-1.5">
        <div className="w-2 h-2 rounded-full bg-slate-950" />
        <div className="w-10 h-1.5 rounded-full bg-slate-950" />
      </div>
      <div className="flex-1 p-4 pt-8 relative overflow-y-auto">{children}</div>
    </div>
  );
}

// 6. TextHighlighter
export function TextHighlighter({ children, color = "#a78bfa" }: { children: string; color?: string }) {
  return (
    <span className="relative inline-block px-1">
      <span className="relative z-10 text-white font-bold">{children}</span>
      <span
        style={{
          backgroundColor: color,
          animation: "highlight-draw 1.2s cubic-bezier(0.16, 1, 0.3, 1) forwards",
          animationDelay: "0.4s",
        }}
        className="absolute bottom-1 left-0 right-0 h-[70%] -z-10 rounded-sm opacity-40 scale-x-0 origin-left"
      />
      <style>{`
        @keyframes highlight-draw {
          to { transform: scale-x(1); }
        }
      `}</style>
    </span>
  );
}

// 7. AuroraText
export function AuroraText({ children }: { children: string }) {
  return (
    <span
      className="font-extrabold uppercase bg-clip-text text-transparent animate-aurora tracking-wider"
      style={{
        backgroundImage: "linear-gradient(135deg, #00e5ff, #ff007f, #7f00ff, #00e5ff)",
        backgroundSize: "300% 300%",
      }}
    >
      {children}
      <style>{`
        @keyframes aurora {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .animate-aurora {
          animation: aurora 5s ease infinite;
        }
      `}</style>
    </span>
  );
}

// 8. TypingAnimation
export function TypingAnimation({ text, speed = 80 }: { text: string; speed?: number }) {
  const [displayedText, setDisplayedText] = useState("");

  useEffect(() => {
    let index = 0;
    const interval = setInterval(() => {
      setDisplayedText((prev) => prev + text.charAt(index));
      index++;
      if (index >= text.length) {
        clearInterval(interval);
      }
    }, speed);
    return () => clearInterval(interval);
  }, [text, speed]);

  return (
    <span className="font-mono border-r-2 border-white/60 pr-0.5 animate-pulse">
      {displayedText}
    </span>
  );
}

// 9. HyperText
export function HyperText({ text }: { text: string }) {
  const [displayedText, setDisplayedText] = useState(text);
  const alphabets = "АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯABCDEFGHIJKLMNOPQRSTUVWXYZ";

  useEffect(() => {
    let iteration = 0;
    const interval = setInterval(() => {
      setDisplayedText((prev) =>
        text
          .split("")
          .map((char, index) => {
            if (char === " ") return " ";
            if (index < iteration) {
              return text[index];
            }
            return alphabets[Math.floor(Math.random() * alphabets.length)];
          })
          .join("")
      );

      iteration += 1 / 3;
      if (iteration >= text.length) {
        clearInterval(interval);
        setDisplayedText(text);
      }
    }, 40);

    return () => clearInterval(interval);
  }, [text]);

  return <span className="font-mono font-bold tracking-wider">{displayedText}</span>;
}

// 10. WordRotate
export function WordRotate({ words, duration = 2500 }: { words: string[]; duration?: number }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setIndex((prev) => (prev + 1) % words.length);
    }, duration);
    return () => clearInterval(interval);
  }, [words, duration]);

  return (
    <div className="overflow-hidden h-7 flex items-center justify-center">
      <span
        key={index}
        className="font-bold text-lg animate-rotate-word text-violet-400 block"
      >
        {words[index]}
      </span>
      <style>{`
        @keyframes rotate-word {
          0% { transform: translateY(100%); opacity: 0; }
          10% { transform: translateY(0); opacity: 1; }
          90% { transform: translateY(0); opacity: 1; }
          100% { transform: translateY(-100%); opacity: 0; }
        }
        .animate-rotate-word {
          animation: rotate-word 2.5s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}

// 11. SparklesText
export function SparklesText({ children }: { children: string }) {
  return (
    <span className="relative inline-block font-extrabold text-2xl tracking-wider text-yellow-300">
      {children}
      <span className="absolute -top-3 -left-3 animate-ping w-2.5 h-2.5 rounded-full bg-yellow-300 opacity-60" />
      <span className="absolute -bottom-3 -right-3 animate-bounce w-3 h-3 text-yellow-300">✨</span>
    </span>
  );
}
