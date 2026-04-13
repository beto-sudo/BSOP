'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase-browser';

export type PresenceUser = {
  user_id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  current_path: string;
  current_module: string;
  last_seen_at: string;
  status: 'active' | 'idle' | 'offline';
};

type UserMeta = {
  userId: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
};

function resolveModuleName(pathname: string): string {
  if (pathname.startsWith('/rdb/ventas')) return 'Ventas';
  if (pathname.startsWith('/rdb/cortes')) return 'Cortes';
  if (pathname.startsWith('/rdb/productos')) return 'Productos';
  if (pathname.startsWith('/rdb/inventario')) return 'Inventario';
  if (pathname.startsWith('/rdb/proveedores')) return 'Proveedores';
  if (pathname.startsWith('/rdb/requisiciones')) return 'Requisiciones';
  if (pathname.startsWith('/rdb/ordenes-compra')) return 'Órdenes de Compra';
  if (pathname.startsWith('/rdb/playtomic')) return 'Playtomic';
  if (pathname.startsWith('/rdb')) return 'RDB';
  if (pathname.startsWith('/coda')) return 'Coda';
  if (pathname.startsWith('/travel')) return 'Viajes';
  if (pathname.startsWith('/health')) return 'Salud';
  if (pathname.startsWith('/family')) return 'Familia';
  if (pathname.startsWith('/settings/acceso')) return 'Acceso';
  if (pathname.startsWith('/settings')) return 'Settings';
  return 'Overview';
}

const TWO_MINUTES_MS = 2 * 60 * 1000;

function isOnline(user: PresenceUser): boolean {
  return (
    user.status !== 'offline' &&
    Date.now() - new Date(user.last_seen_at).getTime() < TWO_MINUTES_MS
  );
}

export function usePresence() {
  const pathname = usePathname();
  const [onlineUsers, setOnlineUsers] = useState<PresenceUser[]>([]);
  const [currentUser, setCurrentUser] = useState<PresenceUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Refs to avoid stale closures in async callbacks
  const pathnameRef = useRef(pathname);
  const userMetaRef = useRef<UserMeta | null>(null);

  // Keep pathname ref in sync on every render
  useEffect(() => {
    pathnameRef.current = pathname;
  });

  const isSkipped = pathname === '/login' || pathname.startsWith('/compartir/');

  // Main setup: auth, initial upsert, heartbeat, realtime, window events
  useEffect(() => {
    if (isSkipped) {
      setIsLoading(false);
      return;
    }

    const supabase = createSupabaseBrowserClient();
    // eslint-disable-next-line prefer-const
    let heartbeat: ReturnType<typeof setInterval> | null = null;
    // eslint-disable-next-line prefer-const
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const upsert = async (status: 'active' | 'idle' | 'offline') => {
      const meta = userMetaRef.current;
      if (!meta) return;
      await supabase.from('user_presence').upsert(
        {
          user_id: meta.userId,
          email: meta.email,
          display_name: meta.displayName,
          avatar_url: meta.avatarUrl,
          current_path: pathnameRef.current,
          current_module: resolveModuleName(pathnameRef.current),
          last_seen_at: new Date().toISOString(),
          status,
        },
        { onConflict: 'user_id' },
      );
    };

    const onBlur = () => void upsert('idle');
    const onFocus = () => void upsert('active');
    const onUnload = () => void upsert('offline');

    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    window.addEventListener('beforeunload', onUnload);

    const init = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setIsLoading(false);
        return;
      }

      userMetaRef.current = {
        userId: user.id,
        email: user.email ?? '',
        displayName:
          (user.user_metadata?.full_name as string | undefined) ??
          (user.user_metadata?.name as string | undefined) ??
          null,
        avatarUrl: (user.user_metadata?.avatar_url as string | undefined) ?? null,
      };

      // Initial upsert
      await upsert('active');

      // Fetch all currently online users
      const cutoff = new Date(Date.now() - TWO_MINUTES_MS).toISOString();
      const { data } = await supabase
        .from('user_presence')
        .select('*')
        .gt('last_seen_at', cutoff)
        .in('status', ['active', 'idle']);

      if (data) {
        const myId = user.id;
        setOnlineUsers((data as PresenceUser[]).filter((u) => u.user_id !== myId));
        const me = (data as PresenceUser[]).find((u) => u.user_id === myId);
        if (me) setCurrentUser(me);
      }

      setIsLoading(false);

      // Heartbeat every 30s
      heartbeat = setInterval(() => void upsert('active'), 30_000);

      // Realtime: listen for presence changes
      channel = supabase
        .channel('presence:global')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'user_presence' },
          (payload) => {
            const myId = userMetaRef.current?.userId;

            if (payload.eventType === 'DELETE') {
              const deletedId = (payload.old as Partial<PresenceUser>).user_id;
              if (!deletedId) return;
              if (deletedId === myId) {
                setCurrentUser(null);
              } else {
                setOnlineUsers((prev) => prev.filter((u) => u.user_id !== deletedId));
              }
              return;
            }

            const record = payload.new as PresenceUser;
            if (record.user_id === myId) {
              setCurrentUser(isOnline(record) ? record : null);
            } else {
              setOnlineUsers((prev) => {
                if (!isOnline(record)) {
                  return prev.filter((u) => u.user_id !== record.user_id);
                }
                const idx = prev.findIndex((u) => u.user_id === record.user_id);
                if (idx >= 0) {
                  const next = [...prev];
                  next[idx] = record;
                  return next;
                }
                return [...prev, record];
              });
            }
          },
        )
        .subscribe();
    };

    void init();

    return () => {
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('beforeunload', onUnload);
      if (heartbeat) clearInterval(heartbeat);
      if (channel) void supabase.removeChannel(channel);
      void upsert('offline');
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSkipped]);

  // Update path + module in DB whenever the route changes
  useEffect(() => {
    const meta = userMetaRef.current;
    if (isSkipped || !meta) return;

    const supabase = createSupabaseBrowserClient();
    const now = new Date().toISOString();
    const module = resolveModuleName(pathname);

    void supabase
      .from('user_presence')
      .update({ current_path: pathname, current_module: module, last_seen_at: now, status: 'active' })
      .eq('user_id', meta.userId);

    setCurrentUser((prev) =>
      prev
        ? { ...prev, current_path: pathname, current_module: module, last_seen_at: now, status: 'active' }
        : null,
    );
  // isSkipped intentionally omitted — the main effect handles cleanup when it changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  return { onlineUsers, currentUser, isLoading };
}
