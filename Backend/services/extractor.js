const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const Tesseract = require('tesseract.js');

class DocumentExtractor {
  /**
   * Extract text from any supported file format
   * @param {string} filePath Absolute path to file
   * @param {string} mimeType MIME type or extension
   * @param {string} docType Optional document classification tag
   * @param {string} originalName Original filename from upload
   * @returns {Promise<{ text: string, charCount: number, method: string }>}
   */
  async extractText(filePath, mimeType, docType = '', originalName = '') {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found at path: ${filePath}`);
    }

    const fileName = originalName || path.basename(filePath);
    const ext = path.extname(filePath).toLowerCase();

    // If file is explicitly tagged as a damage photo with no registration mark, still do a quick scan for license plates
    const isPurePhoto = docType === 'DAMAGE_PHOTO' && /dent|scratch|stage|ri_photo|under_chassis|tyre|glass/i.test(fileName);
    if (isPurePhoto) {
      console.log(`[Extractor] Visual damage angle photo archived: ${fileName}`);
      return {
        text: `[Visual Damage Photo: ${fileName} - Preserved in Survey Repository]`,
        charCount: 0,
        method: 'visual_evidence_archived'
      };
    }


    try {
      if (ext === '.pdf') {
        return await this._extractPdf(filePath, fileName, docType);
      } else if (ext === '.docx' || ext === '.doc') {
        return await this._extractDocx(filePath);
      } else if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
        return await this._extractImageOcr(filePath);
      } else if (ext === '.txt') {
        const text = fs.readFileSync(filePath, 'utf8');
        return { text, charCount: text.length, method: 'plain_text' };
      } else {
        // Fallback reading
        const text = fs.readFileSync(filePath, 'utf8');
        return { text, charCount: text.length, method: 'fallback_raw' };
      }
    } catch (err) {
      console.warn(`Extraction warning for ${path.basename(filePath)} (${ext}):`, err.message);
      return {
        text: '',
        charCount: 0,
        method: 'failed',
        error: err.message
      };
    }
  }

  async _extractPdf(filePath, fileName = '', docType = '') {
    const dataBuffer = fs.readFileSync(filePath);
    let cleanText = '';
    let pageCount = 1;

    try {
      if (typeof pdfParse === 'function') {
        const data = await pdfParse(dataBuffer);
        cleanText = (data.text || '').replace(/\r\n/g, '\n').trim();
        pageCount = data.numpages || 1;
      } else if (pdfParse && (pdfParse.PDFParse || typeof pdfParse === 'object')) {
        const ParserClass = pdfParse.PDFParse || pdfParse.default?.PDFParse;
        if (ParserClass) {
          const parser = new ParserClass(new Uint8Array(dataBuffer));
          await parser.load();
          const textRes = await parser.getText();
          cleanText = (textRes.text || '').replace(/\r\n/g, '\n').trim();
          pageCount = textRes.total || (textRes.pages ? textRes.pages.length : 1);

          // Check if this is a scanned PDF with minimal or no selectable text
          const cleanAlphanumeric = cleanText.replace(/[^a-zA-Z0-9]/g, '');
          if (cleanAlphanumeric.length < 60) {
            // Fast skip if this PDF is a photo dump (e.g. Initial photos.pdf, Stage and RI photos.pdf)
            if (this._isVisualEvidenceOrVoucher(fileName, docType)) {
              console.log(`[Extractor] Scanned bitmap PDF is damage photo archive (${fileName}), skipping embedded OCR.`);
              return {
                text: `[Visual Photo Document: ${fileName} - Preserved in Survey Repository]`,
                charCount: 0,
                pageCount: pageCount,
                method: 'visual_evidence_archived'
              };
            }

            console.log(`[Extractor] Scanned bitmap PDF detected (${cleanAlphanumeric.length} chars) in ${path.basename(filePath)}. Running rapid OCR on primary pages...`);
            const ocrResult = await this._extractPdfImageOcr(parser, filePath);
            if (ocrResult.text && ocrResult.text.length > cleanText.length) {
              cleanText = ocrResult.text;
              return {
                text: cleanText,
                charCount: cleanText.length,
                pageCount: pageCount,
                method: 'pdf_image_ocr'
              };
            }
          }
        }
      }
    } catch (parseErr) {
      console.warn(`PDFParse internal error for ${path.basename(filePath)}:`, parseErr.message);
    }

    return {
      text: cleanText,
      charCount: cleanText.length,
      pageCount: pageCount,
      method: 'pdf_parse'
    };
  }

  async _extractPdfImageOcr(parser, filePath) {
    try {
      if (typeof parser.getImage !== 'function') {
        return { text: '' };
      }
      const imgRes = await parser.getImage();
      if (!imgRes || !imgRes.pages || imgRes.pages.length === 0) {
        return { text: '' };
      }

      let totalOcrText = '';
      // Limit OCR to at most the first 2 pages where crucial vehicle particulars reside
      const maxPages = Math.min(imgRes.pages.length, 2);

      for (let i = 0; i < maxPages; i++) {
        const page = imgRes.pages[i];
        if (page.images && page.images.length > 0) {
          // Find the largest image on this page (the document scan) rather than small icons
          const validImages = [];
          for (const img of page.images) {
            if (img.dataUrl && img.dataUrl.includes(',')) {
              const b64 = img.dataUrl.split(',')[1];
              const imgBuf = Buffer.from(b64, 'base64');
              if (imgBuf.length > 10000) { // At least 10KB
                validImages.push({ imgBuf, size: imgBuf.length });
              }
            }
          }

          // Sort by size descending, take top 1 scan image
          validImages.sort((a, b) => b.size - a.size);
          const topImages = validImages.slice(0, 1);

          for (let j = 0; j < topImages.length; j++) {
            const { imgBuf } = topImages[j];
            console.log(`[Extractor OCR] Fast-scanning main document image on page ${i + 1} of ${path.basename(filePath)} (${imgBuf.length} bytes)...`);
            const { data } = await Tesseract.recognize(imgBuf, 'eng');
            if (data.text) {
              totalOcrText += `\n--- [PAGE ${i + 1}] ---\n` + data.text.trim() + '\n';
            }
          }
        }
      }

      return {
        text: totalOcrText.trim(),
        charCount: totalOcrText.trim().length,
        method: 'tesseract_pdf_image_ocr'
      };
    } catch (err) {
      console.warn(`[Extractor] PDF Image OCR failed for ${path.basename(filePath)}:`, err.message);
      return { text: '' };
    }
  }

  async _extractDocx(filePath) {
    const result = await mammoth.extractRawText({ path: filePath });
    const cleanText = (result.value || '').replace(/\r\n/g, '\n').trim();
    return {
      text: cleanText,
      charCount: cleanText.length,
      method: 'mammoth_docx'
    };
  }

  async _extractImageOcr(filePath) {
    console.log(`Starting OCR on image document: ${path.basename(filePath)}`);
    const { data } = await Tesseract.recognize(filePath, 'eng');
    const cleanText = (data.text || '').replace(/\r\n/g, '\n').trim();
    return {
      text: cleanText,
      charCount: cleanText.length,
      confidence: data.confidence,
      method: 'tesseract_ocr'
    };
  }

  /**
   * Identifies visual damage photos, vouchers, banking slips, and non-driver identity cards
   * to immediately bypass expensive multi-minute OCR routines while keeping files attached to survey.
   */
  _isVisualEvidenceOrVoucher(fileName = '', docType = '') {
    const lower = (fileName || '').toLowerCase();
    
    // Explicit doc types that never contain vehicle specs
    if (docType === 'DAMAGE_PHOTO' || docType === 'PAYMENT_VOUCHER' || docType === 'ID_PROOF') {
      return true;
    }
    
    // Never skip authoritative certificates, extracts, or vehicle records
    if (/(?:certificate|extract|policy|licen|regn|registration|rc_|dl_|fir|police|invoice|bill|assessment|estimate|statement|claim)/i.test(lower)) {
      if (!/photo/i.test(lower)) {
        return false;
      }
    }

    // Vehicle damage photos & inspection angles
    const photoPatterns = [
      /\b(?:photo|photos|pic|pics|image|images)\b/i,
      /(?:front|rear|side|dent|scratch|stage|ri_photo|damage|under_chassis|chassis_emboss|lh_|rh_|bumper|bonnet|dicky|boot|door|tyre|tire|glass|windshield|headlamp|tail_lamp)/i,
      /^\s*\d+[\._\-\s]*(?:front|rear|side|dent|photo|damage)/i
    ];
    for (const p of photoPatterns) {
      if (p.test(lower)) return true;
    }

    // Banking, payment vouchers, cheque leaves, neft slips
    const voucherPatterns = [
      /\b(?:cheque|receipt|voucher|neft|rtgs|cash|passbook|bank_slip|bill_cash|satisfaction)\b/i,
      /(?:cancelled_cheque|cash_receipt|satisfaction_voucher|repairer_neft)/i
    ];
    for (const p of voucherPatterns) {
      if (p.test(lower)) return true;
    }

    // Non-driver identity cards (Aadhaar, PAN, KYC)
    if (/(?:aadhar|aadhaar|pancard|pan_card|kyc)/i.test(lower)) {
      return true;
    }

    return false;
  }
}

module.exports = new DocumentExtractor();
