CREATE TABLE task_attachments (
  id uuid PRIMARY KEY,
  task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  filename text NOT NULL CHECK (char_length(filename) BETWEEN 1 AND 120),
  media_type text NOT NULL CHECK (media_type IN ('text/plain', 'application/pdf', 'image/png', 'image/jpeg')),
  size integer NOT NULL CHECK (size BETWEEN 1 AND 1048576),
  content bytea NOT NULL CHECK (octet_length(content) = size),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX task_attachments_task_idx ON task_attachments(task_id, created_at, id);
