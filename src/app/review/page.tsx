import GatewayApp from '@/components/gateway-app';
export const metadata = { title: 'Behind the design · AI Gateway · Sean Lynch', description: 'Try the product, then explore the design decisions behind this independent AI Gateway concept.' };
export default function Page() { return <GatewayApp initialView="overview" reviewerEntry />; }
