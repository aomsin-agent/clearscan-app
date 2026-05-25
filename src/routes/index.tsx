import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ScanLine, History as HistoryIcon, Database } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OcrPanel } from "@/components/ocr/OcrPanel";
import { HistoryPanel } from "@/components/history/HistoryPanel";
import { VariablePanel } from "@/components/variable/VariablePanel";

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

function Index() {
  const [tab, setTab] = useState("ocr");

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
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className="h-11 w-full max-w-md justify-start rounded-xl bg-muted p-1">
            <TabTrigger value="ocr" label="OCR" Icon={ScanLine} />
            <TabTrigger value="history" label="History" Icon={HistoryIcon} />
            <TabTrigger value="variable" label="Variable" Icon={Database} />
          </TabsList>

          <TabsContent value="ocr" className="mt-6">
            <OcrPanel />
          </TabsContent>
          <TabsContent value="history" className="mt-6">
            <HistoryPanel />
          </TabsContent>
          <TabsContent value="variable" className="mt-6">
            <VariablePanel />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function TabTrigger({
  value,
  label,
  Icon,
}: {
  value: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <TabsTrigger
      value={value}
      className="flex-1 gap-2 rounded-lg text-sm data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-sm"
    >
      <Icon className="h-4 w-4" />
      {label}
    </TabsTrigger>
  );
}
