'use client';
import React from 'react';

interface GradientTextProps {
  text: string;
  colors?: string[];
  animationSpeed?: number;
  className?: string;
  fontSize?: number;
}

export const GradientText: React.FC<GradientTextProps> = ({
  text,
  colors = ['#6366F1', '#a855f7', '#ec4899', '#6366F1'],
  animationSpeed = 4,
  className = '',
  fontSize = 72,
}) => {
  const gradientString = `linear-gradient(90deg, ${colors.join(', ')})`;

  return (
    <div
      className={`inline-block text-transparent bg-clip-text select-none animate-pulse ${className}`}
      style={{
        backgroundImage: gradientString,
        backgroundSize: '300% 100%',
        WebkitBackgroundClip: 'text',
        fontSize: `${fontSize}px`,
        fontWeight: 900,
        lineHeight: 1.1,
        fontFamily: 'Montserrat, Inter, sans-serif',
        filter: 'drop-shadow(0 4px 20px rgba(99, 102, 241, 0.4))',
      }}
    >
      {text}
    </div>
  );
};
