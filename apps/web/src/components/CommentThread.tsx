import { useState, type FormEvent } from 'react';
import { ApiError, apiFetch } from '../api';
import type { TicketComment } from '../types';

interface CommentThreadProps {
  ticketId: string;
  comments: TicketComment[];
  onCommentAdded?: (comment: TicketComment) => void;
}

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export function CommentThread({
  ticketId,
  comments,
  onCommentAdded,
}: CommentThreadProps) {
  const [body, setBody] = useState('');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = body.trim();
  const canSubmit = trimmed.length > 0 && !posting;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;

    setPosting(true);
    setError(null);

    try {
      const comment = await apiFetch<TicketComment>(
        `/api/tickets/${ticketId}/comments`,
        {
          method: 'POST',
          body: { body: trimmed },
        }
      );
      setBody('');
      onCommentAdded?.(comment);
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Failed to post comment.';
      setError(message);
    } finally {
      setPosting(false);
    }
  }

  return (
    <div data-testid="comment-thread">
      {comments.length === 0 ? (
        <p className="ticket-empty-value">No comments yet.</p>
      ) : (
        <ol aria-label="Comments" className="ticket-comment-list">
          {comments.map((c) => (
            <li key={c.id} className="ticket-comment">
              <div className="ticket-comment-meta">
                <span className="ticket-comment-author">
                  {c.author_name ?? c.author_id}
                </span>
                <time dateTime={c.created_at}>{relativeTime(c.created_at)}</time>
              </div>
              <p className="ticket-comment-body">{c.body}</p>
            </li>
          ))}
        </ol>
      )}

      <form
        className="comment-form"
        onSubmit={handleSubmit}
        aria-label="Post a comment"
      >
        <div className="form-field">
          <textarea
            placeholder="Write a comment…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            disabled={posting}
            aria-label="Comment body"
          />
        </div>
        {error ? (
          <p role="alert" className="form-field-error">
            {error}
          </p>
        ) : null}
        <button type="submit" disabled={!canSubmit}>
          {posting ? 'Posting…' : 'Post Comment'}
        </button>
      </form>
    </div>
  );
}
