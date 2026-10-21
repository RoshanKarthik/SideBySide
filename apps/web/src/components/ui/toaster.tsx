import { Toaster as Sonner } from 'sonner';
import { useCurrentTheme } from '@/lib/theme';

export { toast } from 'sonner';

export function Toaster() {
  const theme = useCurrentTheme();
  return (
    <Sonner
      theme={theme}
      position="bottom-right"
      closeButton
      toastOptions={{
        classNames: {
          toast: '!rounded-xl !border !border-border !bg-popover !text-foreground !shadow-xl',
          description: '!text-muted-foreground',
        },
      }}
    />
  );
}
