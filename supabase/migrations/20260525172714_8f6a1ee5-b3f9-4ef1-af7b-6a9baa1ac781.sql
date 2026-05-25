
-- Add public RLS policies on variable table for full CRUD (no auth in scope)
CREATE POLICY "variable_select_all" ON public.variable FOR SELECT USING (true);
CREATE POLICY "variable_insert_all" ON public.variable FOR INSERT WITH CHECK (true);
CREATE POLICY "variable_update_all" ON public.variable FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "variable_delete_all" ON public.variable FOR DELETE USING (true);

-- Create OCR history table
CREATE TABLE public.ocr_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  extracted_text TEXT NOT NULL DEFAULT '',
  preview_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.ocr_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ocr_history_select_all" ON public.ocr_history FOR SELECT USING (true);
CREATE POLICY "ocr_history_insert_all" ON public.ocr_history FOR INSERT WITH CHECK (true);
CREATE POLICY "ocr_history_delete_all" ON public.ocr_history FOR DELETE USING (true);

CREATE INDEX idx_ocr_history_created_at ON public.ocr_history (created_at DESC);
