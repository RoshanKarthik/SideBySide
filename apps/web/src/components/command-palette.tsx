import type { QuestionSummary, RoomListItem } from '@sidebyside/shared';
import { useQuery } from '@tanstack/react-query';
import { Command } from 'cmdk';
import {
  BookOpen,
  CirclePlus,
  FilePlus2,
  History,
  LayoutDashboard,
  MoonStar,
  Radio,
  Search,
  Settings,
  Users,
} from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from '@/lib/navigation';
import { Kbd } from '@/components/ui/card';
import { api } from '@/lib/api';
import { useTheme } from '@/lib/theme';

/** Opens with Ctrl+K / Cmd+K anywhere in the signed-in app. */
export function useCommandPalette() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return { open, setOpen };
}

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const { toggle } = useTheme();
  const rooms = useQuery({
    queryKey: ['rooms'],
    queryFn: () => api.json<RoomListItem[]>('/rooms'),
    enabled: open,
  });
  const questions = useQuery({
    queryKey: ['questions'],
    queryFn: () => api.json<QuestionSummary[]>('/questions'),
    enabled: open,
  });

  const run = (action: () => void) => {
    onOpenChange(false);
    action();
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 animate-fade-in bg-black/50 backdrop-blur-[2px]" />
        <DialogPrimitive.Content className="fixed top-[14vh] left-1/2 z-50 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 animate-fade-up overflow-hidden rounded-2xl border bg-popover shadow-2xl shadow-black/40">
          <DialogPrimitive.Title className="sr-only">Search and commands</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Jump to a page, room or question, or run a command.
          </DialogPrimitive.Description>
          <Command loop className="flex flex-col">
            <div className="flex items-center gap-2 border-b px-4">
              <Search className="size-4 text-muted-foreground" />
              <Command.Input
                autoFocus
                placeholder="Search rooms, questions and commands…"
                className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
              <Kbd>Esc</Kbd>
            </div>
            <Command.List className="max-h-[min(60vh,420px)] overflow-y-auto p-2">
              <Command.Empty className="py-10 text-center text-sm text-muted-foreground">
                Nothing found.
              </Command.Empty>
              <Group heading="Go to">
                <Item icon={LayoutDashboard} onSelect={() => run(() => navigate('/dashboard'))}>
                  Dashboard
                </Item>
                <Item icon={BookOpen} onSelect={() => run(() => navigate('/questions'))}>
                  Question bank
                </Item>
                <Item icon={Users} onSelect={() => run(() => navigate('/practice'))}>
                  Practice with a peer
                </Item>
                <Item icon={Settings} onSelect={() => run(() => navigate('/settings'))}>
                  Settings
                </Item>
              </Group>
              <Group heading="Actions">
                <Item
                  icon={CirclePlus}
                  shortcut="N"
                  onSelect={() => run(() => navigate('/dashboard?new=1'))}
                >
                  New interview room
                </Item>
                <Item icon={FilePlus2} onSelect={() => run(() => navigate('/questions/new'))}>
                  New question
                </Item>
                <Item icon={MoonStar} onSelect={() => run(toggle)}>
                  Toggle light / dark
                </Item>
              </Group>
              {rooms.data && rooms.data.length > 0 && (
                <Group heading="Rooms">
                  {rooms.data.slice(0, 30).map((room) => (
                    <Item
                      key={room.id}
                      icon={room.status === 'ended' ? History : Radio}
                      value={`room ${room.title} ${room.id}`}
                      onSelect={() =>
                        run(() =>
                          navigate(
                            room.status === 'ended' ? `/sessions/${room.id}` : `/r/${room.slug}`,
                          ),
                        )
                      }
                    >
                      {room.title}
                      <span className="ml-auto text-xs text-muted-foreground">{room.status}</span>
                    </Item>
                  ))}
                </Group>
              )}
              {questions.data && questions.data.length > 0 && (
                <Group heading="Questions">
                  {questions.data.map((q) => (
                    <Item
                      key={q.id}
                      icon={BookOpen}
                      value={`question ${q.title} ${q.tags.join(' ')} ${q.id}`}
                      onSelect={() => run(() => navigate(`/questions/${q.id}`))}
                    >
                      {q.title}
                      <span className="ml-auto text-xs text-muted-foreground">{q.difficulty}</span>
                    </Item>
                  ))}
                </Group>
              )}
            </Command.List>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function Group({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <Command.Group
      heading={heading}
      className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group-heading]]:uppercase"
    >
      {children}
    </Command.Group>
  );
}

function Item({
  icon: Icon,
  children,
  onSelect,
  value,
  shortcut,
}: {
  icon: React.ComponentType<{ className?: string }>;
  children: ReactNode;
  onSelect: () => void;
  value?: string;
  shortcut?: string;
}) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className="flex h-10 cursor-pointer items-center gap-3 rounded-lg px-2 text-sm data-[selected=true]:bg-muted"
    >
      <Icon className="size-4 text-muted-foreground" />
      <span className="flex min-w-0 flex-1 items-center gap-2 truncate">{children}</span>
      {shortcut && <Kbd>{shortcut}</Kbd>}
    </Command.Item>
  );
}
