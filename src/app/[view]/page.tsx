import GatewayApp, { type View } from '@/components/gateway-app';
import { notFound } from 'next/navigation';
const views = ['dashboard', 'connect', 'playground', 'routes', 'monitor', 'budgets', 'keys', 'byok', 'virtual-models', 'settings', 'models', 'leaderboards', 'documentation'];
export function generateStaticParams() { return views.map(view => ({ view })); }
export default async function Page({ params }: { params: Promise<{ view: string }> }) {
  const { view } = await params;
  if (!views.includes(view)) notFound();
  return <GatewayApp initialView={view as View} />;
}
