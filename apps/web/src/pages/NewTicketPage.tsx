import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, apiFetch } from '../api';
import type { Ticket, TicketPriority } from '../types';

interface UserSummary {
  id: string;
  name: string;
}

interface TagSummary {
  id: string;
  name: string;
}

interface FormState {
  title: string;
  description: string;
  priority: TicketPriority | '';
  assigneeId: string;
  tagIds: string[];
}

interface FormErrors {
  title?: string;
  priority?: string;
  assignee_id?: string;
  tags?: string;
  form?: string;
}

const PRIORITY_OPTIONS: { value: TicketPriority; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

const EMPTY_FORM: FormState = {
  title: '',
  description: '',
  priority: '',
  assigneeId: '',
  tagIds: [],
};

function validate(values: FormState): FormErrors {
  const errors: FormErrors = {};
  if (values.title.trim().length === 0) {
    errors.title = 'Title is required.';
  }
  if (values.priority === '') {
    errors.priority = 'Priority is required.';
  }
  return errors;
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
      else if (path === 'tags' && issue.message) result.tags = issue.message;
    }
  }
  if (Object.keys(result).length === 0) {
    result.form = err.message;
  }
  return result;
}

export function NewTicketPage() {
  const navigate = useNavigate();
  const [values, setValues] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [tags, setTags] = useState<TagSummary[]>([]);

  useEffect(() => {
    let cancelled = false;
    apiFetch<UserSummary[]>('/api/users')
      .then((data) => {
        if (!cancelled) setUsers(data);
      })
      .catch(() => {
        /* dropdown remains empty; submission still permitted without an assignee */
      });
    apiFetch<TagSummary[]>('/api/tags')
      .then((data) => {
        if (!cancelled) setTags(data);
      })
      .catch(() => {
        /* tag picker stays empty; tags are optional */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function toggleTag(tagId: string) {
    setValues((prev) =>
      prev.tagIds.includes(tagId)
        ? { ...prev, tagIds: prev.tagIds.filter((id) => id !== tagId) }
        : { ...prev, tagIds: [...prev.tagIds, tagId] }
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    const validation = validate(values);
    if (Object.keys(validation).length > 0) {
      setErrors(validation);
      return;
    }
    setErrors({});
    setSubmitting(true);

    const payload: Record<string, unknown> = {
      title: values.title.trim(),
      priority: values.priority,
    };
    if (values.description.trim().length > 0) {
      payload.description = values.description;
    }
    if (values.assigneeId.length > 0) {
      payload.assignee_id = values.assigneeId;
    }
    if (values.tagIds.length > 0) {
      payload.tags = values.tagIds;
    }

    try {
      const created = await apiFetch<Ticket>('/api/tickets', {
        method: 'POST',
        body: payload,
      });
      navigate(`/tickets/${created.id}`);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(extractFieldErrors(err));
      } else {
        const message =
          err instanceof Error ? err.message : 'Failed to create ticket.';
        setErrors({ form: message });
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section
      aria-labelledby="new-ticket-heading"
      className="new-ticket-section"
    >
      <h1 id="new-ticket-heading">New Ticket</h1>
      <form
        className="new-ticket-form"
        noValidate
        onSubmit={handleSubmit}
        aria-describedby={errors.form ? 'new-ticket-form-error' : undefined}
      >
        <div className="form-field">
          <label htmlFor="new-ticket-title">Title</label>
          <input
            id="new-ticket-title"
            name="title"
            type="text"
            value={values.title}
            onChange={(event) => update('title', event.target.value)}
            aria-invalid={errors.title ? true : undefined}
            aria-describedby={errors.title ? 'new-ticket-title-error' : undefined}
          />
          {errors.title ? (
            <p
              id="new-ticket-title-error"
              role="alert"
              className="form-field-error"
            >
              {errors.title}
            </p>
          ) : null}
        </div>

        <div className="form-field">
          <label htmlFor="new-ticket-description">Description</label>
          <textarea
            id="new-ticket-description"
            name="description"
            rows={4}
            value={values.description}
            onChange={(event) => update('description', event.target.value)}
          />
        </div>

        <div className="form-field">
          <label htmlFor="new-ticket-priority">Priority</label>
          <select
            id="new-ticket-priority"
            name="priority"
            value={values.priority}
            onChange={(event) =>
              update('priority', event.target.value as FormState['priority'])
            }
            aria-invalid={errors.priority ? true : undefined}
            aria-describedby={
              errors.priority ? 'new-ticket-priority-error' : undefined
            }
          >
            <option value="">Select priority…</option>
            {PRIORITY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {errors.priority ? (
            <p
              id="new-ticket-priority-error"
              role="alert"
              className="form-field-error"
            >
              {errors.priority}
            </p>
          ) : null}
        </div>

        <div className="form-field">
          <label htmlFor="new-ticket-assignee">Assignee</label>
          <select
            id="new-ticket-assignee"
            name="assignee"
            value={values.assigneeId}
            onChange={(event) => update('assigneeId', event.target.value)}
            aria-invalid={errors.assignee_id ? true : undefined}
            aria-describedby={
              errors.assignee_id ? 'new-ticket-assignee-error' : undefined
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
              id="new-ticket-assignee-error"
              role="alert"
              className="form-field-error"
            >
              {errors.assignee_id}
            </p>
          ) : null}
        </div>

        <fieldset
          className="form-field tag-picker"
          aria-describedby={errors.tags ? 'new-ticket-tags-error' : undefined}
        >
          <legend>Tags</legend>
          {tags.length === 0 ? (
            <p className="form-field-hint">No tags available.</p>
          ) : (
            <ul className="tag-chip-list">
              {tags.map((tag) => {
                const active = values.tagIds.includes(tag.id);
                return (
                  <li key={tag.id}>
                    <button
                      type="button"
                      className={`tag-chip tag-chip-button${
                        active ? ' tag-chip-active' : ''
                      }`}
                      aria-pressed={active}
                      onClick={() => toggleTag(tag.id)}
                    >
                      {tag.name}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {errors.tags ? (
            <p
              id="new-ticket-tags-error"
              role="alert"
              className="form-field-error"
            >
              {errors.tags}
            </p>
          ) : null}
        </fieldset>

        {errors.form ? (
          <p
            id="new-ticket-form-error"
            role="alert"
            className="form-field-error"
          >
            {errors.form}
          </p>
        ) : null}

        <div className="form-actions">
          <button type="submit" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create ticket'}
          </button>
        </div>
      </form>
    </section>
  );
}
