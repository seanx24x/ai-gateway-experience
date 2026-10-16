'use client';

import { useRef } from 'react';
import type { Integration } from '@/lib/setup';

const clients = [{ id: 'sdk', label: 'AI SDK' }, { id: 'openai', label: 'OpenAI SDK' }, { id: 'anthropic', label: 'Anthropic SDK' }] as const;

export function landingCode(model: string, client: Integration) {
  if (client === 'openai') return `import OpenAI from 'openai';\n\nconst client = new OpenAI({\n  baseURL: 'https://ai-gateway.vercel.sh/v1',\n  apiKey: process.env.AI_GATEWAY_API_KEY,\n});\n\nconst response = await client.chat.completions.create({\n  model: '${model}',\n  messages: [{ role: 'user', content: 'What should we build next?' }],\n});`;
  if (client === 'anthropic') return `import Anthropic from '@anthropic-ai/sdk';\n\nconst client = new Anthropic({\n  baseURL: 'https://ai-gateway.vercel.sh',\n  apiKey: process.env.AI_GATEWAY_API_KEY,\n});\n\nconst response = await client.messages.create({\n  model: '${model}',\n  max_tokens: 1024,\n  messages: [{ role: 'user', content: 'What should we build next?' }],\n});`;
  return `import { generateText } from 'ai';\n\nconst { text } = await generateText({\n  model: '${model}',\n  prompt: 'What should we build next?',\n});`;
}

export function LandingClientTabs({ value, onChange }: { value: Integration; onChange: (value: Integration) => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const selected = clients.findIndex(client => client.id === value);
  return <div className="landing-client-tabs" role="tablist" aria-label="Integration preview">{clients.map((client, index) => <button key={client.id} ref={element => { refs.current[index] = element; }} type="button" role="tab" id={`landing-client-${client.id}`} aria-selected={index === Math.max(0, selected)} aria-controls="landing-integration-preview" tabIndex={index === Math.max(0, selected) ? 0 : -1} onClick={() => onChange(client.id)} onKeyDown={event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? clients.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + clients.length) % clients.length;
    onChange(clients[next].id); refs.current[next]?.focus();
  }}>{client.label}</button>)}</div>;
}
