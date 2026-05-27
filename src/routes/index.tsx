import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useState } from "react";
import { ScanLine, History as HistoryIcon, Database, ChevronDown } from "lucide-react";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { OcrPanel } from "@/components/ocr/OcrPanel";

const HistoryPanel = lazy(() =>
  import("@/components/history/HistoryPanel").then((m) => ({ default: m.HistoryPanel })),
);
const VariablePanel = lazy(() =>
  import("@/components/variable/VariablePanel").then((m) => ({ default: m.VariablePanel })),
);

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "OCR Studio — Extract text from images & PDFs" },
      {
        name: "description",
        content:
          "OCR Studio extracts text from images and PDFs instantly. Manage your variables and revisit your OCR history.",
      },
    ],
  }),
  component: Index,
});

function PanelFallback() {
  return (
    <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
      Loading…
    </div>
  );
}

const TAB_OPTIONS = [
  { value: "ocr", label: "OCR", Icon: ScanLine },
  { value: "history", label: "History", Icon: HistoryIcon },
  { value: "variable", label: "Variable", Icon: Database },
] as const;

function Index() {
  const [tab, setTab] = useState<string>("ocr");
  const current = TAB_OPTIONS.find((t) => t.value === tab) ?? TAB_OPTIONS[0];
  const CurrentIcon = current.Icon;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-xl text-primary-foreground"
              style={{ background: "var(--gradient-primary)" }}
            >
              <ScanLine className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold leading-tight text-foreground">OCR Studio</h1>
              <p className="text-xs text-muted-foreground">Extract text from images & PDFs</p>
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2">
                <CurrentIcon className="h-4 w-4" />
                {current.label}
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {TAB_OPTIONS.map(({ value, label, Icon }) => (
                <DropdownMenuItem
                  key={value}
                  onSelect={() => setTab(value)}
                  className={
                    tab === value ? "bg-accent font-medium text-foreground" : undefined
                  }
                >
                  <Icon className="mr-2 h-4 w-4" />
                  {label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsContent value="ocr" className="mt-0">
            <OcrPanel />
          </TabsContent>
          <TabsContent value="history" className="mt-0">
            <Suspense fallback={<PanelFallback />}>
              <HistoryPanel />
            </Suspense>
          </TabsContent>
          <TabsContent value="variable" className="mt-0">
            <Suspense fallback={<PanelFallback />}>
              <VariablePanel />
            </Suspense>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
