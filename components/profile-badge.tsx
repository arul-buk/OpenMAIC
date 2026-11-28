'use client';

import { LogOut, UserRound } from 'lucide-react';
import { useActiveProfile } from '@/components/access-code-guard';
import { cn } from '@/lib/utils';

interface ProfileBadgeProps {
  className?: string;
}

export function ProfileBadge({ className }: ProfileBadgeProps) {
  const { profile, profilesEnabled, switchProfile } = useActiveProfile();

  if (!profilesEnabled || !profile) return null;

  return (
    <div
      data-testid="active-profile-badge"
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background/80 backdrop-blur-sm pl-2.5 pr-1 py-1 text-xs shadow-xs',
        className,
      )}
    >
      <UserRound className="size-3.5 text-violet-600 dark:text-violet-400 shrink-0" />
      <span className="font-semibold text-foreground max-w-[110px] truncate">
        {profile.name}
      </span>
      <button
        type="button"
        onClick={() => void switchProfile()}
        title="Switch profile / Sign out"
        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
      >
        <LogOut className="size-3" />
        <span className="hidden sm:inline">Switch</span>
      </button>
    </div>
  );
}
