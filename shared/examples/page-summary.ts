import { LLMAgent, z } from 'casai';
import { openai } from '@ai-sdk/openai';
// Your app's helper for loading page text.
import { fetchPage } from './pages.js';

const summarizePage =
  LLMAgent.withTemplate.asTool({
    model: openai('gpt-4o-mini'),
    description:
      'Read a web page and summarize it.',
    inputSchema: z.object({
      url: z.string()
    }),
    context: { fetchPage },
    prompt: `Summarize in five bullets:
      {{ fetchPage(url) }}`
  });

const researchAssistant = LLMAgent({
  model: openai('gpt-4o-mini'),
  tools: { summarizePage },
  instructions: `
    Answer using the supplied URLs.
    Use summarizePage to read each page.
  `
});

const result = await researchAssistant(`
  Is this backpack good for commuting?
  Product: https://example.com/bag
  Reviews: https://example.com/bag/reviews
`);

console.log(result.output);
