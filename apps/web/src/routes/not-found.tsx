import { ArrowLeft } from 'lucide-react';
import { Link } from '@/lib/navigation';
import { AppShell } from '@/components/layout';
import { Button } from '@/components/ui/button';

export function NotFoundPage({ message = 'This page does not exist.' }: { message?: string }) {
  return (
    <AppShell>
      <div className="relative isolate mx-auto flex max-w-md flex-col items-center px-4 py-28 text-center">
        <div className="bg-dots mask-radial absolute inset-0 -z-10 opacity-60" />
        <p className="text-gradient font-mono text-7xl font-semibold tracking-tighter">404</p>
        <h1 className="mt-4 text-xl font-semibold">Nothing here</h1>
        <p className="mt-2 text-muted-foreground">{message}</p>
        <Button className="mt-8" variant="outline" asChild>
          <Link to="/">
            <ArrowLeft /> Back home
          </Link>
        </Button>
      </div>
    </AppShell>
  );
}
