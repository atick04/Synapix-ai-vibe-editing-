import React, { useEffect, useState } from "react";

export function Confetti() {
  const [pieces, setPieces] = useState<any[]>([]);

  useEffect(() => {
    const newPieces = [...new Array(50)].map(() => ({
      x: Math.random() * 100,
      y: Math.random() * 20 - 10,
      rotation: Math.random() * 360,
      color: ["#FF007F", "#00E5FF", "#EC4899", "#10B981", "#F59E0B"][Math.floor(Math.random() * 5)],
      size: Math.random() * 6 + 4,
      delay: Math.random() * 2,
    }));
    setPieces(newPieces);
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none w-full h-full">
      {pieces.map((p, idx) => (
        <div
          key={idx}
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: `${p.size}px`,
            height: `${p.size * 2}px`,
            backgroundColor: p.color,
            transform: `rotate(${p.rotation}deg)`,
            animation: `confetti-fall 3s linear infinite`,
            animationDelay: `${p.delay}s`,
          }}
          className="absolute rounded-sm opacity-80"
        />
      ))}
      <style>{`
        @keyframes confetti-fall {
          0% {
            transform: translateY(0) rotate(0deg);
          }
          100% {
            transform: translateY(110vh) rotate(720deg);
          }
        }
      `}</style>
    </div>
  );
}
