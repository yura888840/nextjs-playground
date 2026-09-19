CREATE TABLE github_task_links (
  task_id uuid PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  repository text NOT NULL,
  issue_number integer NOT NULL,
  external_updated_at timestamptz NOT NULL,
  UNIQUE(owner_id, repository, issue_number)
);
CREATE INDEX github_task_links_issue_idx ON github_task_links(repository, issue_number);
CREATE TABLE github_deliveries (
  delivery_id uuid PRIMARY KEY,
  payload_hash text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE github_import_limits (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  attempts integer NOT NULL,
  reset_at timestamptz NOT NULL
);
