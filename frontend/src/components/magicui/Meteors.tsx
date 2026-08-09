import React, { useEffect, useState } from "react";

export function Meteors({ number = 20 }: { number?: number }) {
  const [meteorStyles, setMeteorStyles] = useState<any[]>([]);

  useEffect(() => {
    const styles = [...new Array(number)].map(() => ({
      top: "-5px",
      left: Math.floor(Math.random() * 100) + "%",
      delay: Math.random() * 1 + 0.2 + "s",
      duration: Math.floor(Math.random() * 6 + 2) + "s",
    }));
    setMeteorStyles(styles);
  }, [number]);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none w-full h-full">
      {meteorStyles.map((style, idx) => (
        <span
          key={idx}
          style={{
            top: style.top,
            left: style.left,
            animationDelay: style.delay,
            animationDuration: style.duration,
          }}
          className="absolute h-0.5 w-0.5 rounded-[9999px] bg-slate-500 shadow-[0_0_0_1px_#ffffff10] rotate-[215deg] animate-meteor"
        />
      ))}
      <style>{`
        @keyframes meteor {
          0% {
            transform: rotate(215deg) translateX(0);
            opacity: 1;
          }
          70% {
            opacity: 1;
          }
          100% {
            transform: rotate(215deg) translateX(-500px);
            opacity: 0;
          }
        }
        .animate-meteor {
          animation: meteor linear infinite;
          background: linear-gradient(90deg, #fff, transparent);
        }
      `}</style>
    </div>
  );
}
