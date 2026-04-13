'use client';

import { usePresence, type PresenceUser } from '@/hooks/use-presence';

const MAX_VISIBLE = 5;

const AVATAR_COLORS = [
  '#7c3aed',
  '#2563eb',
  '#059669',
  '#d97706',
  '#dc2626',
  '#0891b2',
  '#9333ea',
  '#ea580c',
];

function hashColor(userId: string): string {
  let h = 0;
  for (let i = 0; i < userId.length; i++) {
    h = ((h * 31) + userId.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function getInitials(displayName: string | null, email: string): string {
  const src = (displayName ?? email).trim();
  const parts = src.split(/\s+/).filter(Boolean).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
}

function AvatarImage({
  user,
  ownRing = false,
}: {
  user: Pick<PresenceUser, 'user_id' | 'email' | 'display_name' | 'avatar_url'>;
  ownRing?: boolean;
}) {
  const ringClass = ownRing
    ? 'ring-2 ring-green-500'
    : 'ring-2 ring-[var(--panel)]';
  const label = user.display_name ?? user.email;

  if (user.avatar_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={user.avatar_url}
        alt={label}
        className={`h-8 w-8 rounded-full object-cover ${ringClass}`}
      />
    );
  }

  return (
    <div
      className={`flex h-8 w-8 items-center justify-center rounded-full text-[10px] font-bold text-white ${ringClass}`}
      style={{ backgroundColor: hashColor(user.user_id) }}
    >
      {getInitials(user.display_name, user.email)}
    </div>
  );
}

export function PresenceBar() {
  const { onlineUsers, currentUser, isLoading } = usePresence();

  if (isLoading || (!currentUser && onlineUsers.length === 0)) return null;

  const visible = onlineUsers.slice(0, MAX_VISIBLE);
  const overflow = onlineUsers.length - MAX_VISIBLE;
  const hasOthers = visible.length > 0 || overflow > 0;

  return (
    <div className="flex items-center">
      {visible.map((user, i) => (
        <div
          key={user.user_id}
          className="group/avatar relative cursor-default"
          style={{
            marginLeft: i === 0 ? 0 : '-8px',
            zIndex: visible.length - i + (overflow > 0 ? 1 : 0) + (currentUser ? 1 : 0),
          }}
        >
          <AvatarImage user={user} />

          {/* Status dot */}
          <span
            className={[
              'absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-[1.5px] ring-[var(--panel)]',
              user.status === 'active' ? 'bg-green-500' : 'bg-yellow-400',
            ].join(' ')}
          />

          {/* Hover tooltip */}
          <div
            className="pointer-events-none absolute left-1/2 top-full mt-2 -translate-x-1/2 whitespace-nowrap rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-xs shadow-xl opacity-0 transition-opacity duration-150 group-hover/avatar:opacity-100"
            style={{ zIndex: 9999 }}
          >
            <div className="font-semibold dark:text-white text-[var(--text)]">
              {user.display_name ?? user.email}
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 dark:text-white/55 text-[var(--text)]/60">
              <span
                className={[
                  'h-1.5 w-1.5 rounded-full',
                  user.status === 'active' ? 'bg-green-500' : 'bg-yellow-400',
                ].join(' ')}
              />
              {user.current_module}
            </div>
          </div>
        </div>
      ))}

      {overflow > 0 && (
        <div
          className="flex h-8 w-8 items-center justify-center rounded-full text-[10px] font-bold ring-2 ring-[var(--panel)] dark:bg-white/10 bg-[var(--border)] dark:text-white/60 text-[var(--text)]/60"
          style={{
            marginLeft: visible.length > 0 ? '-8px' : 0,
            zIndex: currentUser ? 1 : 0,
          }}
        >
          +{overflow}
        </div>
      )}

      {currentUser && (
        <div
          className="relative"
          style={{ marginLeft: hasOthers ? '-8px' : 0, zIndex: 0 }}
        >
          <AvatarImage user={currentUser} ownRing />
        </div>
      )}
    </div>
  );
}
