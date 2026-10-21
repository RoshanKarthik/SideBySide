import { BRAND_LOGO_MAX_CHARS, type Brand } from '@sidebyside/shared';
import { ImageUp, X } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { BrandMark, brandStyle } from '@/components/brand';
import { Button } from '@/components/ui/button';
import { ErrorNote, Spinner } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/form';
import { toast } from '@/components/ui/toaster';
import { useUpdateMe } from '@/lib/use-me';

const SWATCHES = [
  '#4f46e5',
  '#2563eb',
  '#0f766e',
  '#16a34a',
  '#c2410c',
  '#be123c',
  '#7c3aed',
  '#111827',
];
const LOGO_SIZE = 160;

/** Resizes an uploaded image to fit a 160 px square and returns it as a WebP or PNG data URL. */
async function resizeLogo(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, LOGO_SIZE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const webp = canvas.toDataURL('image/webp', 0.9);
  return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/png');
}

/** Company name, logo and colour shown to candidates on join pages and in rooms. */
export function BrandForm({ brand }: { brand: Brand }) {
  const update = useUpdateMe();
  const [name, setName] = useState(brand.companyName ?? '');
  const [logo, setLogo] = useState(brand.logo);
  const [color, setColor] = useState(brand.color);
  const [error, setError] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  const draft: Brand = { companyName: name.trim() || null, logo, color };
  const dirty =
    draft.companyName !== brand.companyName ||
    draft.logo !== brand.logo ||
    draft.color !== brand.color;

  async function pick(f: File | undefined) {
    if (!f) return;
    setError(null);
    if (!/^image\/(png|jpeg|webp|gif|bmp)$/.test(f.type)) {
      setError('Choose a PNG, JPEG or WebP image.');
      return;
    }
    try {
      const url = await resizeLogo(f);
      if (url.length > BRAND_LOGO_MAX_CHARS)
        setError('That image is too detailed; try a simpler logo.');
      else setLogo(url);
    } catch {
      setError('Could not read that image.');
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    update.mutate({ brand: draft }, { onSuccess: () => toast.success('Branding saved') });
  }

  return (
    <form onSubmit={submit} className="grid gap-6 md:grid-cols-[1fr_16rem]">
      <div className="space-y-5">
        <Field
          label="Company name"
          htmlFor="company-name"
          hint="Shown to candidates instead of SideBySide."
        >
          <Input
            id="company-name"
            value={name}
            maxLength={80}
            placeholder="Northwind Labs"
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <div className="space-y-1.5">
          <p className="text-[13px] font-medium">Logo</p>
          <div className="flex items-center gap-3">
            <span className="flex size-12 items-center justify-center overflow-hidden rounded-lg border bg-muted/50">
              {logo ? (
                <img src={logo} alt="Company logo" className="size-full object-contain" />
              ) : (
                <ImageUp className="size-5 text-muted-foreground" />
              )}
            </span>
            <Button type="button" variant="outline" size="sm" onClick={() => file.current?.click()}>
              Upload
            </Button>
            {logo && (
              <Button type="button" variant="ghost" size="sm" onClick={() => setLogo(null)}>
                <X /> Remove
              </Button>
            )}
            <input
              ref={file}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              aria-label="Upload a logo"
              onChange={(e) => {
                void pick(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Square images work best. Resized to 160 px.
          </p>
        </div>
        <div className="space-y-1.5">
          <p className="text-[13px] font-medium">Accent colour</p>
          <div className="flex flex-wrap items-center gap-2">
            {SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Use ${c}`}
                aria-pressed={color === c}
                onClick={() => setColor(c)}
                className="size-7 rounded-full ring-offset-2 ring-offset-card transition-shadow aria-pressed:ring-2 aria-pressed:ring-foreground"
                style={{ background: c }}
              />
            ))}
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <input
                type="color"
                value={color ?? '#4f46e5'}
                onChange={(e) => setColor(e.target.value)}
                className="size-7 cursor-pointer rounded border bg-transparent"
                aria-label="Custom colour"
              />
              Custom
            </label>
            {color && (
              <Button type="button" variant="ghost" size="sm" onClick={() => setColor(null)}>
                Default
              </Button>
            )}
          </div>
        </div>
        {(error || update.error) && <ErrorNote>{error ?? update.error?.message}</ErrorNote>}
        <Button type="submit" disabled={!dirty || update.isPending}>
          {update.isPending && <Spinner />} Save branding
        </Button>
      </div>

      <div>
        <p className="mb-1.5 text-[13px] font-medium">Preview</p>
        <div className="rounded-xl border bg-background p-4 shadow-card" style={brandStyle(draft)}>
          <BrandMark brand={draft} />
          <p className="mt-4 text-sm font-medium">Frontend engineer interview</p>
          <p className="text-xs text-muted-foreground">Your candidate sees this when they join.</p>
          <span className="mt-4 flex h-8 items-center justify-center rounded-md bg-primary text-xs font-medium text-primary-foreground">
            Join interview
          </span>
        </div>
      </div>
    </form>
  );
}
