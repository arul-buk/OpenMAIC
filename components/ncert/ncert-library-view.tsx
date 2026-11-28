'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  BookMarked,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Compass,
  ExternalLink,
  FileText,
  GraduationCap,
  Layers,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ProfileBadge } from '@/components/profile-badge';
import type { NcertBook, NcertChapter, NcertTopicBucket } from '@/lib/ncert/types';

interface NcertLibraryViewProps {
  summary: {
    totalBooks: number;
    totalChapters: number;
    totalPdfs: number;
    totalTopicBuckets: number;
    classesCovered: number[];
    subjectsCovered: string[];
  };
  topicBuckets: NcertTopicBucket[];
  books: NcertBook[];
}

function pdfHref(relativePath: string): string {
  return `/api/ncert/pdf?path=${encodeURIComponent(relativePath)}`;
}

function helpMeLearnChapterHref(ch: NcertChapter): string {
  const params = new URLSearchParams({
    chapter: ch.relative_path,
    topic: `${ch.chapter_title} (NCERT Class ${ch.class} ${ch.subject})`,
    label: `Class ${ch.class} ${ch.subject} · Ch. ${ch.chapter_number}: ${ch.chapter_title}`,
  });
  return `/help-me-learn?${params.toString()}`;
}

function helpMeLearnBucketHref(bucket: NcertTopicBucket): string {
  const params = new URLSearchParams({
    bucket: bucket.bucket_name,
    topic: `${bucket.bucket_name} (${bucket.class_progression})`,
    label: `${bucket.bucket_name} (${bucket.class_progression})`,
  });
  return `/help-me-learn?${params.toString()}`;
}

function classroomChapterHref(ch: NcertChapter): string {
  const params = new URLSearchParams({
    ncertChapter: ch.relative_path,
  });
  return `/?${params.toString()}`;
}

function classBadgeStyle(cls: number): string {
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

function domainBadgeStyle(domain: string): string {
  const d = domain.toLowerCase();
  if (d.includes('math')) return 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800/60';
  if (d.includes('phys')) return 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800/60';
  if (d.includes('chem')) return 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60';
  return 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60';
}

export function NcertLibraryView({ summary, topicBuckets, books }: NcertLibraryViewProps) {
  const [viewMode, setViewMode] = useState<'topics' | 'books'>('topics');
  const [search, setSearch] = useState('');
  const [domainFilter, setDomainFilter] = useState<string>('All');
  const [classFilter, setClassFilter] = useState<number | 'all'>('all');
  const [expandedBuckets, setExpandedBuckets] = useState<Record<string, boolean>>({});
  const [expandedBooks, setExpandedBooks] = useState<Record<string, boolean>>({});

  const domains = useMemo(() => {
    const set = new Set<string>();
    for (const b of topicBuckets) set.add(b.subject_domain);
    return ['All', ...Array.from(set)];
  }, [topicBuckets]);

  const queryLower = search.trim().toLowerCase();

  const matchesChapter = (ch: NcertChapter): boolean => {
    if (classFilter !== 'all' && ch.class !== classFilter) return false;
    if (!queryLower) return true;
    return (
      ch.chapter_title.toLowerCase().includes(queryLower) ||
      ch.topic_bucket.toLowerCase().includes(queryLower) ||
      ch.book_title.toLowerCase().includes(queryLower) ||
      ch.subject.toLowerCase().includes(queryLower) ||
      ch.secondary_tags.some((t) => t.toLowerCase().includes(queryLower)) ||
      ch.subtopics.some((s) => s.toLowerCase().includes(queryLower))
    );
  };

  const filteredBuckets = useMemo(() => {
    return topicBuckets
      .filter((b) => domainFilter === 'All' || b.subject_domain === domainFilter)
      .map((b) => {
        const bucketMatches =
          !queryLower ||
          b.bucket_name.toLowerCase().includes(queryLower) ||
          b.description.toLowerCase().includes(queryLower);
        const matchingChapters = b.chapters.filter((ch) =>
          classFilter === 'all' ? (bucketMatches ? true : matchesChapter(ch)) : ch.class === classFilter && (bucketMatches || matchesChapter(ch)),
        );
        return { bucket: b, chapters: matchingChapters };
      })
      .filter((entry) => entry.chapters.length > 0);
  }, [topicBuckets, domainFilter, classFilter, queryLower]);

  const filteredBooks = useMemo(() => {
    return books
      .filter((book) => classFilter === 'all' || book.class === classFilter)
      .filter((book) => {
        if (domainFilter === 'All') return true;
        const d = domainFilter.toLowerCase();
        const s = book.subject.toLowerCase();
        if (d.includes('biology')) return s === 'science';
        return d.includes(s) || s.includes(d);
      })
      .map((book) => {
        const bookMatches = !queryLower || book.book_title.toLowerCase().includes(queryLower);
        const chapters = bookMatches ? book.chapters : book.chapters.filter(matchesChapter);
        return { book, chapters };
      })
      .filter((entry) => entry.chapters.length > 0);
  }, [books, classFilter, domainFilter, queryLower]);

  const toggleBucket = (name: string) =>
    setExpandedBuckets((prev) => ({ ...prev, [name]: !prev[name] }));

  const toggleBook = (dir: string) =>
    setExpandedBooks((prev) => ({ ...prev, [dir]: !prev[dir] }));

  return (
    <div className="min-h-dvh flex flex-col bg-gradient-to-br from-slate-50 via-white to-emerald-50/40 dark:from-gray-950 dark:via-gray-900 dark:to-emerald-950/20">
      {/* Header */}
      <header className="sticky top-0 z-20 h-16 px-4 sm:px-6 border-b border-gray-200/70 dark:border-gray-800/80 bg-white/85 dark:bg-gray-950/85 backdrop-blur-xl flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/"
            className="p-2 rounded-xl text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors shrink-0"
            title="Back to Home"
          >
            <ArrowLeft className="size-5" />
          </Link>
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="size-9 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-600 text-white flex items-center justify-center shadow-sm shrink-0">
              <BookMarked className="size-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base font-bold text-gray-900 dark:text-gray-100 truncate">
                NCERT Knowledge Base
              </h1>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate hidden sm:block">
                Classes 7–12 · {summary.totalTopicBuckets} Cross-Class Topics · {summary.totalBooks} Textbooks · {summary.totalChapters} Chapters
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <ProfileBadge />
          <Link
            href="/help-me-learn"
            className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white px-3.5 py-2 text-xs font-semibold shadow-xs transition-colors"
          >
            <Compass className="size-3.5" />
            <span className="hidden sm:inline">Help Me Learn</span>
          </Link>
        </div>
      </header>

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 space-y-5">
        {/* Hero / Search / Controls */}
        <section className="rounded-3xl border border-gray-200/80 dark:border-gray-800 bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl shadow-sm p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-gray-100">
                Cross-Class Curriculum Explorer (Classes 7 → 12)
              </h2>
              <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-0.5">
                Follow any topic from middle-school foundations through Class 12. Open any NCERT PDF, study with Help Me Learn & Live Camera Tutor, or launch a full interactive classroom.
              </p>
            </div>

            {/* View Mode Toggle */}
            <div className="inline-flex rounded-xl bg-gray-100 dark:bg-gray-800 p-1 shrink-0 self-start">
              <button
                type="button"
                onClick={() => setViewMode('topics')}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors inline-flex items-center gap-1.5',
                  viewMode === 'topics'
                    ? 'bg-white dark:bg-gray-900 text-emerald-700 dark:text-emerald-300 shadow-xs'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200',
                )}
              >
                <Layers className="size-3.5" />
                By Topic (7→12)
              </button>
              <button
                type="button"
                onClick={() => setViewMode('books')}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors inline-flex items-center gap-1.5',
                  viewMode === 'books'
                    ? 'bg-white dark:bg-gray-900 text-emerald-700 dark:text-emerald-300 shadow-xs'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200',
                )}
              >
                <BookOpen className="size-3.5" />
                By Book & Class
              </button>
            </div>
          </div>

          {/* Search Input */}
          <div className="relative">
            <Search className="size-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search any topic, concept, or chapter (e.g. Algebra, Optics, Laws of Motion, Organic Chemistry, Trigonometry)..."
              className="w-full rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50/70 dark:bg-gray-950/60 pl-10 pr-10 py-3 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-800 text-gray-500"
                aria-label="Clear search"
              >
                <X className="size-4" />
              </button>
            )}
          </div>

          {/* Domain & Class Filters */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {domains.map((dom) => (
                <button
                  key={dom}
                  type="button"
                  onClick={() => setDomainFilter(dom)}
                  className={cn(
                    'px-3 py-1 rounded-full text-xs font-medium transition-colors border',
                    domainFilter === dom
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-emerald-300',
                  )}
                >
                  {dom}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-1">
              <button
                type="button"
                onClick={() => setClassFilter('all')}
                className={cn(
                  'px-2.5 py-1 rounded-lg text-xs font-medium transition-colors',
                  classFilter === 'all'
                    ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700',
                )}
              >
                All Classes
              </button>
              {summary.classesCovered.map((cls) => (
                <button
                  key={cls}
                  type="button"
                  onClick={() => setClassFilter(cls)}
                  className={cn(
                    'px-2.5 py-1 rounded-lg text-xs font-medium transition-colors',
                    classFilter === cls
                      ? 'bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700',
                  )}
                >
                  Class {cls}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* View 1: Cross-Class Topic Progression Buckets */}
        {viewMode === 'topics' && (
          <section className="space-y-3">
            {filteredBuckets.length === 0 && (
              <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-8 text-center text-sm text-gray-500">
                No NCERT chapters match your filter. Try clearing the search or class filter.
              </div>
            )}

            {filteredBuckets.map(({ bucket, chapters }) => {
              const isExpanded = Boolean(expandedBuckets[bucket.bucket_name]) || Boolean(queryLower);
              return (
                <div
                  key={bucket.bucket_name}
                  className="rounded-2xl border border-gray-200/80 dark:border-gray-800 bg-white/95 dark:bg-gray-900/95 shadow-xs overflow-hidden"
                >
                  <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => toggleBucket(bucket.bucket_name)}
                      className="flex items-start gap-3 text-left flex-1 min-w-0"
                    >
                      <div className="mt-0.5 text-gray-400 shrink-0">
                        {isExpanded ? (
                          <ChevronDown className="size-5" />
                        ) : (
                          <ChevronRight className="size-5" />
                        )}
                      </div>
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm sm:text-base font-bold text-gray-900 dark:text-gray-100">
                            {bucket.bucket_name}
                          </h3>
                          <span
                            className={cn(
                              'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold',
                              domainBadgeStyle(bucket.subject_domain),
                            )}
                          >
                            {bucket.subject_domain}
                          </span>
                          <span className="inline-flex items-center rounded-full bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-[11px] font-semibold text-gray-700 dark:text-gray-300">
                            {bucket.class_progression}
                          </span>
                          <span className="text-[11px] text-gray-500">
                            {chapters.length} {chapters.length === 1 ? 'chapter' : 'chapters'}
                          </span>
                        </div>
                        <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">
                          {bucket.description}
                        </p>
                      </div>
                    </button>

                    <div className="flex items-center gap-2 shrink-0 pl-8 sm:pl-0">
                      <Link
                        href={helpMeLearnBucketHref(bucket)}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-violet-50 hover:bg-violet-100 dark:bg-violet-950/40 dark:hover:bg-violet-900/50 text-violet-700 dark:text-violet-300 border border-violet-200/70 dark:border-violet-800/60 px-3 py-1.5 text-xs font-semibold transition-colors"
                      >
                        <Compass className="size-3.5" />
                        Study Topic
                      </Link>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-gray-100 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800/80 bg-gray-50/40 dark:bg-gray-950/30">
                      {chapters.map((ch) => (
                        <div
                          key={ch.relative_path}
                          className="px-4 sm:px-6 py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:bg-white/80 dark:hover:bg-gray-900/60 transition-colors"
                        >
                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={cn(
                                  'inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold',
                                  classBadgeStyle(ch.class),
                                )}
                              >
                                Class {ch.class}
                              </span>
                              <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                                Ch. {ch.chapter_number}: {ch.chapter_title}
                              </span>
                              <span className="text-[11px] text-gray-500 dark:text-gray-400">
                                {ch.book_title} · {ch.pages}p
                              </span>
                            </div>
                            {ch.secondary_tags.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {ch.secondary_tags.slice(0, 5).map((tag) => (
                                  <span
                                    key={tag}
                                    className="rounded-md bg-gray-100 dark:bg-gray-800/80 px-1.5 py-0.5 text-[10px] text-gray-600 dark:text-gray-400"
                                  >
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                            <a
                              href={pdfHref(ch.relative_path)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 px-2.5 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-200 transition-colors"
                            >
                              <FileText className="size-3.5 text-rose-500" />
                              PDF
                              <ExternalLink className="size-3 opacity-60" />
                            </a>
                            <Link
                              href={helpMeLearnChapterHref(ch)}
                              className="inline-flex items-center gap-1 rounded-lg bg-violet-600 hover:bg-violet-700 text-white px-2.5 py-1.5 text-xs font-semibold transition-colors"
                            >
                              <Compass className="size-3.5" />
                              Help Me Learn
                            </Link>
                            <Link
                              href={classroomChapterHref(ch)}
                              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1.5 text-xs font-semibold transition-colors"
                            >
                              <Sparkles className="size-3.5" />
                              Classroom
                            </Link>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        )}

        {/* View 2: By Textbook & Class */}
        {viewMode === 'books' && (
          <section className="space-y-3">
            {filteredBooks.length === 0 && (
              <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-8 text-center text-sm text-gray-500">
                No textbooks match your filter.
              </div>
            )}

            {filteredBooks.map(({ book, chapters }) => {
              const isExpanded = Boolean(expandedBooks[book.directory]) || Boolean(queryLower);
              return (
                <div
                  key={book.directory}
                  className="rounded-2xl border border-gray-200/80 dark:border-gray-800 bg-white/95 dark:bg-gray-900/95 shadow-xs overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => toggleBook(book.directory)}
                    className="w-full p-4 sm:p-5 flex items-center justify-between gap-3 text-left"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="text-gray-400 shrink-0">
                        {isExpanded ? (
                          <ChevronDown className="size-5" />
                        ) : (
                          <ChevronRight className="size-5" />
                        )}
                      </div>
                      <span
                        className={cn(
                          'inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-bold shrink-0',
                          classBadgeStyle(book.class),
                        )}
                      >
                        Class {book.class}
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm sm:text-base font-bold text-gray-900 dark:text-gray-100 truncate">
                            {book.book_title}
                          </h3>
                          <span className="text-xs text-gray-500">
                            {book.subject} · {book.edition}
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400">
                          {chapters.length} chapters · {book.non_chapter_files.length} reference PDFs
                        </p>
                      </div>
                    </div>
                    <GraduationCap className="size-5 text-gray-300 dark:text-gray-700 shrink-0 hidden sm:block" />
                  </button>

                  {isExpanded && (
                    <div className="border-t border-gray-100 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800/80 bg-gray-50/40 dark:bg-gray-950/30">
                      {chapters.map((ch) => (
                        <div
                          key={ch.relative_path}
                          className="px-4 sm:px-6 py-3 flex flex-col md:flex-row md:items-center justify-between gap-2.5"
                        >
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                                Ch. {ch.chapter_number}: {ch.chapter_title}
                              </span>
                              <span className="rounded-full bg-gray-100 dark:bg-gray-800 px-2 py-0.5 text-[10px] font-medium text-gray-600 dark:text-gray-400">
                                {ch.topic_bucket}
                              </span>
                              <span className="text-[11px] text-gray-500">{ch.pages}p</span>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                            <a
                              href={pdfHref(ch.relative_path)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 px-2.5 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-200"
                            >
                              <FileText className="size-3.5 text-rose-500" />
                              PDF
                            </a>
                            <Link
                              href={helpMeLearnChapterHref(ch)}
                              className="inline-flex items-center gap-1 rounded-lg bg-violet-600 hover:bg-violet-700 text-white px-2.5 py-1.5 text-xs font-semibold"
                            >
                              <Compass className="size-3.5" />
                              Help Me Learn
                            </Link>
                            <Link
                              href={classroomChapterHref(ch)}
                              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-2.5 py-1.5 text-xs font-semibold"
                            >
                              <Sparkles className="size-3.5" />
                              Classroom
                            </Link>
                          </div>
                        </div>
                      ))}

                      {book.non_chapter_files.length > 0 && (
                        <div className="px-4 sm:px-6 py-3 bg-gray-100/50 dark:bg-gray-900/50">
                          <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-2">
                            Prelims, Appendices & Answer Keys
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {book.non_chapter_files.map((ref) => (
                              <a
                                key={ref.relative_path}
                                href={pdfHref(ref.relative_path)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800 px-2.5 py-1 text-xs text-gray-700 dark:text-gray-300"
                              >
                                <FileText className="size-3 text-gray-400" />
                                {ref.title} ({ref.pages}p)
                                <ExternalLink className="size-2.5 opacity-60" />
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        )}
      </main>
    </div>
  );
}
