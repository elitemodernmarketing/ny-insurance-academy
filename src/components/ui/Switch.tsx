import * as S from '@radix-ui/react-switch';
import { useId } from 'react';

export function Switch({ checked, onCheckedChange, label, description }: { checked: boolean; onCheckedChange: (v: boolean) => void; label: string; description?: string }) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <label htmlFor={id} className="cursor-pointer">
        <span className="block text-sm font-medium">{label}</span>
        {description && <span className="block text-sm text-muted">{description}</span>}
      </label>
      <S.Root id={id} checked={checked} onCheckedChange={onCheckedChange} className="relative mt-0.5 h-6 w-11 shrink-0 rounded-full bg-border transition-colors data-[state=checked]:bg-primary">
        <S.Thumb className="block h-5 w-5 translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[22px]" />
      </S.Root>
    </div>
  );
}
