import React from "react";

export function BlurFade({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  return (
    <div
      style={{
        animation: `blur-fade-in 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards`,
        animationDelay: `${delay}s`,
      }}
      className="opacity-0 filter blur-md w-full h-full"
    >
      {children}
      <style>{`
        @keyframes blur-fade-in {
          0% {
            opacity: 0;
            filter: blur(10px);
            transform: translateY(8px);
          }
          100% {
            opacity: 1;
            filter: blur(0px);
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
