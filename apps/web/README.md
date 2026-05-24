# Ticket App — Web Frontend

## Filter & Search Persistence

**Strategy: URL-encoded persistence.**

Active filter and search state on the Tickets list page is synced to the browser URL query string. For example:

```
/?status=open&priority=high&tag=bug&q=login
```

### Behavior across hard reload

- **Filters persist.** When the user reloads the page (or presses F5 / Cmd+R), the browser preserves the URL, and the TicketsPage component re-reads filter values from the URL on mount. The same filtered view is restored deterministically.
- **Clearing filters** removes all query parameters, returning the URL to the base path (`/`).

### Supported query parameters

| Parameter | Value format | Example |
|-----------|-------------|---------|
| `status`   | `open`, `in_progress`, `resolved`, `closed` | `?status=open` |
| `priority` | `low`, `medium`, `high`, `urgent` | `?priority=high` |
| `assignee` | User UUID | `?assignee=11111111-1111-1111-1111-111111111111` |
| `tag`      | Tag name string | `?tag=bug` |
| `q`        | URL-encoded search term | `?q=login%20button` |

Parameters combine via AND logic. An empty or missing parameter means "no filter" for that dimension.
