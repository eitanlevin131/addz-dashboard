import { inflateRawSync } from "node:zlib";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 5 * 1024 * 1024;

function cleanText(text: string) {
  return text
    .replace(/\u0000/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 40_000);
}

function stripXml(xml: string) {
  return cleanText(
    xml
      .replace(/<w:tab\/>/g, "\t")
      .replace(/<\/w:p>/g, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'"),
  );
}

function extractDocx(buffer: Buffer) {
  const parts: string[] = [];
  const eocdSignature = 0x06054b50;
  let eocdOffset = -1;

  for (let offset = buffer.length - 22; offset >= Math.max(0, buffer.length - 65557); offset -= 1) {
    if (buffer.readUInt32LE(offset) === eocdSignature) {
      eocdOffset = offset;
      break;
    }
  }

  if (eocdOffset < 0) return "";

  const centralDirectorySize = buffer.readUInt32LE(eocdOffset + 12);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  let cursor = centralDirectoryOffset;
  const end = centralDirectoryOffset + centralDirectorySize;

  while (cursor < end && buffer.readUInt32LE(cursor) === 0x02014b50) {
    const method = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const fileNameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localHeaderOffset = buffer.readUInt32LE(cursor + 42);
    const fileName = buffer.toString("utf8", cursor + 46, cursor + 46 + fileNameLength);

    if (fileName.startsWith("word/") && fileName.endsWith(".xml")) {
      const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
      const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
      const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
      const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
      const xml =
        method === 0
          ? compressed.toString("utf8")
          : method === 8
            ? inflateRawSync(compressed).toString("utf8")
            : "";
      if (xml) parts.push(stripXml(xml));
    }

    cursor += 46 + fileNameLength + extraLength + commentLength;
  }

  return cleanText(parts.join("\n\n"));
}

function unescapePdfString(value: string) {
  return value
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\n")
    .replace(/\\t/g, "\t")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\");
}

function extractPdf(buffer: Buffer) {
  const binary = buffer.toString("latin1");
  const snippets: string[] = [];
  const literalMatches = binary.matchAll(/\((?:\\.|[^\\)]){2,}\)\s*Tj/g);
  for (const match of literalMatches) {
    snippets.push(unescapePdfString(match[0].replace(/\)\s*Tj$/, "").slice(1)));
  }

  const arrayMatches = binary.matchAll(/\[([\s\S]*?)\]\s*TJ/g);
  for (const match of arrayMatches) {
    for (const inner of match[1].matchAll(/\((?:\\.|[^\\)]){2,}\)/g)) {
      snippets.push(unescapePdfString(inner[0].slice(1, -1)));
    }
  }

  if (snippets.length) return cleanText(snippets.join(" "));

  return cleanText(
    binary
      .replace(/[^\x20-\x7E\u0590-\u05FF\n]+/g, " ")
      .split(/\s+/)
      .filter((word) => word.length > 2)
      .join(" "),
  );
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ success: false, message: "לא התקבל קובץ." }, { status: 400 });
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ success: false, message: "הקובץ גדול מדי. עד 5MB." }, { status: 413 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const lowerName = file.name.toLowerCase();
  let content = "";

  if (lowerName.endsWith(".docx")) {
    content = extractDocx(buffer);
  } else if (lowerName.endsWith(".pdf")) {
    content = extractPdf(buffer);
  } else {
    content = cleanText(buffer.toString("utf8"));
  }

  if (!content || content.length < 20) {
    return NextResponse.json(
      {
        success: false,
        message: "לא הצלחתי לחלץ מספיק טקסט מהקובץ. נסה PDF טקסטואלי, DOCX, או הדבקה ידנית.",
      },
      { status: 422 },
    );
  }

  return NextResponse.json({
    success: true,
    data: {
      name: file.name,
      content,
      chars: content.length,
      createdAt: new Date().toISOString(),
    },
  });
}
