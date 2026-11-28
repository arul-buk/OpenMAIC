import { NextRequest } from 'next/server';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { profileHasKbAccess } from '@/lib/server/access-profiles-shared';
import { resolveAccessProfileFromRequest } from '@/lib/server/identity/profile-access';
import {
  getNcertBooks,
  getNcertCatalog,
  getNcertTopicBuckets,
  searchNcertChapters,
  toNcertSourceRef,
} from '@/lib/ncert/catalog';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const activeProfile = resolveAccessProfileFromRequest(req);
  if (!profileHasKbAccess(activeProfile, 'ncert')) {
    return apiError('INVALID_REQUEST', 403, 'NCERT Knowledge Base is not enabled for this profile');
  }
  const url = new URL(req.url);
  const query = url.searchParams.get('q')?.trim() ?? '';
  const classParam = url.searchParams.get('class')?.trim();
  const subject = url.searchParams.get('subject')?.trim() || undefined;
  const bucket = url.searchParams.get('bucket')?.trim() || undefined;
  const view = url.searchParams.get('view')?.trim() || 'buckets';

  const classLevel =
    classParam && /^\d+$/.test(classParam) ? Number(classParam) : undefined;

  const catalog = getNcertCatalog();

  if (query || classLevel !== undefined || subject || bucket) {
    const chapters = searchNcertChapters(query, {
      classLevel,
      subject,
      bucket,
      limit: 60,
    });
    return apiSuccess({
      summary: {
        totalBooks: catalog.total_books,
        totalChapters: catalog.total_chapters,
        totalPdfs: catalog.total_pdfs,
        totalTopicBuckets: catalog.total_topic_buckets,
        classesCovered: catalog.classes_covered,
        subjectsCovered: catalog.subjects_covered,
      },
      chapters: chapters.map((ch) => ({
        ...ch,
        sourceRef: toNcertSourceRef(ch),
      })),
    });
  }

  return apiSuccess({
    summary: {
      totalBooks: catalog.total_books,
      totalChapters: catalog.total_chapters,
      totalPdfs: catalog.total_pdfs,
      totalTopicBuckets: catalog.total_topic_buckets,
      classesCovered: catalog.classes_covered,
      subjectsCovered: catalog.subjects_covered,
    },
    topicBuckets: view === 'books' ? undefined : getNcertTopicBuckets(),
    books: view === 'buckets' ? undefined : getNcertBooks(),
  });
}
