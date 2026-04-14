-- Increase file size limit to 200MB for adjuntos bucket
UPDATE storage.buckets SET file_size_limit = 209715200 WHERE id = 'adjuntos';
