'use client';
import React, { useEffect, useState } from 'react';

interface DecryptedTextProps {
  text: string;
  speed?: number;
  characters?: string;
  className?: string;
  color?: string;
  fontSize?: number;
}

export const DecryptedText: React.FC<DecryptedTextProps> = ({
  text,
  speed = 40,
  characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890!@#$%^&*()',
  className = '',
  color = '#00E5FF',
  fontSize = 64,
}) => {
  const [displayText, setDisplayText] = useState(text);

  useEffect(() => {
    let iteration = 0;
    const interval = setInterval(() => {
      setDisplayText(
        text
          .split('')
          .map((char, index) => {
            if (char === ' ') return ' ';
            if (index < iteration) return text[index];
            return characters[Math.floor(Math.random() * characters.length)];
          })
          .join('')
      );

      if (iteration >= text.length) {
        clearInterval(interval);
      }
      iteration += 1 / 2.5;
    }, speed);

    return () => clearInterval(interval);
  }, [text, speed, characters]);

  return (
    <span
      className={`select-none ${className}`}
      style={{
        color,
        fontSize: `${fontSize}px`,
        fontWeight: 800,
        fontFamily: 'Courier New, monospace',
        letterSpacing: '2px',
        textShadow: `0 0 20px ${color}`,
      }}
    >
      {displayText}
    </span>
  );
};
