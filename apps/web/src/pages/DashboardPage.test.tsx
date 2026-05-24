import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DashboardPage } from './DashboardPage';
import { personaStore } from '../personaStore';

const ALICE_ID = '11111111-1111-1111-1111-111111111111';

const sampleDashboard = {
  byStatus: { open: 3, in_progress: 2, resolved: 1, closed: 1 },
  byPriority: { low: 2, medium: 2, high: 2, urgent: 1 },
  avgResolutionTime: 3600,
  slaBreachCount: 2,
  topAssignees: [
    { id: 'a1', name: 'Alice Agent', openCount: 3 },
    { id: 'b2', name: 'Bob Builder', openCount: 1 },
  ],
};

let fetchMock: Mock;

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

beforeEach(() => {
  window.localStorage.clear();
  personaStore.setId(ALICE_ID);
  fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url === '/api/dashboard') {
      return jsonResponse(sampleDashboard);
    }
    return new Response('not found', { status: 404 });
  });
  vi.stubGlobal('fetch', fetchMock);
});

function renderDashboard() {
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <DashboardPage />
    </MemoryRouter>
  );
}

describe('DashboardPage', () => {
  it('renders the dashboard heading', async () => {
    renderDashboard();
    expect(
      await screen.findByRole('heading', { name: /dashboard/i })
    ).toBeInTheDocument();
  });

  it('renders all five stat sections', async () => {
    renderDashboard();
    await screen.findByRole('heading', { name: /dashboard/i });

    expect(screen.getByText(/by status/i)).toBeInTheDocument();
    expect(screen.getByText(/by priority/i)).toBeInTheDocument();
    expect(screen.getByText(/average resolution/i)).toBeInTheDocument();
    expect(screen.getByText(/sla breach/i)).toBeInTheDocument();
    expect(screen.getByText(/top assignees/i)).toBeInTheDocument();
  });

  it('renders status counts with labels', async () => {
    renderDashboard();
    await screen.findByRole('heading', { name: /dashboard/i });

    // Status section heading + individual labels
    expect(screen.getByText(/by status/i)).toBeInTheDocument();
    expect(screen.getByText('Open')).toBeInTheDocument();
    expect(screen.getByText('In Progress')).toBeInTheDocument();
    expect(screen.getByText('Resolved')).toBeInTheDocument();
    expect(screen.getByText('Closed')).toBeInTheDocument();
  });

  it('renders priority counts with labels', async () => {
    renderDashboard();
    await screen.findByRole('heading', { name: /dashboard/i });

    expect(screen.getByText(/by priority/i)).toBeInTheDocument();
    expect(screen.getByText('Urgent')).toBeInTheDocument();
    expect(screen.getByText('High')).toBeInTheDocument();
    expect(screen.getByText('Medium')).toBeInTheDocument();
    expect(screen.getByText('Low')).toBeInTheDocument();
  });

  it('renders avgResolutionTime as seconds', async () => {
    renderDashboard();
    await screen.findByRole('heading', { name: /dashboard/i });

    expect(screen.getByText(/3600 seconds/)).toBeInTheDocument();
  });

  it('renders null avgResolutionTime as N/A', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === '/api/dashboard') {
        return jsonResponse({ ...sampleDashboard, avgResolutionTime: null });
      }
      return new Response('not found', { status: 404 });
    });

    renderDashboard();
    await screen.findByRole('heading', { name: /dashboard/i });

    expect(screen.getByText(/n\/a/i)).toBeInTheDocument();
  });

  it('renders SLA breach count', async () => {
    renderDashboard();
    await screen.findByRole('heading', { name: /dashboard/i });

    // The SLA breach count is rendered as a stat-big element
    const breachHeading = screen.getByText(/sla breach/i);
    const card = breachHeading.closest('.dashboard-card');
    expect(card).not.toBeNull();
    expect(card!.querySelector('.stat-big')!.textContent).toBe('2');
  });

  it('renders top assignees list', async () => {
    renderDashboard();
    await screen.findByRole('heading', { name: /dashboard/i });

    expect(screen.getByText('Alice Agent')).toBeInTheDocument();
    expect(screen.getByText('Bob Builder')).toBeInTheDocument();
    // Alice has 3 open tickets
    expect(screen.getByText('3 open')).toBeInTheDocument();
    // Bob has 1 open ticket
    expect(screen.getByText('1 open')).toBeInTheDocument();
  });

  it('renders empty state for top assignees when none', async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === '/api/dashboard') {
        return jsonResponse({ ...sampleDashboard, topAssignees: [] });
      }
      return new Response('not found', { status: 404 });
    });

    renderDashboard();
    await screen.findByRole('heading', { name: /dashboard/i });

    expect(screen.getByText(/no assignees/i)).toBeInTheDocument();
  });

  it('renders without console errors on mount', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    renderDashboard();
    await screen.findByRole('heading', { name: /dashboard/i });
    expect(consoleSpy).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('shows loading state before data arrives', () => {
    let resolveDashboard: (value: Response) => void = () => {};
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === '/api/dashboard') {
        return new Promise<Response>((resolve) => {
          resolveDashboard = resolve;
        });
      }
      return new Response('not found', { status: 404 });
    });

    renderDashboard();
    expect(screen.getByRole('status')).toBeInTheDocument();

    resolveDashboard(jsonResponse(sampleDashboard));
  });
});
