import mammoth from "mammoth";
import * as XLSX from "xlsx";
import { GlobalWorkerOptions, getDocument } from "pdfjs-dist";
import pdfWorkerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

type ExtractedFile = {
  fileType: string;
  isImage: boolean;
  dataUrl?: string;
  content: string;
};

const OFFICE_MIME = new Set([
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
]);

function extOf(fileName: string) {
  return fileName.split(".").pop()?.toLowerCase() || "";
}

function normalizeType(file: File) {
  const ext = extOf(file.name);
  if (file.type) return file.type;
  if (ext === "pdf") return "application/pdf";
  if (ext === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (ext === "xlsx") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (ext === "xls") return "application/vnd.ms-excel";
  if (ext === "txt") return "text/plain";
  if (ext === "md") return "text/markdown";
  if (ext === "csv") return "text/csv";
  if (ext === "json") return "application/json";
  return "application/octet-stream";
}

async function imageToDataUrl(file: File) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error || new Error("Failed to read image"));
    reader.readAsDataURL(file);
  });
}

async function extractPdfText(file: File) {
  const buffer = await file.arrayBuffer();
  const pdf = await getDocument({ data: buffer }).promise;
  const pageCount = Math.min(pdf.numPages, 25);
  const pages: string[] = [];

  for (let i = 1; i <= pageCount; i++) {
    const page = await pdf.getPage(i);
    const text = await page.getTextContent();
    const pageText = text.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .trim();
    if (pageText) pages.push(`Page ${i}: ${pageText}`);
  }

  return pages.join("\n\n");
}

async function extractDocxText(file: File) {
  const buffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer: buffer });
  return result.value.trim();
}

async function extractSpreadsheetText(file: File) {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sections = workbook.SheetNames.map((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(sheet).trim();
    return `Sheet: ${sheetName}\n${csv}`;
  });
  return sections.join("\n\n").trim();
}

export async function extractFileForAnalysis(file: File): Promise<ExtractedFile> {
  const fileType = normalizeType(file);
  const extension = extOf(file.name);

  if (fileType.startsWith("image/")) {
    const dataUrl = await imageToDataUrl(file);
    return {
      fileType,
      isImage: true,
      dataUrl,
      content: dataUrl,
    };
  }

  if (fileType === "application/pdf" || extension === "pdf") {
    const text = await extractPdfText(file);
    if (!text) throw new Error("Could not extract text from this PDF. Try a text-based PDF.");
    return { fileType: "application/pdf", isImage: false, content: text };
  }

  if (fileType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || extension === "docx") {
    const text = await extractDocxText(file);
    if (!text) throw new Error("Could not extract text from this DOCX file.");
    return { fileType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", isImage: false, content: text };
  }

  if (OFFICE_MIME.has(fileType) || extension === "xls" || extension === "xlsx") {
    const text = await extractSpreadsheetText(file);
    if (!text) throw new Error("Could not extract data from this spreadsheet.");
    return { fileType, isImage: false, content: text };
  }

  // Text-like fallback
  if (fileType.startsWith("text/") || ["application/json", "application/xml"].includes(fileType)) {
    const text = await file.text();
    return { fileType, isImage: false, content: text };
  }

  throw new Error("This file type is not supported yet. Please upload PDF, DOCX, XLSX, images, or text files.");
}
