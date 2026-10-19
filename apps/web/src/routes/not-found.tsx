import { Link } from 'react-router';
import { AppShell } from '@/components/layout';
import { Button } from '@/components/ui/button';

export function NotFoundPage({ message = 'This page does not exist.' }: { message?: string }) {
  return (
    <AppShell>
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="text-2xl font-bold">Not found</h1>
        <p className="mt-2 text-muted-foreground">{message}</p>
        <Button className="mt-6" variant="outline" asChild>
          <Link to="/">Go home</Link>
        </Button>
      </div>
    </AppShell>
  );
}
