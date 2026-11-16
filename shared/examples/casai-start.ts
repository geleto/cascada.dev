import { LLMAgent, z } from 'casai';
import { openai } from '@ai-sdk/openai';

const summarize = LLMAgent.withTemplate({
  model: openai('gpt-4o-mini'),
  inputSchema: z.object({
    document: z.string()
  }),
  prompt: `Summarize in one sentence:
    {{ document }}`
});

const result = await summarize({
  document:
    'The new website launched on Monday. '
    + 'It has new docs and simpler signup.'
});

console.log(result.output);
