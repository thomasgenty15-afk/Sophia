-- Add embedding column to user_vital_sign_entries
ALTER TABLE "public"."user_vital_sign_entries"
ADD COLUMN "embedding" vector(768);

-- Create index for vector search
CREATE INDEX "user_vital_sign_entries_embedding_idx" ON "public"."user_vital_sign_entries" USING hnsw ("embedding" vector_cosine_ops);

