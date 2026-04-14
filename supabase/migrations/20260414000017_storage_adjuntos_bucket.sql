-- Create adjuntos storage bucket for document attachments
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('adjuntos', 'adjuntos', true, 104857600)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload
CREATE POLICY "adjuntos_upload" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'adjuntos');

-- Allow public read
CREATE POLICY "adjuntos_read" ON storage.objects
  FOR SELECT TO anon, authenticated USING (bucket_id = 'adjuntos');

-- Allow authenticated users to update/delete their uploads
CREATE POLICY "adjuntos_update" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'adjuntos');

CREATE POLICY "adjuntos_delete" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'adjuntos');
