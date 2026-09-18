export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Liveness only: this does not check a database or external dependencies.
export function GET() {
  return Response.json(
    { status: 'ok', timestamp: new Date().toISOString() },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
