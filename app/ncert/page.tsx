import { NcertLibraryView } from '@/components/ncert/ncert-library-view';
import { getNcertBooks, getNcertCatalog, getNcertTopicBuckets } from '@/lib/ncert/catalog';

export const dynamic = 'force-dynamic';

export default function NcertLibraryPage() {
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
