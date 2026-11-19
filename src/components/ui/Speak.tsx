import { useEffect, useState } from 'react';
import { Volume2, Square } from 'lucide-react';
import { useSettings } from '@/db/hooks';
import { cn } from './cn';

export function ttsSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
}

export function speak(text: string, rate = 1): void {
  if (!ttsSupported()) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = rate;
  u.lang = 'en-US';
  window.speechSynthesis.speak(u);
}

/** Read-aloud button. Hidden when the browser has no speech synthesis or TTS is disabled in Settings. */
export function SpeakButton({ text, label = 'Read aloud', className }: { text: string; label?: string; className?: string }) {
  const settings = useSettings();
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => () => { if (speaking && ttsSupported()) window.speechSynthesis.cancel(); }, [speaking]);
  if (!ttsSupported() || !settings.ttsEnabled) return null;
  return (
    <button
      type="button"
      className={cn('inline-flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-fg', className)}
      aria-label={speaking ? 'Stop reading' : label}
      title={speaking ? 'Stop reading' : label}
      onClick={() => {
        if (speaking) { window.speechSynthesis.cancel(); setSpeaking(false); return; }
        if (!ttsSupported()) return;
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.rate = settings.ttsRate;
        u.lang = 'en-US';
        u.onend = () => setSpeaking(false);
        u.onerror = () => setSpeaking(false);
        setSpeaking(true);
        window.speechSynthesis.speak(u);
      }}
    >
      {speaking ? <Square className="h-4 w-4" aria-hidden /> : <Volume2 className="h-4 w-4" aria-hidden />}
    </button>
  );
}
