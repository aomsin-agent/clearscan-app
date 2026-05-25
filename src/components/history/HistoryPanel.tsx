import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { FileText, Image as ImageIcon, Inbox } from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { formatBytes } from "@/lib/file-utils";
import { toast } from "sonner";
import { Copy } from "lucide-react";

interface HistoryRow {
  id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  extracted_text: string;
  created_at: string;
}

// Module-level cache prevents skeleton flicker when switching tabs
let historyCache: HistoryRow[] | null = null;

export function HistoryPanel() {
  const [rows, setRows] = useState<HistoryRow[] | null>(historyCache);
  const [selected, setSelected] = useState<HistoryRow | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data, error } = await supabase
        .from("ocr_history")
        .select("id,file_name,file_type,file_size,extracted_text,created_at")
        .order("created_at", { ascending: false })
        .limit(100);
      if (!active) return;
      if (error) {
        toast.error("Failed to load history");
        if (!historyCache) setRows([]);
      } else {
        historyCache = data ?? [];
        setRows(historyCache);
      }
    })();
    return () => {
      active = false;
    };
  }, []);


  if (rows === null) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <Card className="flex flex-col items-center justify-center gap-3 p-16 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-primary">
          <Inbox className="h-7 w-7" />
        </div>
        <h3 className="text-lg font-semibold">No history yet</h3>
        <p className="max-w-sm text-sm text-muted-foreground">
          Run your first OCR from the OCR tab — extracted results will show up here automatically.
        </p>
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {rows.map((r) => {
          const isImage = r.file_type.startsWith("image/");
          const snippet = r.extracted_text.trim().slice(0, 140) || "(no text extracted)";
          return (
            <button
              key={r.id}
              onClick={() => setSelected(r)}
              className="block w-full text-left"
            >
              <Card className="flex items-center gap-4 p-4 transition hover:border-primary/50 hover:shadow-md">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-accent text-primary">
                  {isImage ? <ImageIcon className="h-6 w-6" /> : <FileText className="h-6 w-6" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="truncate font-medium text-foreground">{r.file_name}</p>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-sm text-muted-foreground">{snippet}</p>
                  <p className="mt-1 text-xs text-muted-foreground/70">
                    {formatBytes(r.file_size)} · {r.file_type || "unknown"}
                  </p>
                </div>
              </Card>
            </button>
          );
        })}
      </div>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="truncate">{selected?.file_name}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                {formatBytes(selected.file_size)} · {selected.file_type || "unknown"} ·{" "}
                {formatDistanceToNow(new Date(selected.created_at), { addSuffix: true })}
              </p>
              <Textarea
                value={selected.extracted_text}
                readOnly
                className="h-[420px] resize-none font-mono text-sm"
              />
              <div className="flex justify-end">
                <Button
                  onClick={async () => {
                    await navigator.clipboard.writeText(selected.extracted_text);
                    toast.success("Copied to clipboard");
                  }}
                >
                  <Copy className="mr-1 h-4 w-4" /> Copy text
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
