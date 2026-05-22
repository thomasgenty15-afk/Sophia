
ALTER TABLE "public"."user_chat_states"
ADD COLUMN "unprocessed_msg_count" integer DEFAULT 0,
ADD COLUMN "last_processed_at" timestamp with time zone DEFAULT now();

