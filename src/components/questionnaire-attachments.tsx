"use client";
import { useState } from "react";
import { Download, FileText, X } from "lucide-react";
import type { QuestionnaireAttachment } from "@/lib/questionnaire/attachments";

export function QuestionnaireAttachments({ files, onDownload, downloadUrl, onRemove, disabled = false }: {
  files: QuestionnaireAttachment[]; onDownload?: (file: QuestionnaireAttachment) => Promise<void>;
  downloadUrl?: string; onRemove?: (pathname: string) => void; disabled?: boolean;
}) {
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState("");
  async function download(file: QuestionnaireAttachment) {
    if (!onDownload) return;
    setError(""); setDownloading(file.pathname);
    try { await onDownload(file); } catch { setError("לא ניתן להוריד את הקובץ כרגע. נסו שוב."); }
    finally { setDownloading(""); }
  }
  return <div className="mt-3 space-y-2">
    {files.map(file => <div key={file.pathname} className="flex min-w-0 items-center gap-2 border-b border-[#e4e7ec] py-2 text-sm">
      <FileText size={16} className="shrink-0 text-[#667085]" />
      <span dir="auto" className="min-w-0 flex-1 break-words">{file.name}</span>
      <span className="shrink-0 text-xs text-[#667085]"><bdi>{(file.size / 1048576).toFixed(1)} MB</bdi></span>
      {downloadUrl ? <a href={`${downloadUrl}?pathname=${encodeURIComponent(file.pathname)}`} aria-label={`הורדת ${file.name}`} title="הורדת הקובץ" className="p-2 text-[#087f72]"><Download size={16} /></a>
        : onDownload && <button type="button" disabled={disabled || Boolean(downloading)} onClick={() => void download(file)} aria-label={`הורדת ${file.name}`} title="הורדת הקובץ" className="p-2 text-[#087f72]"><Download size={16} /></button>}
      {onRemove && <button type="button" disabled={disabled} onClick={() => onRemove(file.pathname)} aria-label={`הסרת ${file.name}`} title="הסרת הקובץ מהתשובה" className="p-2 text-[#667085]"><X size={16} /></button>}
    </div>)}
    {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
  </div>;
}
