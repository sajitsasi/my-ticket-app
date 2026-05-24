import { useEffect, useState } from 'react';
import { apiFetch } from '../api';

interface TagSummary {
  id: string;
  name: string;
}

interface TagChipsProps {
  ticketId: string;
  tags: string[];
  onTagsChange: (tags: string[]) => void;
}

export function TagChips({ ticketId, tags, onTagsChange }: TagChipsProps) {
  const [allTags, setAllTags] = useState<TagSummary[]>([]);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<TagSummary[]>('/api/tags')
      .then((data) => {
        if (!cancelled) setAllTags(data);
      })
      .catch(() => {
        /* tag picker stays empty */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function addTag(tagId: string) {
    if (busy) return;
    setBusy(tagId);
    setError(null);
    try {
      const updated = await apiFetch<{ tags: string[] }>(
        `/api/tickets/${ticketId}/tags`,
        { method: 'POST', body: { tag_id: tagId } }
      );
      onTagsChange(updated.tags);
      setAdding(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to add tag.';
      setError(message);
    } finally {
      setBusy(null);
    }
  }

  async function removeTag(tagId: string) {
    if (busy) return;
    setBusy(tagId);
    setError(null);
    try {
      const updated = await apiFetch<{ tags: string[] }>(
        `/api/tickets/${ticketId}/tags/${tagId}`,
        { method: 'DELETE' }
      );
      onTagsChange(updated.tags);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to remove tag.';
      setError(message);
    } finally {
      setBusy(null);
    }
  }

  const tagIdSet = new Set(tags);
  const currentTagObjects = allTags.filter((t) => tagIdSet.has(t.name));
  const availableTags = allTags.filter((t) => !tagIdSet.has(t.name));

  return (
    <div className="tag-chips" data-testid="tag-chips">
      <ul className="tag-chip-list">
        {currentTagObjects.map((tag) => (
          <li key={tag.id} className="tag-chip">
            <span className="tag-chip-label">{tag.name}</span>
            <button
              type="button"
              className="tag-chip-remove"
              aria-label={`Remove tag ${tag.name}`}
              disabled={busy === tag.id}
              onClick={() => removeTag(tag.id)}
            >
              ×
            </button>
          </li>
        ))}
      </ul>

      {availableTags.length > 0 && !adding && (
        <button
          type="button"
          className="tag-chip-add-toggle"
          onClick={() => setAdding(true)}
        >
          + Add tag
        </button>
      )}

      {adding && availableTags.length > 0 && (
        <div className="tag-chip-picker" data-testid="tag-chip-picker">
          <select
            aria-label="Select a tag to add"
            defaultValue=""
            onChange={(event) => {
              if (event.target.value) {
                addTag(event.target.value);
              }
            }}
            disabled={busy !== null}
          >
            <option value="">Choose tag…</option>
            {availableTags.map((tag) => (
              <option key={tag.id} value={tag.id}>
                {tag.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="tag-chip-add-cancel"
            onClick={() => setAdding(false)}
            disabled={busy !== null}
          >
            Cancel
          </button>
        </div>
      )}

      {error && (
        <p role="alert" className="tag-chip-error">
          {error}
        </p>
      )}
    </div>
  );
}
