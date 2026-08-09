'use client';
import React, { useEffect, useState } from 'react';

interface CountUpProps {
  to: number;
  from?: number;
  duration?: number;
  suffix?: string;
  prefix?: string;
  color?: string;
  fontSize?: number;
  className?: string;
}

export const CountUp: React.FC<CountUpProps> = ({
  to,
  from = 0,
  duration = 2,
  suffix = '',
  prefix = '',
  color = '#FACC15',
  fontSize = 90,
  className = '',
}) => {
  const [count, setCount] = useState(from);

  useEffect(() => {
    let startTimestamp: number | null = null;
    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / (duration * 1000), 1);
      const easeProgress = 1 - Math.pow(1 - progress, 3);
      setCount(Math.floor(from + easeProgress * (to - from)));
      if (progress < 1) {
        window.requestAnimationFrame(step);
      }
    };
    window.requestAnimationFrame(step);
  }, [from, to, duration]);

  return (
    <div
      className={`font-black tracking-tight select-none ${className}`}
      style={{
        color,
        fontSize: `${fontSize}px`,
        fontFamily: 'Montserrat, Inter, sans-serif',
        textShadow: `0 0 30px ${color}66`,
      }}
    >
      {prefix}{count.toLocaleString()}{suffix}
    </div>
  );
};
