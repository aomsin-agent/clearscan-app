import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Copy,
  Check,
  FileText,
  FileJson,
  FileImage,
  File as FileIcon,
  Download,
  ArrowLeft,
  Terminal,
  Code2,
  FileCode,
  Files as FilesIcon,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { PythonApiResult, PythonApiFile } from "@/lib/ocr-client";

function fileIcon(mime: string) {
  if (mime.startsWith("image/")) return FileImage;
  if (mime.includes("json")) return FileJson;
  if (mime.includes("markdown") || mime.includes("text")) return FileText;
  return FileIcon;
}

function formatBytes(b?: number) {
  if (b == null) return "";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

function FilePreview({ file, onBack }: { file: PythonApiFile; onBack: () => void }) {
  const [textBody, setTextBody] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const isImage = file.mime.startsWith("image/");
  const isText =
    !isImage &&
    (file.mime.includes("json") ||
      file.mime.includes("text") ||
      file.mime.includes("markdown") ||
      /\.(json|md|txt|log|csv|yaml|yml|html?)$/i.test(file.name));

  useMemo(() => {
    if (!isText) return;
    setLoading(true);
    fetch(file.url)
      .then((r) => r.text())
      .then((t) => setTextBody(t))
      .catch(() => setTextBody(`Failed to load ${file.name}`))
      .finally(() => setLoading(false));
  }, [file.url, isText, file.name]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <Button variant="ghost" size="sm" className="h-7" onClick={onBack}>
            <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Files
          </Button>
          <span className="truncate text-sm font-medium text-foreground">{file.name}</span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {file.mime} {file.size != null && `· ${formatBytes(file.size)}`}
          </span>
        </div>
        <a href={file.url} download={file.name} target="_blank" rel="noreferrer">
          <Button variant="outline" size="sm" className="h-7">
            <Download className="mr-1 h-3.5 w-3.5" /> Download
          </Button>
        </a>
      </div>
      <div className="flex-1 overflow-auto bg-muted/10 p-4">
        {isImage && (
          <div className="flex h-full items-center justify-center">
            <img
              src={file.url}
              alt={file.name}
              className="max-h-[520px] w-auto rounded-md shadow-sm"
            />
          </div>
        )}
        {isText && (
          <pre className="overflow-auto rounded-md border bg-background p-3 font-mono text-xs">
            {loading ? "Loading…" : textBody ?? ""}
          </pre>
        )}
        {!isImage && !isText && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
            <FileIcon className="h-10 w-10" />
            <p>Preview not available for this file type.</p>
            <a href={file.url} download={file.name} target="_blank" rel="noreferrer">
              <Button size="sm" variant="outline">
                <Download className="mr-1 h-3.5 w-3.5" /> Download to view
              </Button>
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

export function PythonApiResultPanel({
  result,
  onValidateAgain,
  submitting,
}: {
  result: PythonApiResult;
  onValidateAgain: () => void;
  submitting: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [selectedFile, setSelectedFile] = useState<PythonApiFile | null>(null);

  const copyMd = async () => {
    try {
      await navigator.clipboard.writeText(result.markdown);
      setCopied(true);
      toast.success("Markdown copied");
      setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Could not copy");
    }
  };

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Terminal className="h-4 w-4" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Python container output</p>
            <p className="text-[11px] text-muted-foreground">
              {result.files.length} file{result.files.length === 1 ? "" : "s"} · markdown{" "}
              {result.markdown.length} chars · stdout {result.stdout.length} chars
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onValidateAgain}
          disabled={submitting}
        >
          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${submitting ? "animate-spin" : ""}`} />
          Run again
        </Button>
      </div>

      <Tabs defaultValue="html" className="w-full">
        <TabsList className="mx-4 mt-3 grid w-[calc(100%-2rem)] grid-cols-4">
          <TabsTrigger value="html">
            <FileCode className="mr-1.5 h-3.5 w-3.5" /> HTML
          </TabsTrigger>
          <TabsTrigger value="markdown">
            <FileText className="mr-1.5 h-3.5 w-3.5" /> Markdown
          </TabsTrigger>
          <TabsTrigger value="files">
            <FilesIcon className="mr-1.5 h-3.5 w-3.5" /> Files
            {result.files.length > 0 && (
              <span className="ml-1.5 rounded-full bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">
                {result.files.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="stdout">
            <Code2 className="mr-1.5 h-3.5 w-3.5" /> Stdout
          </TabsTrigger>
        </TabsList>

        {/* HTML */}
        <TabsContent value="html" className="m-0 p-4">
          {result.html ? (
            <iframe
              title="Python container HTML output"
              srcDoc={result.html}
              sandbox=""
              className="h-[560px] w-full rounded-md border bg-white"
            />
          ) : (
            <EmptyState
              icon={FileCode}
              title="No HTML returned"
              message="The container did not include an `html` field in the response."
            />
          )}
        </TabsContent>

        {/* Markdown */}
        <TabsContent value="markdown" className="m-0 p-4">
          {result.markdown ? (
            <div className="flex h-[560px] flex-col">
              <div className="mb-2 flex justify-end">
                <Button size="sm" variant={copied ? "secondary" : "default"} onClick={copyMd}>
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
              <div className="prose prose-sm dark:prose-invert max-w-none flex-1 overflow-auto rounded-md border bg-background p-4">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{result.markdown}</ReactMarkdown>
              </div>
            </div>
          ) : (
            <EmptyState
              icon={FileText}
              title="No markdown returned"
              message="The container did not include a `markdown` field in the response."
            />
          )}
        </TabsContent>

        {/* Files */}
        <TabsContent value="files" className="m-0 p-4">
          <div className="h-[560px] overflow-hidden rounded-md border">
            {selectedFile ? (
              <FilePreview file={selectedFile} onBack={() => setSelectedFile(null)} />
            ) : result.files.length === 0 ? (
              <EmptyState
                icon={FilesIcon}
                title="No output files"
                message="The container did not include a `files` array in the response."
              />
            ) : (
              <div className="grid h-full grid-cols-2 gap-3 overflow-auto p-4 sm:grid-cols-3 lg:grid-cols-4">
                {result.files.map((f) => {
                  const Icon = fileIcon(f.mime);
                  return (
                    <button
                      key={f.url}
                      type="button"
                      onClick={() => setSelectedFile(f)}
                      className="flex flex-col items-start gap-2 rounded-lg border bg-card p-3 text-left transition hover:border-primary hover:bg-accent/30"
                    >
                      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted text-muted-foreground">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 self-stretch">
                        <p className="truncate text-sm font-medium text-foreground">{f.name}</p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {f.mime}
                          {f.size != null && ` · ${formatBytes(f.size)}`}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </TabsContent>

        {/* Stdout */}
        <TabsContent value="stdout" className="m-0 p-4">
          {result.stdout ? (
            <pre className="h-[560px] overflow-auto rounded-md border bg-black/90 p-4 font-mono text-xs leading-relaxed text-emerald-300">
              {result.stdout}
            </pre>
          ) : (
            <EmptyState
              icon={Code2}
              title="No stdout captured"
              message="The container did not include a `stdout` field in the response."
            />
          )}
        </TabsContent>
      </Tabs>
    </Card>
  );
}

function EmptyState({
  icon: Icon,
  title,
  message,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  message: string;
}) {
  return (
    <div className="flex h-[560px] flex-col items-center justify-center gap-2 rounded-md border border-dashed bg-muted/20 p-6 text-center">
      <Icon className="h-10 w-10 text-muted-foreground/60" />
      <p className="text-sm font-semibold text-foreground">{title}</p>
      <p className="max-w-sm text-xs text-muted-foreground">{message}</p>
    </div>
  );
}
