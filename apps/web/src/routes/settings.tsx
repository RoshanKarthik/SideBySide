import { LANGUAGES, LANGUAGE_INFO, type Lang } from '@sidebyside/shared';
import { useMutation } from '@tanstack/react-query';
import { Download, Gauge, Moon, Palette, Sun, Trash2, UserRound } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { AppShell } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Card, ErrorNote, PageHeader, Skeleton, Spinner } from '@/components/ui/card';
import { Field, Input, Label, NativeSelect, Switch } from '@/components/ui/form';
import { Avatar, Dialog, DialogClose, DialogContent, DialogTrigger } from '@/components/ui/overlay';
import { toast } from '@/components/ui/toaster';
import { api } from '@/lib/api';
import { signOut, useSession } from '@/lib/auth-client';
import { useTheme } from '@/lib/theme';
import { useMe, useUpdateMe } from '@/lib/use-me';
import { cn } from '@/lib/utils';

export default function SettingsPage() {
  const { data: session, isPending } = useSession();
  const me = useMe();
  if (isPending) return null;
  if (!session) return <Navigate to="/login?next=/settings" replace />;

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-8 sm:py-10">
        <PageHeader title="Settings" description="Your profile, preferences and data." />
        {me.isPending && <Skeleton className="mt-8 h-64 rounded-xl" />}
        {me.error && <ErrorNote>{me.error.message}</ErrorNote>}
        {me.data && (
          <div className="mt-8 space-y-6">
            <Section icon={UserRound} title="Profile">
              <ProfileForm
                key={me.data.displayName}
                id={me.data.id}
                name={me.data.displayName}
                email={me.data.email}
                avatar={me.data.avatarUrl}
              />
            </Section>
            <Section icon={Palette} title="Preferences">
              <Preferences
                defaultLanguage={me.data.defaultLanguage}
                lowBandwidth={me.data.lowBandwidth}
              />
            </Section>
            <Section icon={Download} title="Your data">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <p className="max-w-md text-sm text-muted-foreground">
                  Download a JSON copy of your profile, the rooms you own (with events, code runs
                  and rubric), your questions and your practice ratings.
                </p>
                <ExportButton />
              </div>
            </Section>
            <Card className="border-destructive/30 p-6">
              <h2 className="flex items-center gap-2 font-semibold text-destructive">
                <Trash2 className="size-4" /> Delete account
              </h2>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
                <p className="max-w-md text-sm text-muted-foreground">
                  Deletes your account, your questions and the rooms you own with their recordings.
                  Practice sessions stay with your partner. This can’t be undone.
                </p>
                <DeleteAccount email={me.data.email} />
              </div>
            </Card>
          </div>
        )}
      </div>
    </AppShell>
  );
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof UserRound;
  title: string;
  children: ReactNode;
}) {
  return (
    <Card className="p-6">
      <h2 className="mb-5 flex items-center gap-2 font-semibold">
        <Icon className="size-4 text-primary" /> {title}
      </h2>
      {children}
    </Card>
  );
}

function ProfileForm({
  id,
  name,
  email,
  avatar,
}: {
  id: string;
  name: string;
  email: string;
  avatar: string | null;
}) {
  const update = useUpdateMe();
  const [value, setValue] = useState(name);

  function submit(e: FormEvent) {
    e.preventDefault();
    update.mutate(
      { displayName: value.trim() },
      { onSuccess: () => toast.success('Profile saved') },
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-5">
      <Avatar name={value || name} id={id} src={avatar} size={56} />
      <Field label="Display name" htmlFor="display-name" className="min-w-56 flex-1">
        <Input
          id="display-name"
          value={value}
          required
          maxLength={60}
          onChange={(e) => setValue(e.target.value)}
        />
      </Field>
      <Field label="Email" htmlFor="email" className="min-w-56 flex-1">
        <Input id="email" value={email} disabled />
      </Field>
      <Button type="submit" disabled={update.isPending || !value.trim() || value.trim() === name}>
        {update.isPending && <Spinner />} Save
      </Button>
      {update.error && <ErrorNote>{update.error.message}</ErrorNote>}
    </form>
  );
}

function Preferences({
  defaultLanguage,
  lowBandwidth,
}: {
  defaultLanguage: Lang;
  lowBandwidth: boolean;
}) {
  const update = useUpdateMe();
  const { theme, toggle } = useTheme();
  const save = (patch: Parameters<typeof update.mutate>[0]) =>
    update.mutate(patch, { onSuccess: () => toast.success('Preference saved') });

  return (
    <div className="divide-y">
      <Row
        title="Default language"
        hint="Pre-selected when you create a room or join the practice queue."
      >
        <NativeSelect
          aria-label="Default language"
          value={defaultLanguage}
          onChange={(e) => save({ defaultLanguage: e.target.value as Lang })}
        >
          {LANGUAGES.map((l) => (
            <option key={l} value={l}>
              {LANGUAGE_INFO[l].label}
            </option>
          ))}
        </NativeSelect>
      </Row>
      <Row
        title={
          <span className="flex items-center gap-2">
            <Gauge className="size-4 text-muted-foreground" /> Low-bandwidth mode
          </span>
        }
        hint="Hides cursor name labels and sends whiteboard pointers less often. Useful on a slow connection."
      >
        <Switch
          aria-label="Low-bandwidth mode"
          checked={lowBandwidth}
          onCheckedChange={(v) => save({ lowBandwidth: v })}
        />
      </Row>
      <Row title="Theme" hint="Dark is the default.">
        <div className="flex rounded-lg bg-muted p-0.5" role="radiogroup" aria-label="Theme">
          {(['dark', 'light'] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={theme === t}
              onClick={() => theme !== t && toggle()}
              className={cn(
                'flex h-7 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium text-muted-foreground capitalize',
                theme === t && 'bg-background text-foreground shadow-sm',
              )}
            >
              {t === 'dark' ? <Moon className="size-3.5" /> : <Sun className="size-3.5" />}
              {t}
            </button>
          ))}
        </div>
      </Row>
      {update.error && <ErrorNote>{update.error.message}</ErrorNote>}
    </div>
  );
}

function Row({ title, hint, children }: { title: ReactNode; hint: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
      <div className="max-w-md">
        <Label className="text-sm">{title}</Label>
        <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
      </div>
      {children}
    </div>
  );
}

function ExportButton() {
  const exp = useMutation({
    mutationFn: async () => {
      const bytes = await api.bytes('/me/export');
      const url = URL.createObjectURL(
        new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/json' }),
      );
      const a = document.createElement('a');
      a.href = url;
      a.download = `sidebyside-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Button variant="outline" disabled={exp.isPending} onClick={() => exp.mutate()}>
      {exp.isPending ? <Spinner /> : <Download />} Export my data
    </Button>
  );
}

function DeleteAccount({ email }: { email: string }) {
  const navigate = useNavigate();
  const [typed, setTyped] = useState('');
  const remove = useMutation({
    mutationFn: () => api.send('/me', { method: 'DELETE', body: { confirm: typed } }),
    onSuccess: async () => {
      await signOut().catch(() => {});
      toast.success('Your account was deleted');
      navigate('/', { replace: true });
    },
  });
  return (
    <Dialog onOpenChange={() => setTyped('')}>
      <DialogTrigger asChild>
        <Button variant="destructive">Delete account</Button>
      </DialogTrigger>
      <DialogContent
        title="Delete your account?"
        description="Everything you own is deleted permanently. Type your email address to confirm."
      >
        <Input
          className="mt-5"
          aria-label="Your email address"
          placeholder={email}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
        />
        {remove.error && (
          <div className="mt-3">
            <ErrorNote>{remove.error.message}</ErrorNote>
          </div>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          <Button
            variant="destructive"
            disabled={remove.isPending || typed.trim().toLowerCase() !== email.toLowerCase()}
            onClick={() => remove.mutate()}
          >
            {remove.isPending && <Spinner />} Delete forever
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
