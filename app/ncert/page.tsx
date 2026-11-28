import Link from 'next/link';
import { NcertLibraryView } from '@/components/ncert/ncert-library-view';
import { getNcertBooks, getNcertCatalog, getNcertTopicBuckets } from '@/lib/ncert/catalog';
import { profileHasKbAccess } from '@/lib/server/access-profiles-shared';
import { resolveAccessProfileFromCookies } from '@/lib/server/identity/profile-access';

export const dynamic = 'force-dynamic';

export default async function NcertLibraryPage() {
  const activeProfile = await resolveAccessProfileFromCookies();
  if (!profileHasKbAccess(activeProfile, 'ncert')) {
    return (
      <div className="min-h-dvh flex items-center justify-center p-6 bg-slate-50 dark:bg-gray-950">
        <div className="max-w-md w-full rounded-3xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-8 text-center space-y-4 shadow-sm">
          <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">
            NCERT Knowledge Base Unavailable
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            This textbook library is not enabled for the current profile.
          </p>
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-xl bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 text-sm font-semibold transition-colors"
          >
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  const catalog = getNcertCatalog();
  const topicBuckets = getNcertTopicBuckets();
  const books = getNcertBooks();

  return (
    <NcertLibraryView
      summary={{
        totalBooks: catalog.total_books,
        totalChapters: catalog.total_chapters,
        totalPdfs: catalog.total_pdfs,
        totalTopicBuckets: catalog.total_topic_buckets,
        classesCovered: catalog.classes_covered,
        subjectsCovered: catalog.subjects_covered,
      }}
      topicBuckets={topicBuckets}
      books={books}
    />
  );
}
