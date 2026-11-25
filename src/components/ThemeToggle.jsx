import React from 'react';
import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

export default function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('qb-theme');
    const preferred = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark = saved ? saved === 'dark' : preferred;
    setDark(isDark);
    document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.dataset.theme = next ? 'dark' : 'light';
    localStorage.setItem('qb-theme', next ? 'dark' : 'light');
  }

  return (
    <button type="button" className="qb-icon-btn" onClick={toggle} aria-label={dark ? 'الوضع النهاري' : 'الوضع الليلي'} title={dark ? 'الوضع النهاري' : 'الوضع الليلي'}>
      {dark ? <Sun size={18} strokeWidth={1.8} /> : <Moon size={18} strokeWidth={1.8} />}
    </button>
  );
}
