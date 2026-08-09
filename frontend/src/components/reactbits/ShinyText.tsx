'use client';
import React from 'react';

interface ShinyTextProps {
  text: string;
  speed?: number;
  className?: string;
  color?: string;
  fontSize?: number;
}

export const ShinyText: React.FC<ShinyTextProps> = ({
  text,
  speed = 4,
  className = '',
  color = '#FACC15',
  fontSize = 72,
}) => {
  return (
    <div
      className={`inline-block text-transparent bg-clip-text select-none animate-pulse ${className}`}
      style={{
        backgroundImage: `linear-gradient(120deg, ${color} 30%, #FFFFFF 50%, ${color} 70%)`,
        backgroundSize: '200% 100%',
        WebkitBackgroundClip: 'text',
        fontSize: `${fontSize}px`,
        fontWeight: 900,
        lineHeight: 1.1,
        fontFamily: 'Montserrat, Inter, sans-serif',
        filter: 'drop-shadow(0 4px 15px rgba(250, 204, 21, 0.4))',
      }}
    >
      {text}
    </div>
  );
};
