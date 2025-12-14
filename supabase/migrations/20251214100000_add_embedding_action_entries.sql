-- Add embedding column to user_action_entries
ALTER TABLE "public"."user_action_entries"
ADD COLUMN "embedding" vector(768);

-- Create index for vector search
CREATE INDEX "user_action_entries_embedding_idx" ON "public"."user_action_entries" USING hnsw ("embedding" vector_cosine_ops);

