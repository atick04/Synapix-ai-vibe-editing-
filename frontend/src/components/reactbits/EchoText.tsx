'use client';
import React from 'react';
import { motion } from 'framer-motion';

interface EchoTextProps {
  text: string;
  color?: string;
  fontSize?: number;
  echoesCount?: number;
  className?: string;
}

export const EchoText: React.FC<EchoTextProps> = ({
  text,
  color = '#A855F7',
  fontSize = 72,
  echoesCount = 3,
  className = '',
}) => {
  const echoes = Array.from({ length: echoesCount });

  return (
    <div className={`relative inline-block text-center font-extrabold select-none ${className}`}>
      {echoes.map((_, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0, scale: 0.9, y: 0 }}
          animate={{ opacity: [0.6 / (i + 1), 0], scale: [1 + (i + 1) * 0.08, 1.4], y: [0, -15 * (i + 1)] }}
          transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2, ease: 'easeOut' }}
          className="absolute inset-0 pointer-events-none"
          style={{
            color,
            fontSize: `${fontSize}px`,
            fontFamily: 'Montserrat, Inter, sans-serif',
            filter: `blur(${ (i + 1) * 4 }px)`,
          }}
        >
          {text}
        </motion.span>
      ))}
      <span
        className="relative z-10 text-white"
        style={{
          fontSize: `${fontSize}px`,
          fontWeight: 900,
          fontFamily: 'Montserrat, Inter, sans-serif',
          textShadow: `0 0 25px ${color}`,
        }}
      >
        {text}
      </span>
    </div>
  );
};
