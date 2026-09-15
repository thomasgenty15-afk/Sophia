-- Allow users to delete their own messages in chat_messages table
create policy "Users can delete their own messages"
on "public"."chat_messages"
as permissive
for delete
to authenticated
using (auth.uid() = user_id);

