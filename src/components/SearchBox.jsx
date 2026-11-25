import React from 'react';
import { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';

export default function SearchBox({ placeholder = 'ابحث في المكتبة...' }) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const box = useRef(null);

  async function load() {
    if (data) return data;
    const res = await fetch('/search.json');
    const json = await res.json();
    setData(json);
    return json;
  }

  function filter(value, source) {
    const needle = value.trim().toLowerCase();
    if (!needle) return [];
    return source
      .filter((x) => `${x.title} ${x.summary || ''}`.toLowerCase().includes(needle))
      .slice(0, 7);
  }

  useEffect(() => {
    const initial = new URLSearchParams(window.location.search).get('q');
    if (initial) {
      setQ(initial);
      load().then((d) => setItems(filter(initial, d))).catch(() => {});
    }
    function outside(e) {
      if (box.current && !box.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, []);

  async function change(value) {
    setQ(value);
    if (!value.trim()) { setItems([]); setOpen(false); return; }
    try {
      const d = await load();
      setItems(filter(value, d));
      setOpen(true);
    } catch { setItems([]); }
  }

  return (
    <div className="qb-search" ref={box}>
      <Search size={17} aria-hidden="true" />
      <input
        type="search"
        value={q}
        placeholder={placeholder}
        aria-label="البحث في الموقع"
        onFocus={() => q && setOpen(true)}
        onChange={(e) => change(e.target.value)}
      />
      {q && <button type="button" className="qb-search-clear" onClick={() => change('')} aria-label="مسح البحث"><X size={14} /></button>}
      {open && (
        <div className="qb-search-results" role="listbox">
          {items.length ? items.map((x) => (
            <a key={x.path} href={x.path} role="option" aria-selected="false">
              <strong>{x.title}</strong>
              {x.summary && <small>{x.summary.slice(0, 90)}</small>}
            </a>
          )) : <p className="qb-search-empty">لا توجد نتائج مطابقة</p>}
        </div>
      )}
    </div>
  );
}
