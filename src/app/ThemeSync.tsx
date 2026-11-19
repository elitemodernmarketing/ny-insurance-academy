import { useEffect } from 'react';
import { useSettings } from '@/db/hooks';

/** Applies theme, contrast, text size and motion settings to <html>, and mirrors them to localStorage for first paint. */
export function ThemeSync() {
  const s = useSettings();
  useEffect(() => {
    const root = document.documentElement;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = s.theme === 'dark' || (s.theme === 'system' && mq.matches);
      root.dataset.theme = dark ? 'dark' : 'light';
    };
    apply();
    if (s.highContrast) root.dataset.contrast = 'high'; else delete root.dataset.contrast;
    if (s.reducedMotion) root.dataset.motion = 'reduced'; else delete root.dataset.motion;
    root.style.fontSize = `${s.textScale * 100}%`;
    try { localStorage.setItem('nyia-theme', JSON.stringify({ theme: s.theme, textScale: s.textScale, highContrast: s.highContrast })); } catch { /* storage may be unavailable */ }
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [s.theme, s.highContrast, s.reducedMotion, s.textScale]);
  return null;
}
