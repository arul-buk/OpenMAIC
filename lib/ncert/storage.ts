import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  findNcertChapterByPath,
  getNcertTopicBucket,
  isValidNcertPdfPath,
  matchNcertChaptersForTopic,
  toNcertSourceRef,
} from './catalog';
import type { NcertChapter, NcertSourceRef } from './types';

const TEXT_CACHE_MAX = 64;
const textCache = new Map<string, string>();

function getR2Bucket(): string | undefined {
  return process.env.NCERT_R2_BUCKET?.trim() || process.env.ASSET_S3_BUCKET?.trim() || undefined;
}

async function createS3Client() {
  const { S3Client } = await import('@aws-sdk/client-s3');
  return new S3Client({
    region: process.env.AWS_REGION || 'auto',
    ...(process.env.AWS_ENDPOINT_URL_S3 ? { endpoint: process.env.AWS_ENDPOINT_URL_S3 } : {}),
    forcePathStyle: process.env.AWS_S3_FORCE_PATH_STYLE === '1' || process.env.AWS_S3_FORCE_PATH_STYLE === 'true',
  });
}

function cacheText(key: string, value: string): void {
  if (textCache.has(key)) {
    textCache.delete(key);
  } else if (textCache.size >= TEXT_CACHE_MAX) {
    const oldest = textCache.keys().next().value;
    if (oldest) textCache.delete(oldest);
  }
  textCache.set(key, value);
}

/**
 * Fetches pre-extracted plain text for a validated NCERT PDF from R2
 * (`ncert/text/<relative_path>.txt`), with an optional local-directory fallback
 * (`NCERT_LOCAL_TEXT_DIR`) for offline development.
 */
export async function readNcertChapterText(relativePath: string): Promise<string | null> {
  const normalized = relativePath.trim();
  if (!isValidNcertPdfPath(normalized)) return null;

  const cached = textCache.get(normalized);
  if (cached !== undefined) return cached;

  const localTextDir = process.env.NCERT_LOCAL_TEXT_DIR?.trim();
  if (localTextDir) {
    try {
      const content = await readFile(join(localTextDir, `${normalized}.txt`), 'utf8');
      cacheText(normalized, content);
      return content;
    } catch {
      // Fall through to R2
    }
  }

  const bucket = getR2Bucket();
  if (!bucket) return null;

  try {
    const [{ GetObjectCommand }, client] = await Promise.all([
      import('@aws-sdk/client-s3'),
      createS3Client(),
    ]);
    const resp = await client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: `ncert/text/${normalized}.txt`,
      }),
    );
    const bodyText = await resp.Body?.transformToString('utf8');
    if (typeof bodyText === 'string' && bodyText.length > 0) {
      cacheText(normalized, bodyText);
      return bodyText;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Reads the raw PDF bytes for a validated NCERT PDF from R2
 * (`ncert/pdfs/<relative_path>`) or optional local fallback (`NCERT_LOCAL_PDF_DIR`).
 */
export async function readNcertPdfBytes(relativePath: string): Promise<Uint8Array | null> {
  const normalized = relativePath.trim();
  if (!isValidNcertPdfPath(normalized)) return null;

  const localPdfDir = process.env.NCERT_LOCAL_PDF_DIR?.trim();
  if (localPdfDir) {
    try {
      const buf = await readFile(join(localPdfDir, normalized));
      return new Uint8Array(buf);
    } catch {
      // Fall through to R2
    }
  }

  const bucket = getR2Bucket();
  if (!bucket) return null;

  try {
    const [{ GetObjectCommand }, client] = await Promise.all([
      import('@aws-sdk/client-s3'),
      createS3Client(),
    ]);
    const resp = await client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: `ncert/pdfs/${normalized}`,
      }),
    );
    const bytes = await resp.Body?.transformToByteArray();
    return bytes ?? null;
  } catch {
    return null;
  }
}

/** Cleans noisy whitespace from pdftotext -layout output for compact LLM grounding. */
export function compactNcertText(raw: string, maxChars: number): string {
  const cleaned = raw
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (cleaned.length <= maxChars) return cleaned;
  return `${cleaned.slice(0, maxChars).trimEnd()}\n[... truncated ...]`;
}

export interface NcertGroundingResult {
  sources: NcertSourceRef[];
  /** Rich textbook excerpts for study-plan / classroom generation. */
  promptContext: string;
  /** Shorter summary safe to inject into Live Camera Tutor system instructions. */
  tutorContext: string;
}

/**
 * Resolves NCERT textbook chapters from explicit chapter paths, a cross-class
 * topic bucket, or automatic topic matching, then loads their extracted text
 * from R2 so Help Me Learn and Live Camera Tutor stay strictly NCERT-aligned.
 */
export async function buildNcertGroundingContext(input: {
  query?: string;
  chapterPaths?: string[];
  bucketName?: string;
  maxChapters?: number;
  maxCharsTotal?: number;
}): Promise<NcertGroundingResult> {
  const maxChapters = input.maxChapters ?? 3;
  const maxCharsTotal = input.maxCharsTotal ?? 12_000;
  const chapters: NcertChapter[] = [];
  const seen = new Set<string>();

  const pushChapter = (ch: NcertChapter | undefined) => {
    if (!ch || seen.has(ch.relative_path) || chapters.length >= maxChapters) return;
    seen.add(ch.relative_path);
    chapters.push(ch);
  };

  // 1. Explicit chapter selections first
  if (Array.isArray(input.chapterPaths)) {
    for (const path of input.chapterPaths) {
      if (typeof path === 'string') {
        pushChapter(findNcertChapterByPath(path));
      }
    }
  }

  // 2. Explicit topic bucket (pick representative chapters spanning the progression)
  if (chapters.length === 0 && input.bucketName) {
    const bucket = getNcertTopicBucket(input.bucketName);
    if (bucket && bucket.chapters.length > 0) {
      const nonLegacy = bucket.chapters.filter(
        (c) => !c.book_title.toLowerCase().includes('legacy'),
      );
      const pool = nonLegacy.length > 0 ? nonLegacy : bucket.chapters;
      // Pick foundational, mid, and upper chapters across the topic's class span
      if (pool.length <= maxChapters) {
        for (const ch of pool) pushChapter(ch);
      } else {
        pushChapter(pool[0]);
        pushChapter(pool[Math.floor(pool.length / 2)]);
        pushChapter(pool[pool.length - 1]);
      }
    }
  }

  // 3. Automatic content-aligned matching across Classes 7-12
  if (chapters.length === 0 && input.query?.trim()) {
    const matched = matchNcertChaptersForTopic(input.query, { maxChapters });
    for (const ch of matched.chapters) pushChapter(ch);
  }

  if (chapters.length === 0) {
    return { sources: [], promptContext: '', tutorContext: '' };
  }

  const sources = chapters.map(toNcertSourceRef);
  const perChapterBudget = Math.max(2500, Math.floor(maxCharsTotal / chapters.length));

  const texts = await Promise.all(
    chapters.map((ch) => readNcertChapterText(ch.relative_path)),
  );

  const promptSections: string[] = [];
  const tutorSections: string[] = [];

  for (let i = 0; i < chapters.length; i++) {
    const ch = chapters[i];
    const bucket = getNcertTopicBucket(ch.topic_bucket);
    const progression = bucket
      ? `${bucket.bucket_name} (${bucket.class_progression})`
      : ch.topic_bucket;

    const header = [
      `[NCERT Class ${ch.class} · ${ch.subject}] ${ch.book_title} — Chapter ${ch.chapter_number}: ${ch.chapter_title}`,
      `Topic Progression: ${progression}`,
      ch.subtopics.length > 0 ? `Subtopics: ${ch.subtopics.join('; ')}` : '',
      ch.secondary_tags.length > 0 ? `Key Concepts: ${ch.secondary_tags.join(', ')}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const rawText = texts[i];
    const excerpt = rawText ? compactNcertText(rawText, perChapterBudget) : '';
    promptSections.push(excerpt ? `${header}\n\nTextbook Excerpt:\n${excerpt}` : header);

    const tutorExcerpt = rawText ? compactNcertText(rawText, 900) : '';
    tutorSections.push(tutorExcerpt ? `${header}\nKey Reference:\n${tutorExcerpt}` : header);
  }

  return {
    sources,
    promptContext: promptSections.join('\n\n---\n\n'),
    tutorContext: tutorSections.join('\n\n---\n\n'),
  };
}
