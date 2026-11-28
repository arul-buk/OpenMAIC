import { basename } from 'node:path';
import { NextRequest } from 'next/server';
import { apiError } from '@/lib/server/api-response';
import { isValidNcertPdfPath } from '@/lib/ncert/catalog';
import { readNcertPdfBytes } from '@/lib/ncert/storage';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const path = url.searchParams.get('path')?.trim() ?? '';

  if (!path) {
    return apiError('MISSING_REQUIRED_FIELD', 400, 'Missing PDF path');
  }
  if (!isValidNcertPdfPath(path)) {
    return apiError('ASSET_NOT_FOUND', 404, 'NCERT PDF not found in catalog');
  }

  const bytes = await readNcertPdfBytes(path);
  if (!bytes) {
    return apiError(
      'ASSET_NOT_FOUND',
      404,
      'NCERT PDF file is not available in object storage yet',
    );
  }

  const filename = basename(path).replace(/[^A-Za-z0-9._-]/g, '_');

  return new Response(Buffer.from(bytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
      'Content-Length': String(bytes.byteLength),
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
