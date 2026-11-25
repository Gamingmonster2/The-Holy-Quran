import React from 'react';

/**
 * تأثير ظهور هادئ جداً مستوحى من Magic UI — BlurFade.
 * يُنفَّذ بـ CSS حتى يظهر المحتوى فوراً حتى لو لم يُرطَّب الـ island،
 * فلا تختفي العناوين أو الصور على أي متصفح.
 */
export default function BlurFade({ children, delay = 0, className = '', as = 'div' }) {
  const Tag = as;
  return (
    <Tag className={`qb-blur-fade ${className}`.trim()} style={{ '--fade-delay': `${Math.min(delay, 1)}s` }}>
      {children}
    </Tag>
  );
}
