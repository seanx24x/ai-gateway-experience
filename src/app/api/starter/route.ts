import { buildStarterZip, parseStarterContext } from '@/lib/starter';

export const runtime = 'nodejs';

/** This endpoint builds source files only. It never calls Gateway or reads keys. */
export function GET(request: Request) {
  const context = parseStarterContext(new URL(request.url).searchParams);
  if (!context) return Response.json({ error: 'Choose a supported client, model, and routing configuration.' }, { status: 400 });
  const archive = buildStarterZip(context);
  return new Response(new Uint8Array(archive), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="gateway-starter-${context.integration}.zip"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
