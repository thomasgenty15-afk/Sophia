export type ConfirmationToken = {
  token_id: string;
  user_id: string;
  operation_id: string;
  operation_type: string;
  draft_hash: string;
  source_message_id: string;
  pending_confirmation_id: string;
  confirmed_at: string;
  expires_at: string;
  signature: string;
};
