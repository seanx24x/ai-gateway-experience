import { inferenceCost, type RequestRecord } from './gateway';

/** Prepared example copy. No model is called and no customer data is collected. */
export const DISCOVERY_PROMPT = 'Draft a short, helpful support reply. Ask for the information needed to investigate; do not promise a refund.\n\nCustomer: “I was charged twice for my order. Can you help?”';

export const DISCOVERY_RESPONSE = 'Thanks for flagging this. I’m sorry for the confusion. Please send your order number and the dates and amounts shown for both charges. We’ll check whether one is a pending authorization or a duplicate payment and follow up with the next steps. Please don’t send card details.';

/**
 * A prepared answer travels through the same receipt and replay as any demo.
 * Counts and output timing remain illustrative, using the simulator's existing
 * character estimate and preserving its synthetic output rate.
 */
export function withPreparedResponse(record: RequestRecord, response: string): RequestRecord {
  if (record.status !== 'success' && record.status !== 'recovered') return record;
  const outputTokens = Math.ceil(response.length / 4);
  const outputDuration = Math.max(0, record.durationMs - record.ttftMs);
  return {
    ...record,
    response,
    outputTokens,
    cost: inferenceCost(record.servedModel, record.inputTokens, outputTokens),
    durationMs: record.ttftMs + Math.round(outputDuration * outputTokens / Math.max(1, record.outputTokens)),
  };
}
