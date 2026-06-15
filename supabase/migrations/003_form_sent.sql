-- Track when the Jotform was first sent (separate from received)
alter table leads add column if not exists form_sent_at timestamptz;
