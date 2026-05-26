import { useCallback, useEffect, useState } from "react";
import { useDropzone } from "react-dropzone";
import {
  Upload,
  FileText,
  Copy,
  Check,
  X,
  Info,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Webhook,
  Server,
  RefreshCw,
  Link2,
  Plug,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Settings,
  ChevronDown,
  PlayCircle,
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Spinner } from "./Spinner";
import {
  fileToDataUrl,
  formatBytes,
  readImageMeta,
  renderPdfPages,
  type FileMeta,
} from "@/lib/file-utils";
import { runOcr, runWebhookOcr, testWebhook } from "@/lib/ocr.functions";
import { runSelfHostedOcr, testSelfHostedEndpoint } from "@/lib/ocr-client";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";

type Status = "idle" | "processing" | "done" | "error";
type Engine = "lovable" | "webhook" | "selfhosted";

interface VarOption {
  var_id: string;
  variable: string | null;
  description: string | null;
  category: string | null;
}

const ENGINE_CATEGORY: Record<Engine, string | null> = {
  lovable: null,
  webhook: "webhook",
  selfhosted: "python-api",
};

const ENGINE_LABEL: Record<Engine, string> = {
  lovable: "Lovable AI Gateway",
  webhook: "Webhook URL",
  selfhosted: "Self-hosted (Docker)",
};

export function OcrPanel() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pdfPages, setPdfPages] = useState<string[]>([]);
  const [pdfPageIdx, setPdfPageIdx] = useState(0);
  const [meta, setMeta] = useState<FileMeta>(null);
  const [text, setText] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<"preview" | "raw">("preview");
  // Intention: hard UI lock during an in-flight request. `status` already
  // tracks the lifecycle for display, but `submitting` is the authoritative
  // input-disabled flag that prevents duplicate network calls / race
  // conditions while the connection is held open.
  const [submitting, setSubmitting] = useState(false);

  const [engine, setEngine] = useState<Engine>("lovable");
  const [variables, setVariables] = useState<VarOption[]>([]);
  const [varsLoading, setVarsLoading] = useState(false);
  const [selectedVarId, setSelectedVarId] = useState<string>("");

  const runOcrFn = useServerFn(runOcr);
  const runWebhookFn = useServerFn(runWebhookOcr);
  const testWebhookFn = useServerFn(testWebhook);

  type TestResult = { ok: boolean; status: number; latencyMs: number; error: string | null };
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(true);



  const loadVariables = useCallback(async () => {
    setVarsLoading(true);
    const requiredCategory = ENGINE_CATEGORY[engine];
    let query = supabase
      .from("variable")
      .select("var_id,variable,description,category")
      .order("created_at", { ascending: false });
    if (requiredCategory) query = query.eq("category", requiredCategory);
    const { data, error } = await query;
    setVarsLoading(false);
    if (error) {
      toast.error("Failed to load variables");
      return;
    }
    setVariables(data ?? []);
  }, [engine]);

  useEffect(() => {
    loadVariables();
  }, [loadVariables]);

  const selectedVar = variables.find((v) => v.var_id === selectedVarId);
  const needsVariable = engine !== "lovable";
  const canRun = !needsVariable || !!selectedVar?.description?.trim();

  // Reset test result + reopen settings when variable/engine changes
  useEffect(() => {
    setTestResult(null);
    setSettingsOpen(true);
  }, [selectedVarId, engine]);

  // Auto-collapse settings after successful test
  useEffect(() => {
    if (testResult?.ok) {
      const t = setTimeout(() => setSettingsOpen(false), 600);
      return () => clearTimeout(t);
    }
  }, [testResult]);

  const runConnectionTest = useCallback(async () => {
    const url = selectedVar?.description?.trim();
    if (!url) return;
    setTesting(true);
    setTestResult(null);
    try {
      const result =
        engine === "webhook"
          ? await testWebhookFn({ data: { url } })
          : await testSelfHostedEndpoint({ url });
      setTestResult(result);
      if (result.ok) {
        toast.success(`Endpoint reachable (${result.status}) in ${result.latencyMs}ms`);
      } else {
        toast.error(result.error ?? "Endpoint test failed");
      }
    } finally {
      setTesting(false);
    }
  }, [engine, selectedVar, testWebhookFn]);



  const reset = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(null);
    setPreviewUrl(null);
    setPdfPages([]);
    setPdfPageIdx(0);
    setMeta(null);
    setText("");
    setStatus("idle");
    setCopied(false);
  }, [previewUrl]);

  const handleSubmit = useCallback(
    async (f: File) => {
      // Intention: clear any previous run, then immediately flip the UI
      // into a locked "submitting" state so the dropzone and action
      // buttons cannot fire a second request while this one is in flight.
      reset();
      setFile(f);
      setStatus("processing");
      setSubmitting(true);

      try {
        // Intention: render a local preview for the user regardless of
        // which engine we ship the bytes to. For PDFs we also rasterize
        // pages because the Lovable AI engine consumes images.
        let lovableImages: string[] = [];
        if (f.type.startsWith("image/")) {
          setPreviewUrl(URL.createObjectURL(f));
          const m = await readImageMeta(f);
          setMeta(m);
          if (engine === "lovable") {
            lovableImages = [await fileToDataUrl(f)];
          }
        } else if (f.type === "application/pdf") {
          const { dataUrls, pageCount } = await renderPdfPages(f);
          setMeta({ kind: "pdf", pageCount });
          setPdfPages(dataUrls);
          if (engine === "lovable") {
            lovableImages = dataUrls;
          }
        } else {
          throw new Error("Unsupported file type");
        }

        let result: { text: string };
        if (engine === "lovable") {
          result = await runOcrFn({ data: { images: lovableImages } });
        } else if (engine === "webhook") {
          // Server-side multipart fan-out. We base64-encode ONCE just to
          // cross the TanStack RPC boundary (which can't transport File);
          // the server decodes it and forwards raw bytes as multipart, so
          // the webhook never sees base64.
          const url = selectedVar?.description?.trim();
          if (!url) throw new Error("Select a variable that contains the endpoint URL");
          const fileBase64 = await fileToDataUrl(f);
          result = await runWebhookFn({
            data: {
              url,
              fileName: f.name,
              fileType: f.type || "application/octet-stream",
              fileSize: f.size,
              fileBase64,
            },
          });
        } else {
          // Self-hosted Docker path — POST multipart/form-data straight
          // from the browser so the request can reach http://localhost.
          // Expected response: { status: "success", markdown: "..." }
          const url = selectedVar?.description?.trim();
          if (!url) throw new Error("Select a variable that contains BACKEND_API_URL");
          result = await runSelfHostedOcr({ url, file: f });
        }

        // Intention: render extracted text and persist a history entry.
        setText(result.text);
        setStatus("done");

        await supabase.from("ocr_history").insert({
          file_name: f.name,
          file_type: f.type || "unknown",
          file_size: f.size,
          extracted_text: `[${ENGINE_LABEL[engine]}]\n\n${result.text}`,
        });
      } catch (e) {
        console.error(e);
        const msg = e instanceof Error ? e.message : "OCR failed";
        toast.error(msg);
        setStatus("error");
      } finally {
        // Intention: always release the UI lock, even on error, so the
        // user can retry without reloading the page.
        setSubmitting(false);
      }
    },
    [reset, runOcrFn, runWebhookFn, engine, selectedVar],
  );

  const onDrop = useCallback(
    (accepted: File[]) => {
      if (submitting) return;
      if (!canRun) {
        toast.error("Select a variable first");
        return;
      }
      if (accepted[0]) handleSubmit(accepted[0]);
    },
    [handleSubmit, canRun, submitting],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    disabled: !canRun || submitting,
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

  const NoticeBanner = (
    <TooltipProvider delayDuration={150}>
      <div className="flex items-center justify-center gap-2 rounded-full border bg-accent/40 px-3 py-1.5 text-xs text-muted-foreground">
        <Sparkles className="h-3.5 w-3.5 text-primary" />
        <span>
          OCR engine: <span className="font-medium text-foreground">{ENGINE_LABEL[engine]}</span>
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={(e) => e.stopPropagation()}
              className="text-muted-foreground/80 hover:text-foreground"
              aria-label="Engine details"
            >
              <Info className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs text-xs leading-relaxed">
            {engine === "lovable" &&
              "OCR powered by Lovable AI Gateway (Google Gemini 2.5 Flash vision). Files are sent to Lovable's AI provider for text extraction."}
            {engine === "webhook" &&
              "Files are POSTed (server-side) to the URL stored in the selected variable. The endpoint must respond with { text: \"...\" } or plain text."}
            {engine === "selfhosted" &&
              "Files are POSTed from your browser to the URL in the selected variable (e.g. a local Docker container). Your container must enable CORS."}
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );

  const EngineSelector = (
    <Card className="space-y-4 p-4">
      <div>
        <Label className="text-sm font-medium">OCR Engine</Label>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {(
            [
              { id: "lovable" as const, icon: Sparkles, label: "Lovable AI", sub: "Gemini Flash" },
              { id: "webhook" as const, icon: Webhook, label: "Webhook", sub: "External URL" },
              { id: "selfhosted" as const, icon: Server, label: "Self-hosted", sub: "Docker / localhost" },
            ]
          ).map(({ id, icon: Icon, label, sub }) => {
            const active = engine === id;
            return (
              <button
                key={id}
                type="button"
                disabled={submitting}
                onClick={() => {
                  setEngine(id);
                  setSelectedVarId("");
                  reset();
                }}
                className={`flex items-start gap-3 rounded-lg border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
                  active
                    ? "border-primary bg-accent/40 shadow-sm"
                    : "border-border hover:border-primary/50 hover:bg-accent/20"
                }`}
              >
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${
                    active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{label}</p>
                  <p className="text-xs text-muted-foreground">{sub}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {needsVariable && (
        <Collapsible
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          className="overflow-hidden rounded-xl border bg-card"
        >
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-accent/30"
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                  <Settings className="h-3.5 w-3.5" />
                </div>
                <div className="flex min-w-0 items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">
                    Endpoint settings
                  </span>
                  <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                    {ENGINE_CATEGORY[engine]}
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {!settingsOpen && (
                  <div className="flex items-center gap-1.5 text-xs">
                    <span
                      className={`h-2 w-2 rounded-full ${
                        testResult?.ok
                          ? "bg-emerald-500"
                          : testResult && !testResult.ok
                            ? "bg-destructive"
                            : selectedVar?.description?.trim()
                              ? "bg-amber-500"
                              : "bg-muted-foreground/40"
                      }`}
                    />
                    <span className="max-w-[160px] truncate font-medium text-foreground">
                      {selectedVar?.variable ?? "Not selected"}
                    </span>
                  </div>
                )}
                <ChevronDown
                  className={`h-4 w-4 text-muted-foreground transition-transform ${
                    settingsOpen ? "rotate-180" : ""
                  }`}
                />
              </div>
            </button>
          </CollapsibleTrigger>

          <CollapsibleContent>
            <div className="space-y-3 border-t px-4 py-3">
              {/* Action row: dropdown + refresh + test + status */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="min-w-[200px] flex-1">
                  <Select
                    value={selectedVarId}
                    onValueChange={setSelectedVarId}
                    disabled={submitting}
                  >
                    <SelectTrigger className="h-10 bg-background">
                      <SelectValue
                        placeholder={
                          variables.length === 0
                            ? `No "${ENGINE_CATEGORY[engine]}" variables`
                            : "Select a variable…"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {variables.map((v) => (
                        <SelectItem
                          key={v.var_id}
                          value={v.var_id}
                          disabled={!v.description?.trim()}
                        >
                          {v.variable ?? "(unnamed)"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="group h-10 w-10 shrink-0"
                  onClick={loadVariables}
                  disabled={varsLoading || submitting}
                  title="Refresh variables"
                >
                  <RefreshCw
                    className={`h-4 w-4 transition-transform duration-500 group-hover:rotate-180 ${
                      varsLoading ? "animate-spin" : ""
                    }`}
                  />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-10 shrink-0"
                  onClick={runConnectionTest}
                  disabled={!selectedVar?.description?.trim() || testing || submitting}
                >
                  {testing ? (
                    <>
                      <RefreshCw className="mr-1 h-3.5 w-3.5 animate-spin" />
                      Testing…
                    </>
                  ) : (
                    <>
                      <Plug className="mr-1 h-3.5 w-3.5" />
                      Test
                    </>
                  )}
                </Button>
                {testResult && !testing && (
                  <div
                    className={`flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs ${
                      testResult.ok
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        : "border-destructive/30 bg-destructive/10 text-destructive"
                    }`}
                  >
                    {testResult.ok ? (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    ) : (
                      <AlertCircle className="h-3.5 w-3.5" />
                    )}
                    <span className="font-medium">
                      {testResult.ok
                        ? `${testResult.status} · ${testResult.latencyMs}ms`
                        : testResult.error ?? "Failed"}
                    </span>
                  </div>
                )}
              </div>

              {/* Current value (compact, inline) */}
              <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-2.5 py-2">
                <Link2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                {selectedVar?.description?.trim() ? (
                  <code className="min-w-0 flex-1 truncate font-mono text-xs font-medium text-primary">
                    {selectedVar.description}
                  </code>
                ) : (
                  <span className="flex-1 text-xs italic text-muted-foreground">
                    No variable selected
                  </span>
                )}
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    selectedVar?.description?.trim()
                      ? "bg-emerald-500"
                      : "bg-muted-foreground/40"
                  }`}
                />
              </div>
            </div>

            <div className="flex items-center gap-2 border-t bg-muted/30 px-4 py-2">
              <Info className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="text-[11px] text-muted-foreground">
                Manage variables in the{" "}
                <span className="font-medium text-foreground">Variables</span> tab
              </span>
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </Card>
  );

  if (!file) {
    return (
      <div className="space-y-4">
        <div className="flex justify-center">{NoticeBanner}</div>
        {EngineSelector}
        <div
          {...getRootProps()}
          className={`group relative flex min-h-[340px] flex-col items-center justify-center rounded-3xl border-2 border-dashed bg-card p-12 text-center transition-all ${
            !canRun
              ? "cursor-not-allowed opacity-60"
              : isDragActive
                ? "cursor-pointer border-primary bg-accent/40 scale-[1.01]"
                : "cursor-pointer border-border hover:border-primary/60 hover:bg-accent/20"
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
            {!canRun
              ? "Select a variable to continue"
              : isDragActive
                ? "Drop your file here"
                : "Drop a file or click to upload"}
          </h2>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            Images (PNG, JPG, WebP) and PDFs are supported.
          </p>
          <Button
            type="button"
            size="lg"
            className="mt-8 shadow-md"
            disabled={!canRun || submitting}
            onClick={(e) => e.stopPropagation()}
          >
            Browse files
          </Button>
        </div>
      </div>
    );
  }

  const isImage = file.type.startsWith("image/");
  const isPdf = file.type === "application/pdf";
  const currentPdfPage = pdfPages[pdfPageIdx];

  return (
    <div className="space-y-6">
      <div className="flex justify-center">{NoticeBanner}</div>
      {EngineSelector}

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
        <Button variant="outline" size="sm" onClick={reset} disabled={submitting}>
          <X className="mr-1 h-4 w-4" />
          Clear
        </Button>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b bg-muted/40 px-4 py-2">
            <span className="text-sm font-medium text-muted-foreground">Preview</span>
            {isPdf && pdfPages.length > 1 && (
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setPdfPageIdx((i) => Math.max(0, i - 1))}
                  disabled={pdfPageIdx === 0}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-xs text-muted-foreground">
                  {pdfPageIdx + 1} / {pdfPages.length}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setPdfPageIdx((i) => Math.min(pdfPages.length - 1, i + 1))}
                  disabled={pdfPageIdx >= pdfPages.length - 1}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
          <div className="flex max-h-[520px] items-center justify-center overflow-auto bg-muted/20 p-4">
            {isImage && previewUrl && (
              <img
                src={previewUrl}
                alt={file.name}
                className="max-h-[480px] w-auto rounded-lg object-contain shadow-sm"
              />
            )}
            {isPdf && currentPdfPage && (
              <img
                src={currentPdfPage}
                alt={`${file.name} — page ${pdfPageIdx + 1}`}
                className="max-h-[480px] w-auto rounded-lg object-contain shadow-sm"
              />
            )}
            {isPdf && !currentPdfPage && status === "processing" && (
              <div className="flex h-[440px] items-center justify-center">
                <Spinner />
              </div>
            )}
          </div>
        </Card>

        <Card className="flex flex-col overflow-hidden">
          <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-4 py-2">
            <span className="text-sm font-medium text-muted-foreground">Extracted text</span>
            <div className="flex items-center gap-1.5">
              <div className="flex rounded-md border bg-background p-0.5">
                <button
                  type="button"
                  onClick={() => setViewMode("preview")}
                  disabled={status !== "done" || !text}
                  className={`rounded px-2 py-1 text-xs font-medium transition disabled:opacity-50 ${
                    viewMode === "preview"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Preview
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("raw")}
                  disabled={status !== "done" || !text}
                  className={`rounded px-2 py-1 text-xs font-medium transition disabled:opacity-50 ${
                    viewMode === "raw"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Raw
                </button>
              </div>
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
          </div>
          <div className="relative flex-1 p-4">
            {status === "processing" && (
              <div className="flex h-[440px] flex-col items-center justify-center gap-4">
                <Spinner />
                <p className="text-sm text-muted-foreground">
                  {engine === "selfhosted"
                    ? "Uploading to self-hosted container and waiting for OCR result…"
                    : `Waiting for response from ${ENGINE_LABEL[engine]}…`}
                </p>
              </div>
            )}
            {status !== "processing" && viewMode === "preview" && text && (
              <div className="prose prose-sm dark:prose-invert h-[460px] max-w-none overflow-auto rounded-md border bg-background p-4">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
              </div>
            )}
            {status !== "processing" && (viewMode === "raw" || !text) && (
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={
                  status === "error"
                    ? "Something went wrong. Try another file or check the endpoint."
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
