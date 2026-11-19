import { useEffect, useRef, useState, type ReactNode } from 'react';
import { content } from '@/content';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Menu, X, Minimize2, Keyboard, WifiOff } from 'lucide-react';
import { NAV } from './nav';
import { cn } from '@/components/ui/cn';
import { useSettings } from '@/db/hooks';
import { updateSettings } from '@/db/repo';
import { Dialog } from '@/components/ui/Dialog';
import { Kbd } from '@/components/ui/misc';

function useOnline() {
  const [on, setOn] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const u = () => setOn(navigator.onLine);
    window.addEventListener('online', u); window.addEventListener('offline', u);
    return () => { window.removeEventListener('online', u); window.removeEventListener('offline', u); };
  }, []);
  return on;
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <ul className="space-y-0.5">
      {NAV.map((n) => (
        <li key={n.to}>
          <NavLink
            to={n.to}
            end={n.to === '/'}
            onClick={onNavigate}
            className={({ isActive }) => cn('flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors', isActive ? 'bg-primary/10 text-primary' : 'text-muted hover:bg-surface-2 hover:text-fg')}
          >
            <n.icon className="h-4 w-4 shrink-0" aria-hidden />
            <span className="truncate">{n.label}</span>
          </NavLink>
        </li>
      ))}
    </ul>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const settings = useSettings();
  const [open, setOpen] = useState(false);
  const [help, setHelp] = useState(false);
  const loc = useLocation();
  const nav = useNavigate();
  const online = useOnline();
  const mainRef = useRef<HTMLElement>(null);
  const focus = settings.focusMode;

  useEffect(() => { setOpen(false); mainRef.current?.focus({ preventScroll: true }); window.scrollTo(0, 0); }, [loc.pathname]);

  // Global shortcuts: "g" then a key navigates; "?" opens help.
  useEffect(() => {
    let pendingG = 0;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '?') { e.preventDefault(); setHelp(true); return; }
      if (e.key === 'g') { pendingG = Date.now(); return; }
      if (pendingG && Date.now() - pendingG < 1200) {
        const item = NAV.find((n) => n.key === e.key);
        pendingG = 0;
        if (item) { e.preventDefault(); nav(item.to); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [nav]);

  return (
    <div className="min-h-screen">
      <a href="#main" className="sr-only-focusable fixed left-2 top-2 z-[60] rounded bg-primary px-3 py-2 text-primary-fg">Skip to content</a>
      {!focus && (
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-border bg-surface lg:flex" aria-label="Main navigation">
          <div className="flex items-center gap-2 px-4 py-4">
            <img src={`${import.meta.env.BASE_URL}icons/icon.svg`} alt="" className="h-8 w-8" />
            <div className="leading-tight">
              <div className="text-sm font-bold">NY Insurance</div>
              <div className="text-xs text-muted">Licensing Academy · {content.manifest.series}</div>
            </div>
          </div>
          <nav className="flex-1 overflow-y-auto px-3 pb-4"><NavList /></nav>
          <div className="border-t border-border p-3 text-xs text-muted">
            <button className="inline-flex items-center gap-1 hover:text-fg" onClick={() => setHelp(true)}><Keyboard className="h-3.5 w-3.5" aria-hidden />Keyboard shortcuts <Kbd>?</Kbd></button>
          </div>
        </aside>
      )}
      <div className={cn(!focus && 'lg:pl-64')}>
        <header className={cn('sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-border bg-surface/90 px-4 backdrop-blur', !focus && 'lg:hidden')}>
          {!focus && (
            <button className="rounded-md p-2 hover:bg-surface-2" aria-label="Open navigation" aria-expanded={open} onClick={() => setOpen(true)}><Menu className="h-5 w-5" aria-hidden /></button>
          )}
          <span className="font-semibold">NY Insurance Licensing Academy</span>
          {focus && (
            <button className="ml-auto inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-sm hover:bg-surface-2" onClick={() => updateSettings({ focusMode: false })}>
              <Minimize2 className="h-4 w-4" aria-hidden />Exit focus mode
            </button>
          )}
        </header>
        {!online && (
          <div className="flex items-center gap-2 border-b border-border bg-info/10 px-4 py-1.5 text-sm text-info" role="status">
            <WifiOff className="h-4 w-4" aria-hidden />Offline — everything still works; progress is saved on this device.
          </div>
        )}
        <main id="main" ref={mainRef} tabIndex={-1} className="mx-auto w-full max-w-6xl px-4 py-6 focus:outline-none sm:px-6 lg:py-8">
          {children}
        </main>
      </div>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-surface shadow-xl animate-fade-in">
            <div className="flex items-center justify-between p-4">
              <span className="font-semibold">Menu</span>
              <button className="rounded-md p-2 hover:bg-surface-2" aria-label="Close navigation" onClick={() => setOpen(false)}><X className="h-5 w-5" aria-hidden /></button>
            </div>
            <nav className="flex-1 overflow-y-auto px-3 pb-4"><NavList onNavigate={() => setOpen(false)} /></nav>
          </div>
        </div>
      )}

      <Dialog open={help} onOpenChange={setHelp} title="Keyboard shortcuts">
        <ul className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          {NAV.map((n) => <li key={n.to} className="flex justify-between gap-2"><span>{n.label}</span><span><Kbd>g</Kbd> <Kbd>{n.key}</Kbd></span></li>)}
          <li className="flex justify-between gap-2"><span>Answer choice</span><span><Kbd>1</Kbd>–<Kbd>4</Kbd> or <Kbd>A</Kbd>–<Kbd>D</Kbd></span></li>
          <li className="flex justify-between gap-2"><span>Flip flashcard</span><Kbd>Space</Kbd></li>
          <li className="flex justify-between gap-2"><span>Next / previous</span><span><Kbd>→</Kbd> <Kbd>←</Kbd></span></li>
          <li className="flex justify-between gap-2"><span>This help</span><Kbd>?</Kbd></li>
        </ul>
      </Dialog>
    </div>
  );
}
