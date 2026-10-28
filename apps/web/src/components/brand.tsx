import type { Brand } from '@sidebyside/shared';
import type { CSSProperties } from 'react';
import { LogoMark } from '@/components/logo';
import { cn, initials } from '@/lib/utils';

/** The company's logo and name when the interviewer set them, otherwise SideBySide's. */
export function BrandMark({
  brand,
  className,
  compact = false,
}: {
  brand: Brand | null;
  className?: string;
  compact?: boolean;
}) {
  if (!brand?.companyName && !brand?.logo) {
    return (
      <span className={cn('flex items-center gap-2 font-semibold tracking-tight', className)}>
        <LogoMark />
        {!compact && 'SideBySide'}
      </span>
    );
  }
  return (
    <span className={cn('flex min-w-0 items-center gap-2 font-semibold', className)}>
      {brand.logo ? (
        <img src={brand.logo} alt="" className="size-7 shrink-0 rounded-md object-contain" />
      ) : (
        <span
          className="flex size-7 shrink-0 items-center justify-center rounded-md text-[11px] font-bold text-white"
          style={{ background: brand.color ?? 'var(--primary)' }}
        >
          {initials(brand.companyName ?? '')}
        </span>
      )}
      {!compact && brand.companyName && <span className="truncate">{brand.companyName}</span>}
    </span>
  );
}

/** Whether white text reads well on this colour (relative luminance below about 0.5). */
function prefersWhiteText(hex: string): boolean {
  const n = parseInt(hex.slice(1), 16);
  const channel = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const l =
    0.2126 * channel((n >> 16) & 255) +
    0.7152 * channel((n >> 8) & 255) +
    0.0722 * channel(n & 255);
  return l < 0.45;
}

/** CSS variables that recolour buttons and accents with the company's colour. */
export function brandStyle(brand: Brand | null): CSSProperties | undefined {
  const color = brand?.color;
  if (!color) return undefined;
  return {
    '--primary': color,
    '--ring': color,
    '--brand-1': color,
    '--primary-foreground': prefersWhiteText(color) ? '#ffffff' : '#111111',
    '--glow': `color-mix(in oklch, ${color} 22%, transparent)`,
  } as CSSProperties;
}
