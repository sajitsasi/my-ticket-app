import { useEffect, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { ApiError, apiFetch } from '../api';
import { AssigneePicker } from '../components/AssigneePicker';
import { CommentThread } from '../components/CommentThread';
import { PriorityBadge } from '../components/PriorityBadge';
import { SlaBadge } from '../components/SlaBadge';
import { StatusBadge } from '../components/StatusBadge';
import { TagChips } from '../components/TagChips';
import type { TicketComment, TicketDetail, TicketPriority, TicketStatus } from '../types';

interface UserSummary {
  id: string;
  name: string;
}

type DetailState =
  | { status: 'loading' }
  | { status: 'ready'; ticket: TicketDetail }
  | { status: 'not_found' }
  | { status: 'error'; message: string };

interface EditState {
  title: string;
  description: string;
  priority: TicketPriority;
  assigneeId: string;
}

interface FormErrors {
  title?: string;
  priority?: string;
  assignee_id?: string;
  form?: string;
}

const PRIORITY_OPTIONS: { value: TicketPriority; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

function fromTicket(ticket: TicketDetail): EditState {
  return {
    title: ticket.title,
    description: ticket.description,
    priority: ticket.priority,
    assigneeId: ticket.assignee_id ?? '',
  };
}

function extractFieldErrors(err: ApiError): FormErrors {
  const result: FormErrors = {};
  const body = err.body as
    | { error?: { details?: Array<{ path?: string; message?: string }> } }
    | null;
  const details = body?.error?.details;
  if (Array.isArray(details)) {
    for (const issue of details) {
      const path = issue.path ?? '';
      if (path === 'title' && issue.message) result.title = issue.message;
      else if (path === 'priority' && issue.message)
        result.priority = issue.message;
      else if (path === 'assignee_id' && issue.message)
        result.assignee_id = issue.message;
    }
  }
  if (Object.keys(result).length === 0) {
    result.form = err.message;
  }
  return result;
}

export function TicketDetailPage() {
  const { id = '' } = useParams<{ id: string }>();
  const [state, setState] = useState<DetailState>({ status: 'loading' });
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [editing, setEditing] = useState(false);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [editOriginal, setEditOriginal] = useState<EditState | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [statusBusy, setStatusBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    apiFetch<TicketDetail>(`/api/tickets/${id}`)
      .then((ticket) => {
        if (!cancelled) {
          setState({ status: 'ready', ticket });
        }
      })
      .catch((err: unknown) => {
        if (cancelled) {
          return;
        }
        if (err instanceof ApiError && err.status === 404) {
          setState({ status: 'not_found' });
          return;
        }
        const message =
          err instanceof Error ? err.message : 'Failed to load ticket';
        setState({ status: 'error', message });
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    apiFetch<UserSummary[]>('/api/users')
      .then((data) => {
        if (!cancelled) setUsers(data);
      })
      .catch(() => {
        /* assignee dropdown stays empty */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function startEdit(ticket: TicketDetail) {
    const initial = fromTicket(ticket);
    setEdit(initial);
    setEditOriginal(initial);
    setErrors({});
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setEdit(null);
    setEditOriginal(null);
    setErrors({});
  }

  function update<K extends keyof EditState>(key: K, value: EditState[K]) {
    setEdit((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function handleStatusChange(nextStatus: TicketStatus) {
    if (state.status !== 'ready' || statusBusy) return;
    setStatusBusy(true);
    setStatusError(null);
    try {
      const updated = await apiFetch<TicketDetail>(`/api/tickets/${id}`, {
        method: 'PATCH',
        body: { status: nextStatus },
      });
      setState({ status: 'ready', ticket: updated });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to change status.';
      setStatusError(message);
    } finally {
      setStatusBusy(false);
    }
  }

  function handleAssigneeChange(updatedTicket: TicketDetail) {
    if (state.status !== 'ready') return;
    setState({
      status: 'ready',
      ticket: updatedTicket,
    });
  }

  function handleTagsChange(newTags: string[]) {
    if (state.status !== 'ready') return;
    setState({
      status: 'ready',
      ticket: { ...state.ticket, tags: newTags },
    });
  }

  function handleCommentAdded(comment: TicketComment) {
    if (state.status !== 'ready') return;
    setState({
      status: 'ready',
      ticket: {
        ...state.ticket,
        comments: [...state.ticket.comments, comment],
      },
    });
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!edit || !editOriginal || saving || state.status !== 'ready') return;

    const validation: FormErrors = {};
    if (edit.title.trim().length === 0) {
      validation.title = 'Title is required.';
    }
    if (Object.keys(validation).length > 0) {
      setErrors(validation);
      return;
    }
    setErrors({});

    const payload: Record<string, unknown> = {};
    if (edit.title.trim() !== editOriginal.title.trim()) {
      payload.title = edit.title.trim();
    }
    if (edit.description !== editOriginal.description) {
      payload.description = edit.description;
    }
    if (edit.priority !== editOriginal.priority) {
      payload.priority = edit.priority;
    }
    const nextAssignee = edit.assigneeId.length > 0 ? edit.assigneeId : null;
    const originalAssignee =
      editOriginal.assigneeId.length > 0 ? editOriginal.assigneeId : null;
    if (nextAssignee !== originalAssignee) {
      payload.assignee_id = nextAssignee;
    }

    if (Object.keys(payload).length === 0) {
      setEditing(false);
      setEdit(null);
      setEditOriginal(null);
      return;
    }

    setSaving(true);

    try {
      const updated = await apiFetch<TicketDetail>(`/api/tickets/${id}`, {
        method: 'PATCH',
        body: payload,
      });
      setState({ status: 'ready', ticket: updated });
      setEditing(false);
      setEdit(null);
      setEditOriginal(null);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(extractFieldErrors(err));
      } else {
        const message =
          err instanceof Error ? err.message : 'Failed to save changes.';
        setErrors({ form: message });
      }
    } finally {
      setSaving(false);
    }
  }

  if (state.status === 'loading') {
    return (
      <section aria-labelledby="ticket-detail-heading">
        <h1 id="ticket-detail-heading">Ticket</h1>
        <p role="status" aria-live="polite">
          Loading ticket…
        </p>
      </section>
    );
  }

  if (state.status === 'not_found') {
    return (
      <section
        aria-labelledby="ticket-detail-heading"
        className="ticket-not-found"
      >
        <h1 id="ticket-detail-heading">Ticket not found</h1>
        <p>The ticket you are looking for does not exist or has been deleted.</p>
      </section>
    );
  }

  if (state.status === 'error') {
    return (
      <section aria-labelledby="ticket-detail-heading">
        <h1 id="ticket-detail-heading">Ticket</h1>
        <p role="alert" className="tickets-error">
          Failed to load ticket: {state.message}
        </p>
      </section>
    );
  }

  const ticket = state.ticket;

  return (
    <section
      aria-labelledby="ticket-detail-heading"
      className="ticket-detail"
    >
      <div className="ticket-detail-header">
        <h1 id="ticket-detail-heading" data-testid="ticket-detail-title">
          {ticket.title}
        </h1>
        {!editing ? (
          <button type="button" onClick={() => startEdit(ticket)}>
            Edit
          </button>
        ) : null}
      </div>

      <div className="ticket-detail-badges">
        <StatusBadge
          status={ticket.status}
          onChange={handleStatusChange}
          disabled={statusBusy}
        />
        <PriorityBadge priority={ticket.priority} />
        <SlaBadge
          status={ticket.status}
          sla_target_hours={ticket.sla_target_hours}
          sla_remaining_seconds={ticket.sla_remaining_seconds}
          sla_breached={ticket.sla_breached}
        />
      </div>
      {statusError ? (
        <div
          role="alert"
          className="status-toast"
          data-testid="status-error-toast"
        >
          {statusError}
        </div>
      ) : null}

      {editing && edit ? (
        <form
          className="ticket-detail-edit-form"
          noValidate
          onSubmit={handleSave}
          aria-describedby={errors.form ? 'ticket-edit-form-error' : undefined}
        >
          <div className="form-field">
            <label htmlFor="ticket-edit-title">Title</label>
            <input
              id="ticket-edit-title"
              name="title"
              type="text"
              value={edit.title}
              onChange={(event) => update('title', event.target.value)}
              aria-invalid={errors.title ? true : undefined}
              aria-describedby={
                errors.title ? 'ticket-edit-title-error' : undefined
              }
            />
            {errors.title ? (
              <p
                id="ticket-edit-title-error"
                role="alert"
                className="form-field-error"
              >
                {errors.title}
              </p>
            ) : null}
          </div>

          <div className="form-field">
            <label htmlFor="ticket-edit-description">Description</label>
            <textarea
              id="ticket-edit-description"
              name="description"
              rows={5}
              value={edit.description}
              onChange={(event) => update('description', event.target.value)}
            />
          </div>

          <div className="form-field">
            <label htmlFor="ticket-edit-priority">Priority</label>
            <select
              id="ticket-edit-priority"
              name="priority"
              value={edit.priority}
              onChange={(event) =>
                update('priority', event.target.value as TicketPriority)
              }
              aria-invalid={errors.priority ? true : undefined}
              aria-describedby={
                errors.priority ? 'ticket-edit-priority-error' : undefined
              }
            >
              {PRIORITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {errors.priority ? (
              <p
                id="ticket-edit-priority-error"
                role="alert"
                className="form-field-error"
              >
                {errors.priority}
              </p>
            ) : null}
          </div>

          <div className="form-field">
            <label htmlFor="ticket-edit-assignee">Assignee</label>
            <select
              id="ticket-edit-assignee"
              name="assignee"
              value={edit.assigneeId}
              onChange={(event) => update('assigneeId', event.target.value)}
              aria-invalid={errors.assignee_id ? true : undefined}
              aria-describedby={
                errors.assignee_id ? 'ticket-edit-assignee-error' : undefined
              }
            >
              <option value="">Unassigned</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
            {errors.assignee_id ? (
              <p
                id="ticket-edit-assignee-error"
                role="alert"
                className="form-field-error"
              >
                {errors.assignee_id}
              </p>
            ) : null}
          </div>

          {errors.form ? (
            <p
              id="ticket-edit-form-error"
              role="alert"
              className="form-field-error"
            >
              {errors.form}
            </p>
          ) : null}

          <div className="form-actions">
            <button type="submit" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={cancelEdit}
              disabled={saving}
              className="form-secondary"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <dl className="ticket-detail-fields">
          <div>
            <dt>Description</dt>
            <dd
              className="ticket-detail-description"
              data-testid="ticket-detail-description"
            >
              {ticket.description.length > 0 ? (
                ticket.description
              ) : (
                <span className="ticket-empty-value">No description</span>
              )}
            </dd>
          </div>
          <div>
            <dt>Reporter</dt>
            <dd>{ticket.reporter_name ?? ticket.reporter_id}</dd>
          </div>
          <div>
            <dt>Assignee</dt>
            <dd data-testid="ticket-detail-assignee">
              <AssigneePicker
                ticketId={id}
                assigneeId={ticket.assignee_id}
                onAssigneeChange={handleAssigneeChange}
              />
            </dd>
          </div>
          <div>
            <dt>Created</dt>
            <dd>
              <time dateTime={ticket.created_at}>{ticket.created_at}</time>
            </dd>
          </div>
          <div>
            <dt>Updated</dt>
            <dd>
              <time dateTime={ticket.updated_at}>{ticket.updated_at}</time>
            </dd>
          </div>
        </dl>
      )}

      <section
        aria-labelledby="ticket-detail-tags-heading"
        className="ticket-detail-section"
        data-testid="ticket-detail-tags"
      >
        <h2 id="ticket-detail-tags-heading">Tags</h2>
        <TagChips
          ticketId={id}
          tags={ticket.tags}
          onTagsChange={handleTagsChange}
        />
      </section>

      <section
        aria-labelledby="ticket-detail-comments-heading"
        className="ticket-detail-section"
        data-testid="ticket-detail-comments"
      >
        <h2 id="ticket-detail-comments-heading">Comments</h2>
        <CommentThread
          ticketId={id}
          comments={ticket.comments}
          onCommentAdded={handleCommentAdded}
        />
      </section>

      <section
        aria-labelledby="ticket-detail-audit-heading"
        className="ticket-detail-section"
        data-testid="ticket-detail-audit"
      >
        <h2 id="ticket-detail-audit-heading">Audit log</h2>
        {ticket.audit_log.length === 0 ? (
          <p className="ticket-empty-value">No audit entries yet.</p>
        ) : (
          <ol className="ticket-audit-list">
            {ticket.audit_log.map((entry) => (
              <li key={entry.id} className="ticket-audit-entry">
                <span className="ticket-audit-action">{entry.action}</span>
                <span className="ticket-audit-actor">
                  {entry.actor_name ?? entry.actor_id}
                </span>
                {entry.from_value !== null || entry.to_value !== null ? (
                  <span className="ticket-audit-change">
                    {entry.from_value ?? '∅'} → {entry.to_value ?? '∅'}
                  </span>
                ) : null}
                <time dateTime={entry.created_at}>{entry.created_at}</time>
              </li>
            ))}
          </ol>
        )}
      </section>
    </section>
  );
}
