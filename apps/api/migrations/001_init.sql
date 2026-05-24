CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE users (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  email       text NOT NULL UNIQUE,
  role        text NOT NULL CHECK (role IN ('agent', 'requester')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tickets (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title        text NOT NULL,
  description  text NOT NULL DEFAULT '',
  status       text NOT NULL CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  priority     text NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  reporter_id  uuid NOT NULL REFERENCES users(id),
  assignee_id  uuid REFERENCES users(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  resolved_at  timestamptz
);

CREATE INDEX tickets_status_idx ON tickets(status);
CREATE INDEX tickets_priority_idx ON tickets(priority);
CREATE INDEX tickets_assignee_idx ON tickets(assignee_id);
CREATE INDEX tickets_reporter_idx ON tickets(reporter_id);

CREATE TABLE comments (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  author_id   uuid NOT NULL REFERENCES users(id),
  body        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX comments_ticket_idx ON comments(ticket_id);

CREATE TABLE tags (
  id     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name   text NOT NULL UNIQUE,
  color  text NOT NULL
);

CREATE TABLE ticket_tags (
  ticket_id  uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  tag_id     uuid NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (ticket_id, tag_id)
);

CREATE INDEX ticket_tags_tag_idx ON ticket_tags(tag_id);

CREATE TABLE audit_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id    uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  actor_id     uuid NOT NULL REFERENCES users(id),
  action       text NOT NULL CHECK (action IN ('status_changed', 'assignee_changed', 'priority_changed', 'created')),
  from_value   text,
  to_value     text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_log_ticket_idx ON audit_log(ticket_id);
