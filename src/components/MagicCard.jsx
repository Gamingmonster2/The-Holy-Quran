import React, { useRef } from 'react';

/**
 * بطاقة زجاجية بنمط Magic UI: سطح شفاف مع توهج هادئ يتبع المؤشر.
 * تظهر البطاقة فوراً في HTML دون انتظار ترطيب React، حتى لا تختفي الصور
 * على الأجهزة التي لا تُفعّل فيها مراقبة الظهور.
 */
export default function MagicCard({ title, href, cover, summary, date }) {
  const ref = useRef(null);

  const onMove = (event) => {
    if (!ref.current) return;
    const box = ref.current.getBoundingClientRect();
    ref.current.style.setProperty('--mx', `${event.clientX - box.left}px`);
    ref.current.style.setProperty('--my', `${event.clientY - box.top}px`);
  };

  return (
    <a
      ref={ref}
      href={href}
      className="qb-glass-card"
      onPointerMove={onMove}
    >
      <span className="qb-glass-card__spot" aria-hidden="true" />
      <span className="qb-glass-card__media">
        <img src={cover} alt="" loading="eager" decoding="async" />
      </span>
      <span className="qb-glass-card__body">
        <span className="qb-glass-card__title">{title}</span>
        {summary && <span className="qb-glass-card__summary">{summary}</span>}
        <span className="qb-glass-card__meta">
          <span>{date}</span>
          <span>قراءة المقال ←</span>
        </span>
      </span>
    </a>
  );
}
