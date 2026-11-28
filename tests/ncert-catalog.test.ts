import { describe, expect, it } from 'vitest';
import {
  findNcertChapterByPath,
  getNcertBooks,
  getNcertCatalog,
  getNcertTopicBuckets,
  isValidNcertPdfPath,
  matchNcertChaptersForTopic,
  searchNcertChapters,
} from '@/lib/ncert/catalog';
import { compactNcertText } from '@/lib/ncert/storage';

describe('NCERT Knowledge Base Catalog', () => {
  it('loads the complete Classes 7-12 catalog', () => {
    const catalog = getNcertCatalog();
    expect(catalog.total_books).toBe(25);
    expect(catalog.total_chapters).toBe(221);
    expect(catalog.total_pdfs).toBe(270);
    expect(catalog.total_topic_buckets).toBe(23);
    expect(getNcertBooks()).toHaveLength(25);
    expect(getNcertTopicBuckets()).toHaveLength(23);
  });

  it('strictly allowlists valid NCERT PDF paths and blocks traversal', () => {
    const valid =
      'Class-11/Physics/Part-1/Chapter-04-Mechanics-Laws-of-Motion.pdf';
    expect(isValidNcertPdfPath(valid)).toBe(true);
    expect(findNcertChapterByPath(valid)?.chapter_title).toBe('Laws of Motion');

    expect(isValidNcertPdfPath('../openmaic.yml')).toBe(false);
    expect(isValidNcertPdfPath('Class-11/Physics/Part-1/does-not-exist.pdf')).toBe(false);
    expect(isValidNcertPdfPath('')).toBe(false);
  });

  it('matches cross-class topics by content alignment', () => {
    const motion = matchNcertChaptersForTopic('Newton laws of motion and inertia');
    expect(motion.chapters.length).toBeGreaterThan(0);
    expect(motion.primaryBucket?.bucket_name).toContain('Mechanics');

    const chem = matchNcertChaptersForTopic('alcohols phenols and ethers organic chemistry');
    expect(chem.chapters.length).toBeGreaterThan(0);
    expect(chem.chapters[0].class).toBe(12);
    expect(chem.chapters[0].subject).toBe('Chemistry');
  });

  it('supports filtered search by class and subject', () => {
    const class8Math = searchNcertChapters('algebra', {
      classLevel: 8,
      subject: 'Mathematics',
    });
    expect(class8Math.length).toBeGreaterThan(0);
    expect(class8Math.every((c) => c.class === 8 && c.subject === 'Mathematics')).toBe(true);
  });

  it('compacts and truncates extracted textbook text cleanly', () => {
    const compacted = compactNcertText('Line 1   with   spaces\n\n\n\nLine 2', 20);
    expect(compacted).toContain('[... truncated ...]');
    expect(compacted).not.toContain('   ');
  });
});
