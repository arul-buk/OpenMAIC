export interface NcertChapter {
  class: number;
  subject: string;
  book_title: string;
  edition: string;
  chapter_number: number;
  book_unit_number: number | null;
  chapter_title: string;
  topic_bucket: string;
  primary_domain: string;
  area_slug: string;
  secondary_tags: string[];
  subtopics: string[];
  pages: number;
  filename: string;
  relative_path: string;
}

export interface NcertNonChapterFile {
  type: string;
  title: string;
  filename: string;
  relative_path: string;
  pages: number;
}

export interface NcertBook {
  class: number;
  subject: string;
  book_title: string;
  edition: string;
  directory: string;
  chapter_count: number;
  non_chapter_files: NcertNonChapterFile[];
  chapters: NcertChapter[];
}

export interface NcertTopicBucket {
  bucket_name: string;
  subject_domain: string;
  description: string;
  classes_covered: number[];
  class_progression: string;
  total_chapters: number;
  total_pages: number;
  chapters: NcertChapter[];
}

export interface NcertCatalogIndex {
  title: string;
  classes_covered: number[];
  subjects_covered: string[];
  total_books: number;
  total_chapters: number;
  total_non_chapter_files: number;
  total_pdfs: number;
  total_topic_buckets: number;
  topic_buckets: Record<string, NcertTopicBucket>;
  books: NcertBook[];
}

/** Compact reference to an NCERT chapter attached to a study plan or tutor session. */
export interface NcertSourceRef {
  relativePath: string;
  classLevel: number;
  subject: string;
  bookTitle: string;
  chapterNumber: number;
  chapterTitle: string;
  topicBucket: string;
  classProgression: string;
  pages: number;
  pdfUrl: string;
}
