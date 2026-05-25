import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, FileText, Copy, Check, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Spinner } from "./Spinner";
import {
  fileToDataUrl,
  formatBytes,
  readImageMeta,
  renderPdfPages,
  type FileMeta,
} from "@/lib/file-utils";
import { runOcr } from "@/lib/ocr.functions";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";

type Status = "idle" | "processing" | "done" | "error";

export function OcrPanel() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [meta, setMeta] = useState<FileMeta>(null);
  const [text, setText] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [copied, setCopied] = useState(false);
  const runOcrFn = useServerFn(runOcr);

  const reset = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setPreviewUrl(null);
    setMeta(null);
    setText("");
    setStatus("idle");
    setCopied(false);
  }, [previewUrl]);

  const handleFile = useCallback(
    async (f: File) => {
      reset();
      setFile(f);
      setPreviewUrl(URL.createObjectURL(f));
      setStatus("processing");

      try {
        let images: string[] = [];
        if (f.type.startsWith("image/")) {
          const m = await readImageMeta(f);
          setMeta(m);
          images = [await fileToDataUrl(f)];
        } else if (f.type === "application/pdf") {
          const { dataUrls, pageCount } = await renderPdfPages(f);
          setMeta({ kind: "pdf", pageCount });
          images = dataUrls;
        } else {
          throw new Error("Unsupported file type");
        }

        const result = await runOcrFn({ data: { images } });
        setText(result.text);
        setStatus("done");

        await supabase.from("ocr_history").insert({
          file_name: f.name,
          file_type: f.type || "unknown",
          file_size: f.size,
          extracted_text: result.text,
        });
      } catch (e) {
        console.error(e);
        const msg = e instanceof Error ? e.message : "OCR failed";
        toast.error(msg);
        setStatus("error");
      }
    },
    [reset, runOcrFn],
  );

  const onDrop = useCallback(
    (accepted: File[]) => {
      if (accepted[0]) handleFile(accepted[0]);
    },
    [handleFile],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    accept: {
      "image/*": [".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp"],
      "application/pdf": [".pdf"],
    },
  });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Could not copy");
    }
  };

  if (!file) {
    return (
      <div
        {...getRootProps()}
        className={`group relative flex min-h-[420px] cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed bg-card p-12 text-center transition-all ${
          isDragActive
            ? "border-primary bg-accent/40 scale-[1.01]"
            : "border-border hover:border-primary/60 hover:bg-accent/20"
        }`}
        style={{ boxShadow: isDragActive ? "var(--shadow-elegant)" : undefined }}
      >
        <input {...getInputProps()} />
        <div
          className="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl text-primary-foreground transition-transform group-hover:scale-105"
          style={{ background: "var(--gradient-primary)" }}
        >
          <Upload className="h-9 w-9" />
        </div>
        <h2 className="text-2xl font-semibold text-foreground">
          {isDragActive ? "Drop your file here" : "Drop a file or click to upload"}
        </h2>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          Images (PNG, JPG, WebP) and PDFs are supported. We&apos;ll extract the text for you in seconds.
        </p>
        <Button
          type="button"
          size="lg"
          className="mt-8 shadow-md"
          onClick={(e) => e.stopPropagation()}
        >
          Browse files
        </Button>
      </div>
    );
  }

  const isImage = file.type.startsWith("image/");

  return (
    <div className="space-y-6">
      <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-primary">
            <FileText className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <p className="truncate font-semibold text-foreground">{file.name}</p>
            <p className="text-sm text-muted-foreground">
              {formatBytes(file.size)} · {file.type || "unknown"}
              {meta?.kind === "image" && ` · ${meta.width}×${meta.height}px`}
              {meta?.kind === "pdf" && ` · ${meta.pageCount} page${meta.pageCount === 1 ? "" : "s"}`}
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={reset}>
          <X className="mr-1 h-4 w-4" />
          Clear
        </Button>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <div className="border-b bg-muted/40 px-4 py-2 text-sm font-medium text-muted-foreground">
            Preview
          </div>
          <div className="flex max-h-[520px] items-center justify-center overflow-auto bg-muted/20 p-4">
            {isImage && previewUrl && (
              <img
                src={previewUrl}
                alt={file.name}
                className="max-h-[480px] w-auto rounded-lg object-contain shadow-sm"
              />
            )}
            {!isImage && previewUrl && (
              <iframe
                src={previewUrl}
                title={file.name}
                className="h-[480px] w-full rounded-lg border bg-background"
              />
            )}
          </div>
        </Card>

        <Card className="flex flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b bg-muted/40 px-4 py-2">
            <span className="text-sm font-medium text-muted-foreground">Extracted text</span>
            <Button
              size="sm"
              variant={copied ? "secondary" : "default"}
              disabled={status !== "done" || !text}
              onClick={copy}
            >
              {copied ? (
                <>
                  <Check className="mr-1 h-4 w-4" /> Copied
                </>
              ) : (
                <>
                  <Copy className="mr-1 h-4 w-4" /> Copy
                </>
              )}
            </Button>
          </div>
          <div className="relative flex-1 p-4">
            {status === "processing" && (
              <div className="flex h-[440px] flex-col items-center justify-center gap-4">
                <Spinner />
                <p className="text-sm text-muted-foreground">Extracting text…</p>
              </div>
            )}
            {status !== "processing" && (
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={
                  status === "error"
                    ? "Something went wrong. Try another file."
                    : "Extracted text will appear here."
                }
                className="h-[460px] resize-none font-mono text-sm"
              />
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
