import { PDFParse } from 'pdf-parse';
import { ShowcaseError } from './service.js';
// Parse inert PDF text locally. No URL loading, execution, or provider transmission.
export async function extractPdf(encoded: string) {
  const bytes = Buffer.from(encoded, 'base64');
  if (
    bytes.length > 2 * 1024 * 1024 ||
    !bytes.subarray(0, 5).equals(Buffer.from('%PDF-'))
  )
    throw new ShowcaseError('INVALID_DOCUMENT');
  const parser = new PDFParse({ data: bytes, isEvalSupported: false });
  try {
    const result = await parser.getText({ first: 10 });
    if (!result.text.trim()) throw new ShowcaseError('DOCUMENT_REQUIRES_OCR');
    return {
      text: result.text.slice(0, 20000),
      pages: result.total,
      truncated: result.total > 10 || result.text.length > 20000,
    };
  } finally {
    await parser.destroy();
  }
}
