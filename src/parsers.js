import pdf from 'pdf-parse';
import mammoth from 'mammoth';
import xlsx from 'xlsx';
import Tesseract from 'tesseract.js';
import { readFile } from 'fs/promises';

export async function parsePDF(path) {
  const buffer = await readFile(path);
  const data = await pdf(buffer);
  return data.text;
}

export async function parseDOCX(path) {
  const result = await mammoth.extractRawText({ path });
  return result.value;
}

export async function parseExcel(path) {
  const workbook = xlsx.readFile(path);
  return workbook.SheetNames.map(name => {
    const sheet = workbook.Sheets[name];
    return xlsx.utils.sheet_to_txt(sheet);
  }).join('\n\n');
}

export async function parseImage(path) {
  const { data: { text } } = await Tesseract.recognize(path, 'eng');
  return text;
}
