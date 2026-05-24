import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CommentThread } from './CommentThread';
import { personaStore } from '../personaStore';

const ALICE = '11111111-1111-1111-1111-111111111111';
const BOB = '22222222-2222-2222-2222-222222222222';
const TICKET_ID = 'bbbbbbb1-0000-0000-0000-000000000001';

const EXISTING_COMMENTS = [
  {
    id: 'ccccccc1-0000-0000-0000-000000000001',
    ticket_id: TICKET_ID,
    author_id: ALICE,
    author_name: 'Alice Agent',
    body: 'I can reproduce this issue.',
    created_at: '2025-01-01T10:00:00.000Z',
  },
  {
    id: 'ccccccc2-0000-0000-0000-000000000002',
    ticket_id: TICKET_ID,
    author_id: BOB,
    author_name: 'Bob Agent',
    body: 'I added an index; need to benchmark.',
    created_at: '2025-01-01T11:00:00.000Z',
  },
];

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

function urlOf(input: unknown): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  if (input instanceof Request) return input.url;
  return String(input);
}

let fetchMock: Mock;

beforeEach(() => {
  window.localStorage.clear();
  personaStore.setId(ALICE);
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

describe('CommentThread', () => {
  it('renders existing comments in chronological order with author and timestamp', async () => {
    fetchMock.mockImplementation((input: unknown) => {
      const url = urlOf(input);
      if (url === `/api/tickets/${TICKET_ID}/comments`) {
        return Promise.resolve(jsonResponse(EXISTING_COMMENTS));
      }
      return Promise.resolve(jsonResponse({}));
    });

    render(
      <CommentThread ticketId={TICKET_ID} comments={EXISTING_COMMENTS} />
    );

    const list = await screen.findByRole('list', { name: /comments/i });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Alice Agent');
    expect(items[0]).toHaveTextContent('I can reproduce this issue.');
    expect(items[1]).toHaveTextContent('Bob Agent');
    expect(items[1]).toHaveTextContent('I added an index; need to benchmark.');
  });

  it('shows empty state when there are no comments', () => {
    render(<CommentThread ticketId={TICKET_ID} comments={[]} />);

    expect(screen.getByText(/no comments yet/i)).toBeInTheDocument();
  });

  it('submit button is disabled when input is empty', () => {
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({})));

    render(<CommentThread ticketId={TICKET_ID} comments={[]} />);

    const submitBtn = screen.getByRole('button', { name: /post comment/i });
    expect(submitBtn).toBeDisabled();
  });

  it('submit button is disabled when input is only whitespace', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({})));

    const user = userEvent.setup();
    render(<CommentThread ticketId={TICKET_ID} comments={[]} />);

    const input = screen.getByPlaceholderText(/write a comment/i);
    await user.type(input, '   ');

    const submitBtn = screen.getByRole('button', { name: /post comment/i });
    expect(submitBtn).toBeDisabled();
  });

  it('enables submit button when input has non-whitespace content', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({})));

    const user = userEvent.setup();
    render(<CommentThread ticketId={TICKET_ID} comments={[]} />);

    const input = screen.getByPlaceholderText(/write a comment/i);
    await user.type(input, 'A real comment');

    const submitBtn = screen.getByRole('button', { name: /post comment/i });
    expect(submitBtn).not.toBeDisabled();
  });

  it('posts a comment and calls onCommentAdded callback', async () => {
    const onCommentAdded = vi.fn();
    const newComment = {
      id: 'new-comment-id',
      ticket_id: TICKET_ID,
      author_id: ALICE,
      author_name: 'Alice Agent',
      body: 'A new comment from the test',
      created_at: '2025-01-01T12:00:00.000Z',
    };

    fetchMock.mockImplementation((input: unknown, init?: RequestInit) => {
      const url = urlOf(input);
      if (
        url === `/api/tickets/${TICKET_ID}/comments` &&
        init?.method === 'POST'
      ) {
        return Promise.resolve(jsonResponse(newComment, { status: 201 }));
      }
      return Promise.resolve(jsonResponse({}));
    });

    const user = userEvent.setup();
    render(
      <CommentThread
        ticketId={TICKET_ID}
        comments={EXISTING_COMMENTS}
        onCommentAdded={onCommentAdded}
      />
    );

    const input = screen.getByPlaceholderText(/write a comment/i);
    await user.type(input, 'A new comment from the test');

    const submitBtn = screen.getByRole('button', { name: /post comment/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(onCommentAdded).toHaveBeenCalledTimes(1);
    });

    const postedComment = onCommentAdded.mock.calls[0]![0] as (typeof newComment);
    expect(postedComment.body).toBe('A new comment from the test');
    expect(postedComment.author_id).toBe(ALICE);
  });

  it('clears input after successful post', async () => {
    const onCommentAdded = vi.fn();
    const newComment = {
      id: 'new-comment-id',
      ticket_id: TICKET_ID,
      author_id: ALICE,
      author_name: 'Alice Agent',
      body: 'Clear test',
      created_at: '2025-01-01T12:00:00.000Z',
    };

    fetchMock.mockImplementation((input: unknown, init?: RequestInit) => {
      const url = urlOf(input);
      if (
        url === `/api/tickets/${TICKET_ID}/comments` &&
        init?.method === 'POST'
      ) {
        return Promise.resolve(jsonResponse(newComment, { status: 201 }));
      }
      return Promise.resolve(jsonResponse({}));
    });

    const user = userEvent.setup();
    render(
      <CommentThread
        ticketId={TICKET_ID}
        comments={[]}
        onCommentAdded={onCommentAdded}
      />
    );

    const input = screen.getByPlaceholderText(/write a comment/i);
    await user.type(input, 'Clear test');

    const submitBtn = screen.getByRole('button', { name: /post comment/i });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(onCommentAdded).toHaveBeenCalled();
    });

    expect((input as HTMLTextAreaElement).value).toBe('');
  });

  it('shows error message when posting fails', async () => {
    fetchMock.mockImplementation((input: unknown, init?: RequestInit) => {
      const url = urlOf(input);
      if (
        url === `/api/tickets/${TICKET_ID}/comments` &&
        init?.method === 'POST'
      ) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              error: {
                code: 'VALIDATION_FAILED',
                message: 'Comment body cannot be empty.',
              },
            }),
            { status: 400, headers: { 'content-type': 'application/json' } }
          )
        );
      }
      return Promise.resolve(jsonResponse({}));
    });

    const user = userEvent.setup();
    render(<CommentThread ticketId={TICKET_ID} comments={[]} />);

    // We need to bypass the client-side validation to test server error handling.
    // Simulate by making the POST directly (this test is about server error display)
    const input = screen.getByPlaceholderText(/write a comment/i);
    await user.type(input, 'Valid text');

    const submitBtn = screen.getByRole('button', { name: /post comment/i });
    await user.click(submitBtn);

    // The fetch mock returns 400 for the POST
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /comment body cannot be empty/i
    );
  });

  it('prevents empty submission via client-side validation', async () => {
    const onCommentAdded = vi.fn();
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse({})));

    render(
      <CommentThread
        ticketId={TICKET_ID}
        comments={[]}
        onCommentAdded={onCommentAdded}
      />
    );

    const submitBtn = screen.getByRole('button', { name: /post comment/i });
    expect(submitBtn).toBeDisabled();

    // Clicking a disabled button should not trigger a fetch
    const user = userEvent.setup();
    await user.click(submitBtn);

    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining('/comments'),
      expect.objectContaining({ method: 'POST' })
    );
  });
});
