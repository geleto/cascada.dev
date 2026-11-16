import {
  Config, LLMAgent, Script, FileSystemLoader, z
} from 'casai';
import { Output } from 'ai';
import { openai } from '@ai-sdk/openai';
// Your own catalog, reviews and pricing integrations.
import {
  fetchSpecs, fetchReviews, fetchPrice
} from './product-api.js';

// Share a model across both agents.
const defaults = Config({
  model: openai('gpt-4o-mini')
});

// Stream a list of models to compare.
const findProducts = LLMAgent.withTemplate.asStream({
  inputSchema: z.object({
    productName: z.string(),
    count: z.number().int().positive()
  }),
  prompt: `Suggest {{ count }} {{ productName }}
    models to compare. Return only model names.`,
  output: Output.array({ element: z.string() })
}, defaults);

// Build a prompt from each product's fetched data.
const summarizeProduct = LLMAgent.withTemplate({
  inputSchema: z.object({
    product: z.string(),
    specs: z.record(z.string(), z.string()),
    reviews: z.array(z.string()),
    price: z.number().nonnegative()
  }),
  prompt: `Summarize this headphone.
    Use only the supplied information.
    Model: {{ product }}
    Specs: {{ specs | dump }}
    Reviews: {{ reviews | dump }}
    Price: {{ price | dump }}`
}, defaults);

// Save the CascadaScript example as headphones.cas.
const compare = Script.loadsScript({
  loader: new FileSystemLoader('./'),
  script: 'headphones.cas',
  context: {
    findProducts, summarizeProduct,
    fetchSpecs, fetchReviews, fetchPrice
  }
});

const summaries = await compare();
console.log(summaries);
