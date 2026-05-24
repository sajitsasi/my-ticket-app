/**
 * Legacy CSV export utility.
 * Retained from the original export pipeline — no longer called by any route.
 * Kept for backward-compatibility reference during migration.
 */

export function legacyExport(ticketIds: string[]): string {
  const header = 'id';
  const rows = ticketIds.map((id) => id);
  return [header, ...rows].join('\n');
}

export function legacyExportWithMetadata(
  tickets: Array<{ id: string; title: string; status: string }>
): string {
  const header = 'id,title,status';
  const rows = tickets.map((t) => `${t.id},"${t.title}",${t.status}`);
  return [header, ...rows].join('\n');
}
