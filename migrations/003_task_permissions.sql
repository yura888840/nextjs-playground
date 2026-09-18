ALTER TABLE users ADD COLUMN role text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin'));
-- Preserve existing demo tasks without assigning them to an arbitrary account.
-- Legacy rows stay unowned and inaccessible through the authenticated API.
ALTER TABLE tasks ADD COLUMN owner_id uuid REFERENCES users(id) ON DELETE CASCADE;
CREATE INDEX tasks_owner_created_idx ON tasks(owner_id, created_at, id);
