'use client';
import React from 'react';

interface GlitchTextProps {
  text: string;
  speed?: number;
  className?: string;
  color?: string;
  fontSize?: number;
}

export const GlitchText: React.FC<GlitchTextProps> = ({
  text,
  className = '',
  color = '#FF0055',
  fontSize = 72,
}) => {
  return (
    <div
      className={`relative inline-block font-extrabold select-none ${className}`}
      style={{
        fontSize: `${fontSize}px`,
        color,
        fontFamily: 'Montserrat, Inter, sans-serif',
        textShadow: `2px 2px #00E5FF, -2px -2px #FF0055`,
      }}
    >
      <span className="relative z-10">{text}</span>
    </div>
  );
};
