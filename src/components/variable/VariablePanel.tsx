import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Clock, Database } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { supabase } from "@/integrations/supabase/client";

interface Row {
  var_id: string;
  variable: string | null;
  description: string | null;
  created_at: string;
}

const PAGE_SIZE = 10;

// Module-level cache to avoid flicker when switching tabs
let rowsCache: Row[] | null = null;

export function VariablePanel() {
  const [rows, setRows] = useState<Row[] | null>(rowsCache);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Row | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Row | null>(null);

  const load = async () => {
    const { data, error } = await supabase
      .from("variable")
      .select("var_id,variable,description,created_at")
      .order("created_at", { ascending: false });
    if (error) {
      toast.error("Failed to load variables");
      if (!rowsCache) setRows([]);
    } else {
      rowsCache = data ?? [];
      setRows(rowsCache);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const pageCount = Math.max(1, Math.ceil((rows?.length ?? 0) / PAGE_SIZE));
  const paged = useMemo(() => {
    if (!rows) return [];
    const start = (page - 1) * PAGE_SIZE;
    return rows.slice(start, start + PAGE_SIZE);
  }, [rows, page]);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.from("variable").delete().eq("var_id", deleteTarget.var_id);
    if (error) {
      toast.error("Delete failed");
    } else {
      toast.success("Variable deleted");
      await load();
    }
    setDeleteTarget(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Variables</h2>
          <p className="text-sm text-muted-foreground">
            Manage your variables stored in Supabase.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="mr-1 h-4 w-4" /> Add new variable
        </Button>
      </div>

      <div className="space-y-2.5">
        {rows === null &&
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[88px] w-full rounded-xl" />
          ))}

        {rows !== null && paged.length === 0 && (
          <Card className="flex flex-col items-center justify-center gap-3 p-14 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-primary">
              <Database className="h-6 w-6" />
            </div>
            <h3 className="text-base font-semibold">No variables yet</h3>
            <p className="max-w-sm text-sm text-muted-foreground">
              Click <span className="font-medium text-foreground">Add new variable</span> to create your first entry.
            </p>
          </Card>
        )}

        {paged.map((r) => (
          <Card
            key={r.var_id}
            className="group p-4 transition hover:border-primary/50 hover:shadow-md"
          >
            {/* Line 1: variable name (full width) + actions */}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-semibold text-foreground">
                  {r.variable ?? "—"}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setEditing(r)}
                  aria-label="Edit"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  onClick={() => setDeleteTarget(r)}
                  aria-label="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {/* Line 2: description + created_at */}
            <div className="mt-1.5 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
              <p className="min-w-0 flex-1 text-sm text-muted-foreground">
                {r.description?.trim() || (
                  <span className="italic text-muted-foreground/60">No description</span>
                )}
              </p>
              <div className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground/80">
                <Clock className="h-3 w-3" />
                <span>{formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}</span>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {pageCount > 1 && (
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  setPage((p) => Math.max(1, p - 1));
                }}
              />
            </PaginationItem>
            {Array.from({ length: pageCount }).map((_, i) => (
              <PaginationItem key={i}>
                <PaginationLink
                  href="#"
                  isActive={page === i + 1}
                  onClick={(e) => {
                    e.preventDefault();
                    setPage(i + 1);
                  }}
                >
                  {i + 1}
                </PaginationLink>
              </PaginationItem>
            ))}
            <PaginationItem>
              <PaginationNext
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  setPage((p) => Math.min(pageCount, p + 1));
                }}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}

      <VariableDialog
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={load}
      />
      <VariableDialog
        open={!!editing}
        row={editing}
        onClose={() => setEditing(null)}
        onSaved={load}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this variable?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes <span className="font-medium">{deleteTarget?.variable ?? "(unnamed)"}</span> from your database.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function VariableDialog({
  open,
  row,
  onClose,
  onSaved,
}: {
  open: boolean;
  row?: Row | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!row;
  const [variable, setVariable] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setVariable(row?.variable ?? "");
      setDescription(row?.description ?? "");
    }
  }, [open, row]);

  const submit = async () => {
    if (!variable.trim()) {
      toast.error("Variable name is required");
      return;
    }
    setSaving(true);
    try {
      if (isEdit && row) {
        const { error } = await supabase
          .from("variable")
          .update({ variable: variable.trim(), description: description.trim() || null })
          .eq("var_id", row.var_id);
        if (error) throw error;
        toast.success("Variable updated");
      } else {
        const { error } = await supabase.from("variable").insert({
          variable: variable.trim(),
          description: description.trim() || null,
        });
        if (error) throw error;
        toast.success("Variable created");
      }
      onSaved();
      onClose();
    } catch (e) {
      console.error(e);
      toast.error("Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit variable" : "Add new variable"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Update this entry in your variable table." : "Create a new entry in your variable table."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="variable">Variable</Label>
            <Input
              id="variable"
              value={variable}
              onChange={(e) => setVariable(e.target.value)}
              placeholder="e.g. API_BASE_URL"
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this variable used for?"
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save changes" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
