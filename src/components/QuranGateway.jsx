import React, { useEffect, useRef, useState } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { Download, Volume2 } from 'lucide-react';

const LANGUAGES = [
  { id: 'en', label: 'English', field: 'en' },
  { id: 'fr', label: 'Français', field: 'fr' },
  { id: 'de', label: 'Deutsch', field: 'de' },
];

const pad = (n) => String(n).padStart(3, '0');

/** يعرض بيانات إضافة Quran Gateway الأصلية دون تشغيل كود PHP */
export default function QuranGateway({ surah = 1, limit = 0, initialData = null }) {
  const [data, setData] = useState(initialData);
  const [language, setLanguage] = useState('en');
  const [playing, setPlaying] = useState('');
  const [error, setError] = useState(false);
  const audio = useRef(null);

  useEffect(() => {
    if (initialData) return undefined;
    let alive = true;
    setData(null);
    setError(false);
    setPlaying('');
    fetch(`/quran-gateway/surahs/${Number(surah) || 1}.json`)
      .then((res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.json();
      })
      .then((json) => { if (alive) setData(json); })
      .catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  }, [surah, initialData]);

  function play(src) {
    const el = audio.current;
    if (!el || !src) return;
    if (playing === src && !el.paused) {
      el.pause();
      return;
    }
    el.src = src;
    el.play().then(() => setPlaying(src)).catch(() => setPlaying(''));
  }

  if (error) {
    return <p className="qg-message">تعذّر تحميل الآيات. يُرجى المحاولة مرة أخرى.</p>;
  }
  if (!data) {
    return <p className="qg-message">جارٍ تحميل الآيات...</p>;
  }

  const active = LANGUAGES.find((l) => l.id === language) || LANGUAGES[0];
  const verses = limit ? data.verses.slice(0, limit) : data.verses;

  return (
    <div className="qg-root">
      <audio
        ref={audio}
        preload="none"
        onEnded={() => setPlaying('')}
        onPause={() => setPlaying('')}
      />

      <div className="qg-head">
        <div>
          <strong>الآيات مع الترجمة</strong>
          <span>{data.verses.length} آية · سورة {surah}</span>
        </div>
        <Tabs.Root value={language} onValueChange={setLanguage}>
          <Tabs.List className="qg-lang-tabs" aria-label="لغة الترجمة">
            {LANGUAGES.map((l) => <Tabs.Trigger key={l.id} value={l.id}>{l.label}</Tabs.Trigger>)}
          </Tabs.List>
        </Tabs.Root>
      </div>

      <div className="qg-verses">
        {verses.map((v) => {
          const arSrc = `${data.audio.ar}/${pad(surah)}${pad(v.n)}.mp3`;
          const trSrc = active.id === 'en' ? `${data.audio.en}/${pad(surah)}${pad(v.n)}.mp3` : '';
          return (
            <div className="qg-aya" key={v.n}>
              <div className="qg-aya-ar">
                <button
                  type="button"
                  className={`qg-play ${playing === arSrc ? 'active' : ''}`}
                  onClick={() => play(arSrc)}
                  aria-label={`استمع إلى الآية ${v.n} بالعربية`}
                  title="تلاوة عربية"
                >
                  <Volume2 size={15} />
                </button>
                <span>{v.ar}</span>
                <span className="qg-aya-num">[{v.n}]</span>
              </div>
              <div className="qg-aya-tr" lang={active.id}>
                {v[active.field]}
                {trSrc && (
                  <button
                    type="button"
                    className={`qg-play qg-play-sm ${playing === trSrc ? 'active' : ''}`}
                    onClick={() => play(trSrc)}
                    aria-label={`استمع إلى الآية ${v.n} بالإنجليزية`}
                    title="الترجمة الصوتية"
                  >
                    <Volume2 size={13} />
                  </button>
                )}
              </div>
              <a className="qg-download" href={arSrc} target="_blank" rel="noopener noreferrer" aria-label={`تحميل صوت الآية ${v.n}`}>
                <Download size={12} /> تحميل
              </a>
            </div>
          );
        })}
      </div>

      {limit > 0 && data.verses.length > limit && (
        <p className="qg-more">لعرض كل الآيات افتح سورة {surah} من صفحة المصحف.</p>
      )}
    </div>
  );
}
