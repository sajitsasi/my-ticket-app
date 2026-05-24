import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TagChips } from './TagChips';
import { personaStore } from '../personaStore';

const TICKET_ID = 'bbbbbbb1-0000-0000-0000-000000000001';
const TAG_BUG_ID = 'aaaaaaa1-0000-0000-0000-000000000001';
const TAG_FEATURE_ID = 'aaaaaaa2-0000-0000-0000-000000000002';
const TAG_UX_ID = 'aaaaaaa3-0000-0000-0000-000000000003';

const ALICE = '11111111-1111-1111-1111-111111111111';

const ALL_TAGS = [
  { id: TAG_BUG_ID, name: 'bug', color: '#dc2626' },
  { id: TAG_FEATURE_ID, name: 'feature', color: '#2563eb' },
  { id: TAG_UX_ID, name: 'ux', color: '#7c3aed' },
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

describe('TagChips', () => {
  it('renders current tags as chips with remove buttons', async () => {
    fetchMock.mockImplementation((input: unknown) => {
      const url = urlOf(input);
      if (url === '/api/tags') return Promise.resolve(jsonResponse(ALL_TAGS));
      return Promise.resolve(jsonResponse({}));
    });

    const onTagsChange = vi.fn();
    render(
      <TagChips
        ticketId={TICKET_ID}
        tags={['bug', 'feature']}
        onTagsChange={onTagsChange}
      />
    );

    const container = await screen.findByTestId('tag-chips');
    expect(within(container).getByText('bug')).toBeInTheDocument();
    expect(within(container).getByText('feature')).toBeInTheDocument();
    expect(within(container).getAllByRole('button', { name: /remove tag/i })).toHaveLength(2);
  });

  it('shows an add-tag button when there are unassociated tags', async () => {
    fetchMock.mockImplementation((input: unknown) => {
      const url = urlOf(input);
      if (url === '/api/tags') return Promise.resolve(jsonResponse(ALL_TAGS));
      return Promise.resolve(jsonResponse({}));
    });

    render(
      <TagChips
        ticketId={TICKET_ID}
        tags={['bug']}
        onTagsChange={() => {}}
      />
    );

    expect(await screen.findByText('+ Add tag')).toBeInTheDocument();
  });

  it('calls POST and onTagsChange when a tag is added', async () => {
    const onTagsChange = vi.fn();
    const updatedTags = ['bug', 'ux'];

    fetchMock.mockImplementation((input: unknown, init?: RequestInit) => {
      const url = urlOf(input);
      if (url === '/api/tags') return Promise.resolve(jsonResponse(ALL_TAGS));
      if (url === `/api/tickets/${TICKET_ID}/tags` && init?.method === 'POST') {
        return Promise.resolve(jsonResponse({ tags: updatedTags }));
      }
      return Promise.resolve(jsonResponse({}));
    });

    const user = userEvent.setup();
    render(
      <TagChips
        ticketId={TICKET_ID}
        tags={['bug']}
        onTagsChange={onTagsChange}
      />
    );

    await screen.findByText('bug');

    await user.click(screen.getByText('+ Add tag'));
    const picker = await screen.findByTestId('tag-chip-picker');
    const select = within(picker).getByLabelText('Select a tag to add');
    await user.selectOptions(select, TAG_UX_ID);

    await waitFor(() => {
      expect(onTagsChange).toHaveBeenCalledWith(updatedTags);
    });

    const postCalls = fetchMock.mock.calls.filter((args) => {
      const init = args[1] as RequestInit | undefined;
      return init?.method === 'POST';
    });
    expect(postCalls.length).toBe(1);
    const sent = JSON.parse((postCalls[0]![1] as RequestInit).body as string);
    expect(sent).toEqual({ tag_id: TAG_UX_ID });
  });

  it('calls DELETE and onTagsChange when a tag remove button is clicked', async () => {
    const onTagsChange = vi.fn();
    const updatedTags: string[] = [];

    fetchMock.mockImplementation((input: unknown, init?: RequestInit) => {
      const url = urlOf(input);
      if (url === '/api/tags') return Promise.resolve(jsonResponse(ALL_TAGS));
      if (url === `/api/tickets/${TICKET_ID}/tags/${TAG_BUG_ID}` && init?.method === 'DELETE') {
        return Promise.resolve(jsonResponse({ tags: updatedTags }));
      }
      return Promise.resolve(jsonResponse({}));
    });

    const user = userEvent.setup();
    render(
      <TagChips
        ticketId={TICKET_ID}
        tags={['bug']}
        onTagsChange={onTagsChange}
      />
    );

    await screen.findByText('bug');
    await user.click(screen.getByRole('button', { name: /remove tag bug/i }));

    await waitFor(() => {
      expect(onTagsChange).toHaveBeenCalledWith(updatedTags);
    });

    const deleteCalls = fetchMock.mock.calls.filter((args) => {
      const init = args[1] as RequestInit | undefined;
      return init?.method === 'DELETE';
    });
    expect(deleteCalls.length).toBe(1);
  });

  it('shows an error when tag addition fails', async () => {
    fetchMock.mockImplementation((input: unknown, init?: RequestInit) => {
      const url = urlOf(input);
      if (url === '/api/tags') return Promise.resolve(jsonResponse(ALL_TAGS));
      if (url === `/api/tickets/${TICKET_ID}/tags` && init?.method === 'POST') {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              error: { code: 'VALIDATION_FAILED', message: 'Unknown tag id.' },
            }),
            { status: 400, headers: { 'content-type': 'application/json' } }
          )
        );
      }
      return Promise.resolve(jsonResponse({}));
    });

    const onTagsChange = vi.fn();
    const user = userEvent.setup();
    render(
      <TagChips
        ticketId={TICKET_ID}
        tags={['bug']}
        onTagsChange={onTagsChange}
      />
    );

    await screen.findByText('bug');
    await user.click(screen.getByText('+ Add tag'));
    const picker = await screen.findByTestId('tag-chip-picker');
    const select = within(picker).getByLabelText('Select a tag to add');
    await user.selectOptions(select, TAG_UX_ID);

    expect(await screen.findByRole('alert')).toHaveTextContent(/unknown tag id/i);
    expect(onTagsChange).not.toHaveBeenCalled();
  });
});
