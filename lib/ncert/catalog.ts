import rawCatalog from './ncert-chapter-index.json';
import type {
  NcertBook,
  NcertCatalogIndex,
  NcertChapter,
  NcertNonChapterFile,
  NcertSourceRef,
  NcertTopicBucket,
} from './types';

const catalog = rawCatalog as unknown as NcertCatalogIndex;

const chapterByPath = new Map<string, NcertChapter>();
const validPdfPaths = new Set<string>();
const allChapters: NcertChapter[] = [];
const allTopicBuckets: NcertTopicBucket[] = Object.values(catalog.topic_buckets);

for (const book of catalog.books) {
  for (const ch of book.chapters) {
    chapterByPath.set(ch.relative_path, ch);
    validPdfPaths.add(ch.relative_path);
    allChapters.push(ch);
  }
  for (const ref of book.non_chapter_files) {
    validPdfPaths.add(ref.relative_path);
  }
}

export function getNcertCatalog(): NcertCatalogIndex {
  return catalog;
}

export function getNcertTopicBuckets(): NcertTopicBucket[] {
  return allTopicBuckets;
}

export function getNcertTopicBucket(bucketName: string): NcertTopicBucket | undefined {
  if (catalog.topic_buckets[bucketName]) return catalog.topic_buckets[bucketName];
  const lower = bucketName.trim().toLowerCase();
  return allTopicBuckets.find((b) => b.bucket_name.toLowerCase() === lower);
}

export function getNcertBooks(): NcertBook[] {
  return catalog.books;
}

export function getAllNcertChapters(): NcertChapter[] {
  return allChapters;
}

export function findNcertChapterByPath(relativePath: string): NcertChapter | undefined {
  return chapterByPath.get(relativePath.trim());
}

export function findNcertNonChapterByPath(
  relativePath: string,
): { book: NcertBook; file: NcertNonChapterFile } | undefined {
  const target = relativePath.trim();
  for (const book of catalog.books) {
    const file = book.non_chapter_files.find((f) => f.relative_path === target);
    if (file) return { book, file };
  }
  return undefined;
}

/** Strict allowlist check against the 270 known NCERT PDFs (blocks path traversal). */
export function isValidNcertPdfPath(relativePath: string): boolean {
  return validPdfPaths.has(relativePath.trim());
}

export function buildNcertPdfUrl(relativePath: string): string {
  return `/api/ncert/pdf?path=${encodeURIComponent(relativePath)}`;
}

export function toNcertSourceRef(chapter: NcertChapter): NcertSourceRef {
  const bucket = catalog.topic_buckets[chapter.topic_bucket];
  return {
    relativePath: chapter.relative_path,
    classLevel: chapter.class,
    subject: chapter.subject,
    bookTitle: chapter.book_title,
    chapterNumber: chapter.chapter_number,
    chapterTitle: chapter.chapter_title,
    topicBucket: chapter.topic_bucket,
    classProgression: bucket?.class_progression ?? `Class ${chapter.class}`,
    pages: chapter.pages,
    pdfUrl: buildNcertPdfUrl(chapter.relative_path),
  };
}

const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'from',
  'that',
  'this',
  'into',
  'about',
  'what',
  'how',
  'why',
  'explain',
  'help',
  'learn',
  'teach',
  'solve',
  'problem',
  'problems',
  'question',
  'questions',
  'chapter',
  'ncert',
  'class',
  'grade',
  'topic',
  'study',
  'me',
  'in',
  'of',
  'on',
  'to',
  'a',
  'an',
  'is',
  'are',
  'using',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((tok) => tok.length >= 2 && !STOP_WORDS.has(tok));
}

function scoreChapter(chapter: NcertChapter, tokens: string[], fullQueryLower: string): number {
  if (tokens.length === 0) return 0;

  const titleLower = chapter.chapter_title.toLowerCase();
  const bucketLower = chapter.topic_bucket.toLowerCase();
  const domainLower = chapter.primary_domain.toLowerCase();
  const tagsLower = chapter.secondary_tags.join(' ').toLowerCase();
  const subtopicsLower = chapter.subtopics.join(' ').toLowerCase();
  const bookLower = chapter.book_title.toLowerCase();
  const subjectLower = chapter.subject.toLowerCase();

  let score = 0;

  // Phrase bonus for direct title / tag / subtopic matches
  if (fullQueryLower.length >= 4) {
    if (titleLower.includes(fullQueryLower)) score += 30;
    if (tagsLower.includes(fullQueryLower)) score += 20;
    if (subtopicsLower.includes(fullQueryLower)) score += 16;
    if (bucketLower.includes(fullQueryLower)) score += 12;
  }

  let matchedTokens = 0;
  for (const tok of tokens) {
    let tokScore = 0;
    if (titleLower.includes(tok)) tokScore += 10;
    if (tagsLower.includes(tok)) tokScore += 7;
    if (subtopicsLower.includes(tok)) tokScore += 5;
    if (bucketLower.includes(tok)) tokScore += 4;
    if (domainLower.includes(tok)) tokScore += 3;
    if (subjectLower.includes(tok) || bookLower.includes(tok)) tokScore += 1;

    if (tokScore > 0) {
      matchedTokens++;
      score += tokScore;
    }
  }

  // Reward multi-token coverage
  if (tokens.length > 1 && matchedTokens >= Math.ceil(tokens.length * 0.6)) {
    score += 8;
  }

  // Prefer NCF-SE 2023 / current rationalised editions slightly over Legacy duplicates
  if (chapter.book_title.toLowerCase().includes('legacy')) {
    score *= 0.85;
  }

  return score;
}

export interface NcertSearchOptions {
  classLevel?: number;
  subject?: string;
  bucket?: string;
  limit?: number;
}

export function searchNcertChapters(query: string, options: NcertSearchOptions = {}): NcertChapter[] {
  const { classLevel, subject, bucket, limit = 25 } = options;

  let pool = allChapters;
  if (typeof classLevel === 'number') {
    pool = pool.filter((ch) => ch.class === classLevel);
  }
  if (subject) {
    const subjLower = subject.toLowerCase();
    pool = pool.filter((ch) => ch.subject.toLowerCase() === subjLower);
  }
  if (bucket) {
    const bLower = bucket.toLowerCase();
    pool = pool.filter((ch) => ch.topic_bucket.toLowerCase() === bLower);
  }

  const trimmed = query.trim();
  if (!trimmed) {
    return pool.slice(0, limit);
  }

  const tokens = tokenize(trimmed);
  const fullLower = trimmed.toLowerCase();

  const scored = pool
    .map((ch) => ({ ch, score: scoreChapter(ch, tokens, fullLower) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.ch.class - b.ch.class);

  return scored.slice(0, limit).map((e) => e.ch);
}

/**
 * Matches a student's free-form topic/question to the most relevant NCERT
 * chapters across Classes 7-12. Prioritizes content alignment across the
 * spiral/cross-class topic progression rather than locking to one grade.
 */
export function matchNcertChaptersForTopic(
  query: string,
  options: { maxChapters?: number; preferredClass?: number } = {},
): {
  chapters: NcertChapter[];
  primaryBucket: NcertTopicBucket | null;
} {
  const { maxChapters = 3, preferredClass } = options;
  const trimmed = query.trim();
  if (!trimmed) return { chapters: [], primaryBucket: null };

  // Also check if the query explicitly mentions a class ("class 9", "grade 10", etc.)
  const explicitClassMatch = trimmed.match(/\b(?:class|grade|std)\s*(7|8|9|10|11|12)\b/i);
  const targetClass = explicitClassMatch ? Number(explicitClassMatch[1]) : preferredClass;

  const tokens = tokenize(trimmed);
  const fullLower = trimmed.toLowerCase();
  if (tokens.length === 0) return { chapters: [], primaryBucket: null };

  const scored = allChapters
    .map((ch) => {
      let score = scoreChapter(ch, tokens, fullLower);
      if (score > 0 && targetClass && ch.class === targetClass) {
        score += 4;
      }
      return { ch, score };
    })
    .filter((entry) => entry.score >= 10)
    .sort((a, b) => b.score - a.score || a.ch.class - b.ch.class);

  if (scored.length === 0) {
    return { chapters: [], primaryBucket: null };
  }

  const selected: NcertChapter[] = [];
  const seenPaths = new Set<string>();
  const topScore = scored[0].score;

  for (const entry of scored) {
    if (selected.length >= maxChapters) break;
    // Only include chapters reasonably close to the top match
    if (entry.score < topScore * 0.45 && selected.length >= 1) break;
    if (seenPaths.has(entry.ch.relative_path)) continue;
    seenPaths.add(entry.ch.relative_path);
    selected.push(entry.ch);
  }

  const primaryBucket =
    selected.length > 0 ? (catalog.topic_buckets[selected[0].topic_bucket] ?? null) : null;

  return { chapters: selected, primaryBucket };
}
