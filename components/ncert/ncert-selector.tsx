'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  BookMarked,
  Check,
  ChevronDown,
  ChevronRight,
  Layers,
  BookOpen,
  Search,
  X,
} from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { NcertChapter, NcertTopicBucket } from '@/lib/ncert/types';

export interface NcertSelection {
  /** Selected cross-class topic bucket (collection of chapters across Classes 7–12). */
  bucket?: string;
  /** Explicitly selected chapter relative paths (1–3 chapters). */
  chapters: string[];
  /** Human-readable summary label shown in the composer chip. */
  label: string;
}

interface NcertSelectorProps {
  value: NcertSelection | null;
  onChange: (next: NcertSelection | null) => void;
  disabled?: boolean;
  compact?: boolean;
  className?: string;
}

let cachedBuckets: NcertTopicBucket[] | null = null;
let inflightCatalog: Promise<NcertTopicBucket[]> | null = null;

async function fetchNcertBuckets(): Promise<NcertTopicBucket[]> {
  if (cachedBuckets) return cachedBuckets;
  if (!inflightCatalog) {
    inflightCatalog = fetch('/api/ncert/catalog?view=buckets')
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        const data = json?.data ?? json;
        const list = Array.isArray(data?.topicBuckets)
          ? (data.topicBuckets as NcertTopicBucket[])
          : [];
        cachedBuckets = list;
        return list;
      })
      .catch(() => [])
      .finally(() => {
        inflightCatalog = null;
      });
  }
  return inflightCatalog;
}

function classBadgeColor(cls: number): string {
  switch (cls) {
    case 7:
      return 'bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200';
    case 8:
      return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200';
    case 9:
      return 'bg-teal-100 text-teal-800 dark:bg-teal-900/50 dark:text-teal-200';
    case 10:
      return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-200';
    case 11:
      return 'bg-violet-100 text-violet-800 dark:bg-violet-900/50 dark:text-violet-200';
    default:
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200';
  }
}

export function NcertSelector({
  value,
  onChange,
  disabled = false,
  compact = false,
  className,
}: NcertSelectorProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'topics' | 'chapters'>('topics');
  const [buckets, setBuckets] = useState<NcertTopicBucket[]>(cachedBuckets ?? []);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [classFilter, setClassFilter] = useState<number | 'all'>('all');
  const [expandedBucket, setExpandedBucket] = useState<string | null>(null);
  const [draftChapters, setDraftChapters] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    setDraftChapters(value?.chapters ?? []);
    if (buckets.length > 0) return;
    setLoading(true);
    void fetchNcertBuckets().then((list) => {
      setBuckets(list);
      setLoading(false);
    });
  }, [open, buckets.length, value?.chapters]);

  const allChapters = useMemo(() => {
    const seen = new Set<string>();
    const out: NcertChapter[] = [];
    for (const b of buckets) {
      for (const ch of b.chapters) {
        if (!seen.has(ch.relative_path)) {
          seen.add(ch.relative_path);
          out.push(ch);
        }
      }
    }
    return out.sort((a, b) => a.class - b.class || a.chapter_number - b.chapter_number);
  }, [buckets]);

  const chapterByPath = useMemo(() => {
    const map = new Map<string, NcertChapter>();
    for (const ch of allChapters) map.set(ch.relative_path, ch);
    return map;
  }, [allChapters]);

  const queryLower = search.trim().toLowerCase();

  const filteredBuckets = useMemo(() => {
    return buckets.filter((b) => {
      if (classFilter !== 'all' && !b.classes_covered.includes(classFilter)) return false;
      if (!queryLower) return true;
      return (
        b.bucket_name.toLowerCase().includes(queryLower) ||
        b.subject_domain.toLowerCase().includes(queryLower) ||
        b.description.toLowerCase().includes(queryLower) ||
        b.chapters.some(
          (ch) =>
            ch.chapter_title.toLowerCase().includes(queryLower) ||
            ch.secondary_tags.some((t) => t.toLowerCase().includes(queryLower)),
        )
      );
    });
  }, [buckets, classFilter, queryLower]);

  const filteredChapters = useMemo(() => {
    return allChapters.filter((ch) => {
      if (classFilter !== 'all' && ch.class !== classFilter) return false;
      if (!queryLower) return true;
      return (
        ch.chapter_title.toLowerCase().includes(queryLower) ||
        ch.topic_bucket.toLowerCase().includes(queryLower) ||
        ch.subject.toLowerCase().includes(queryLower) ||
        ch.book_title.toLowerCase().includes(queryLower) ||
        ch.secondary_tags.some((t) => t.toLowerCase().includes(queryLower)) ||
        ch.subtopics.some((s) => s.toLowerCase().includes(queryLower))
      );
    });
  }, [allChapters, classFilter, queryLower]);

  const selectTopicBucket = (bucket: NcertTopicBucket) => {
    onChange({
      bucket: bucket.bucket_name,
      chapters: [],
      label: `${bucket.bucket_name} (${bucket.class_progression})`,
    });
    setOpen(false);
  };

  const toggleDraftChapter = (path: string) => {
    setDraftChapters((prev) => {
      if (prev.includes(path)) return prev.filter((p) => p !== path);
      if (prev.length >= 3) return [...prev.slice(1), path];
      return [...prev, path];
    });
  };

  const applyDraftChapters = () => {
    if (draftChapters.length === 0) {
      onChange(null);
      setOpen(false);
      return;
    }
    const labels = draftChapters
      .map((p) => {
        const ch = chapterByPath.get(p);
        return ch ? `Class ${ch.class} · ${ch.chapter_title}` : p.split('/').pop() ?? 'Chapter';
      });
    const label =
      labels.length === 1
        ? labels[0]
        : `${labels[0]} +${labels.length - 1} more`;
    onChange({
      chapters: draftChapters,
      label,
    });
    setOpen(false);
  };

  const selectSingleChapter = (ch: NcertChapter) => {
    onChange({
      chapters: [ch.relative_path],
      label: `Class ${ch.class} ${ch.subject} · Ch. ${ch.chapter_number}: ${ch.chapter_title}`,
    });
    setOpen(false);
  };

  return (
    <>
      <div className={cn('inline-flex items-center gap-1.5 max-w-full', className)}>
        {value ? (
          <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/80 dark:border-emerald-700/70 bg-emerald-50/90 dark:bg-emerald-950/50 pl-2.5 pr-1 py-1 text-xs font-medium text-emerald-800 dark:text-emerald-200 max-w-full">
            <BookMarked className="size-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <button
              type="button"
              disabled={disabled}
              onClick={() => setOpen(true)}
              className="truncate max-w-[220px] sm:max-w-[300px] hover:underline text-left"
              title={`Change NCERT selection: ${value.label}`}
            >
              {value.label}
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChange(null)}
              className="p-0.5 rounded-full hover:bg-emerald-200/70 dark:hover:bg-emerald-800/60 shrink-0"
              aria-label="Clear NCERT selection"
            >
              <X className="size-3" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={disabled}
            onClick={() => setOpen(true)}
            data-testid="ncert-selector-trigger"
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border border-emerald-200/80 dark:border-emerald-800/60 bg-emerald-50/60 dark:bg-emerald-950/30 hover:bg-emerald-100/70 dark:hover:bg-emerald-900/40 text-emerald-800 dark:text-emerald-200 font-medium transition-colors',
              compact ? 'px-2.5 py-1 text-[11px]' : 'px-3 py-1.5 text-xs',
              disabled && 'opacity-50 pointer-events-none',
            )}
          >
            <BookMarked className="size-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>NCERT Topic / Chapter</span>
          </button>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl p-0 gap-0 overflow-hidden rounded-2xl">
          <div className="px-5 pt-5 pb-3 border-b border-border/60 space-y-3">
            <div className="flex items-center justify-between gap-2 pr-6">
              <div className="flex items-center gap-2">
                <div className="size-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
                  <BookMarked className="size-4" />
                </div>
                <div>
                  <DialogTitle className="text-base font-bold">
                    Select NCERT Topic or Chapter
                  </DialogTitle>
                  <p className="text-xs text-muted-foreground">
                    Pick a cross-class topic (collection of chapters) or up to 3 specific chapters
                  </p>
                </div>
              </div>
            </div>

            {/* Tabs + Search */}
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="inline-flex rounded-xl bg-muted p-1 shrink-0 self-start">
                <button
                  type="button"
                  onClick={() => setTab('topics')}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors inline-flex items-center gap-1.5',
                    tab === 'topics'
                      ? 'bg-background text-emerald-700 dark:text-emerald-300 shadow-xs'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Layers className="size-3.5" />
                  Topics (23)
                </button>
                <button
                  type="button"
                  onClick={() => setTab('chapters')}
                  className={cn(
                    'px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors inline-flex items-center gap-1.5',
                    tab === 'chapters'
                      ? 'bg-background text-emerald-700 dark:text-emerald-300 shadow-xs'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <BookOpen className="size-3.5" />
                  Chapters (221)
                </button>
              </div>

              <div className="relative flex-1">
                <Search className="size-3.5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search algebra, optics, motion, alcohols..."
                  className="w-full rounded-xl border border-border bg-muted/40 pl-8 pr-8 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Class Filter Pills */}
            <div className="flex flex-wrap items-center gap-1">
              <button
                type="button"
                onClick={() => setClassFilter('all')}
                className={cn(
                  'px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors',
                  classFilter === 'all'
                    ? 'bg-foreground text-background'
                    : 'bg-muted text-muted-foreground hover:text-foreground',
                )}
              >
                All (7–12)
              </button>
              {[7, 8, 9, 10, 11, 12].map((cls) => (
                <button
                  key={cls}
                  type="button"
                  onClick={() => setClassFilter(cls)}
                  className={cn(
                    'px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors',
                    classFilter === cls
                      ? 'bg-foreground text-background'
                      : 'bg-muted text-muted-foreground hover:text-foreground',
                  )}
                >
                  Class {cls}
                </button>
              ))}
            </div>
          </div>

          {/* Body */}
          <div className="max-h-[55vh] overflow-y-auto p-3 space-y-2 bg-muted/20">
            {loading && (
              <div className="py-10 text-center text-xs text-muted-foreground">
                Loading NCERT catalog...
              </div>
            )}

            {!loading && tab === 'topics' && (
              <>
                {filteredBuckets.length === 0 && (
                  <div className="py-8 text-center text-xs text-muted-foreground">
                    No matching topics found.
                  </div>
                )}
                {filteredBuckets.map((b) => {
                  const isSelected = value?.bucket === b.bucket_name;
                  const isOpen = expandedBucket === b.bucket_name;
                  return (
                    <div
                      key={b.bucket_name}
                      className={cn(
                        'rounded-xl border bg-background overflow-hidden transition-colors',
                        isSelected
                          ? 'border-emerald-500 ring-1 ring-emerald-500/30'
                          : 'border-border/70',
                      )}
                    >
                      <div className="p-3 flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedBucket(isOpen ? null : b.bucket_name)
                          }
                          className="flex items-start gap-2 text-left flex-1 min-w-0"
                        >
                          <span className="mt-0.5 text-muted-foreground shrink-0">
                            {isOpen ? (
                              <ChevronDown className="size-4" />
                            ) : (
                              <ChevronRight className="size-4" />
                            )}
                          </span>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-xs font-bold text-foreground">
                                {b.bucket_name}
                              </span>
                              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                                {b.class_progression}
                              </span>
                              <span className="text-[10px] text-muted-foreground">
                                {b.total_chapters} ch
                              </span>
                            </div>
                            <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">
                              {b.description}
                            </p>
                          </div>
                        </button>

                        <Button
                          type="button"
                          size="sm"
                          variant={isSelected ? 'default' : 'outline'}
                          onClick={() => selectTopicBucket(b)}
                          className={cn(
                            'h-7 px-2.5 text-[11px] rounded-lg shrink-0',
                            isSelected && 'bg-emerald-600 hover:bg-emerald-700 text-white',
                          )}
                        >
                          {isSelected ? 'Selected' : 'Use Topic'}
                        </Button>
                      </div>

                      {isOpen && (
                        <div className="border-t border-border/60 divide-y divide-border/40 bg-muted/20">
                          {b.chapters
                            .filter((ch) => classFilter === 'all' || ch.class === classFilter)
                            .map((ch) => (
                              <div
                                key={ch.relative_path}
                                className="px-4 py-2 flex items-center justify-between gap-2 hover:bg-background/80"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span
                                    className={cn(
                                      'rounded px-1.5 py-0.5 text-[10px] font-bold shrink-0',
                                      classBadgeColor(ch.class),
                                    )}
                                  >
                                    Cl {ch.class}
                                  </span>
                                  <span className="text-xs text-foreground truncate">
                                    Ch. {ch.chapter_number}: {ch.chapter_title}
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => selectSingleChapter(ch)}
                                  className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 hover:underline shrink-0"
                                >
                                  Pick chapter
                                </button>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            )}

            {!loading && tab === 'chapters' && (
              <div className="space-y-1.5">
                {filteredChapters.length === 0 && (
                  <div className="py-8 text-center text-xs text-muted-foreground">
                    No matching chapters found.
                  </div>
                )}
                {filteredChapters.slice(0, 80).map((ch) => {
                  const checked = draftChapters.includes(ch.relative_path);
                  return (
                    <button
                      key={ch.relative_path}
                      type="button"
                      onClick={() => toggleDraftChapter(ch.relative_path)}
                      className={cn(
                        'w-full text-left rounded-xl border p-2.5 flex items-center justify-between gap-2 transition-colors',
                        checked
                          ? 'border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/40'
                          : 'border-border/70 bg-background hover:bg-muted/40',
                      )}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={cn(
                            'size-4 rounded border flex items-center justify-center shrink-0',
                            checked
                              ? 'bg-emerald-600 border-emerald-600 text-white'
                              : 'border-border',
                          )}
                        >
                          {checked && <Check className="size-3" />}
                        </span>
                        <span
                          className={cn(
                            'rounded px-1.5 py-0.5 text-[10px] font-bold shrink-0',
                            classBadgeColor(ch.class),
                          )}
                        >
                          Cl {ch.class}
                        </span>
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-foreground truncate">
                            Ch. {ch.chapter_number}: {ch.chapter_title}
                          </div>
                          <div className="text-[10px] text-muted-foreground truncate">
                            {ch.subject} · {ch.topic_bucket} · {ch.book_title}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer for multi-chapter selection */}
          {tab === 'chapters' && (
            <div className="px-4 py-3 border-t border-border/60 bg-background flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">
                {draftChapters.length} / 3 chapters selected
              </span>
              <div className="flex items-center gap-2">
                {draftChapters.length > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setDraftChapters([])}
                    className="h-8 text-xs"
                  >
                    Clear
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  onClick={applyDraftChapters}
                  className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg"
                >
                  Apply Selection
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
