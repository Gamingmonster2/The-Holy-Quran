import React from 'react';
import { useMemo, useState } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { BookOpen, Search } from 'lucide-react';
import { juz, riwayat, surahs } from '../data/quran.js';

export default function QuranNavigator() {
  const [query, setQuery] = useState('');
  const [riwaya, setRiwaya] = useState(riwayat[0]);

  const filtered = useMemo(
    () => surahs.filter((s) => s.name.includes(query.trim()) || String(s.number) === query.trim()),
    [query],
  );

  return (
    <div className="qb-navigator">
      <Tabs.Root defaultValue="surah">
        <Tabs.List className="qb-tabs" aria-label="تنقل القرآن">
          <Tabs.Trigger value="surah">السور</Tabs.Trigger>
          <Tabs.Trigger value="juz">الأجزاء</Tabs.Trigger>
          <Tabs.Trigger value="riwayat">الروايات</Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="surah" className="qb-tab-panel">
          <label className="qb-inline-search">
            <Search size={16} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث باسم السورة أو رقمها" aria-label="البحث عن سورة" />
          </label>
          <p className="qb-panel-note">تفتح كل سورة في صفحة مستقلة كاملة للقراءة والاستماع.</p>
          <div className="qb-surah-grid">
            {filtered.map((s) => (
              <a key={s.number} className="qb-surah" href={`/quran/${s.number}/`}>
                <span className="qb-surah-num">{s.number}</span>
                <span>{s.name}</span>
              </a>
            ))}
          </div>
        </Tabs.Content>

        <Tabs.Content value="juz" className="qb-tab-panel">
          <p className="qb-panel-note">اختر الجزء لتبدأ من أول سورة فيه، في صفحة مستقلة.</p>
          <div className="qb-juz-grid">
            {juz.map((j) => (
              <a key={j.number} className="qb-juz" href={`/quran/${(j.number - 1) * 4 + 1}/`}>
                <small>جزء</small><strong>{j.number}</strong>
              </a>
            ))}
          </div>
        </Tabs.Content>

        <Tabs.Content value="riwayat" className="qb-tab-panel">
          <div className="qb-riwayat">
            {riwayat.map((r) => (
              <button type="button" key={r.id} className={`qb-riwaya ${riwaya.id === r.id ? 'active' : ''}`} onClick={() => setRiwaya(r)}>
                <strong>{r.name}</strong><small>{r.detail}</small>
              </button>
            ))}
          </div>
          <p className="qb-panel-note">{riwaya.name} — ابدأ من أي سورة لتقرأ وتستمع في صفحة كاملة.</p>
          <a className="qb-btn qb-btn-primary qb-navigator-cta" href="/quran/">
            <BookOpen size={16} /> افتح المصحف في صفحة مستقلة
          </a>
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
