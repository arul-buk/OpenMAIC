import { NextRequest } from 'next/server';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import {
  findNcertChapterByPath,
  getNcertTopicBucket,
  toNcertSourceRef,
} from '@/lib/ncert/catalog';
import { compactNcertText, readNcertChapterText } from '@/lib/ncert/storage';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const path = url.searchParams.get('path')?.trim() ?? '';
  const includeText = url.searchParams.get('includeText') === '1';

  if (!path) {
    return apiError('MISSING_REQUIRED_FIELD', 400, 'Missing chapter path');
  }

  const chapter = findNcertChapterByPath(path);
  if (!chapter) {
    return apiError('ASSET_NOT_FOUND', 404, 'NCERT chapter not found');
  }

  const bucket = getNcertTopicBucket(chapter.topic_bucket);
  const progressionSiblings = (bucket?.chapters ?? []).map(toNcertSourceRef);

  let textExcerpt: string | undefined;
  if (includeText) {
    const raw = await readNcertChapterText(chapter.relative_path);
    if (raw) {
      textExcerpt = compactNcertText(raw, 6000);
    }
  }

  return apiSuccess({
    chapter,
    sourceRef: toNcertSourceRef(chapter),
    topicBucket: bucket
      ? {
          bucketName: bucket.bucket_name,
          subjectDomain: bucket.subject_domain,
          description: bucket.description,
          classProgression: bucket.class_progression,
          classesCovered: bucket.classes_covered,
        }
      : null,
    progressionSiblings,
    ...(textExcerpt !== undefined ? { textExcerpt } : {}),
  });
}
