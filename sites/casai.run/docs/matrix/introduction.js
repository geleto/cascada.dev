// Shared introductory content for the matrix and the full documentation.
// Layout belongs to the website; keep this content independent of its UI.
export const introduction = {
  title: 'Orchestrate reusable components with Casai',
  lead: 'Casai combines AI agents, [templates](https://cascada.dev/cascada-template/), [scripts](https://cascada.dev/cascada-script/) and JavaScript/TypeScript code into reusable workflows. Write the workflow logic in [CascadaScript](https://cascada.dev/cascada-script/) - a simple, instantly familiar language with automatic concurrency - to call components, make decisions and combine results.',
  principles: [
    {
      title: 'Concurrency and streaming',
      text: 'AI workflows often spend much of their time waiting for model responses, web pages, APIs and databases - sometimes for seconds or minutes. Your code logic already says what depends on what. Cascada uses those dependencies to run independent operations concurrently, waiting only for the results each step needs. Streaming lets you process data immediately when it becomes available. [LLMAgent](component:LLMAgent?options=asStream) uses `.asStream` for streaming responses. [Script](component:Script), [Function](component:Function), [speech generation](component:SpeechGenerator?options=asStream) and [transcription](component:Transcriber?options=asStream) can also produce streams.',
    },
    {
      title: 'Components - create, reuse and swap',
      text: '[LLMAgent](component:LLMAgent), [Template](component:Template), [Script](component:Script) and [Function](component:Function) are factories for reusable components with a common interface. Call them with different inputs. Schemas validate input and results. With matching inputs and returned values, swap deterministic code for an LLM agent or try other approaches without changing the workflow.',
    },
    {
      title: 'The context object - structured data input',
      text: 'Each component has a source property, such as [`prompt`](component:LLMAgent?property=prompt), [`input`](component:Embedder?property=input), [`query`](component:Reranker?property=query), [`text`](component:SpeechGenerator?property=text) or [`audio`](component:Transcriber?property=audio). Supply it directly - for example, as plain text - or use a supported Cascada Template (`.withTemplate`), Cascada Script (`.withScript`) or JavaScript function (`.withFunction`) to build it from a `context` object. This lets the component work with your own structured data.',
    },
    {
      title: 'Shared configuration - inherit and specialize',
      text: 'Share models, tools, schemas and context defaults through [`Config`](component:Config). Components can inherit from a compatible `Config` or another component, overriding only what needs to change. Create specialized agents and workflows without repeating their setup.',
    },
    {
      title: 'Call tools',
      text: '[LLMAgent](component:LLMAgent?property=tools), [Template](component:Template?property=tools), [Script](component:Script?property=tools), [Function](component:Function?property=tools) and [VoiceSessionSetup](component:VoiceSessionSetup?property=tools) can call tools registered with the `tools` config option, including AI SDK tools and [MCP tools](https://ai-sdk.dev/docs/ai-sdk-core/mcp-tools) connected through the [AI SDK MCP client](https://ai-sdk.dev/docs/reference/ai-sdk-core/create-mcp-client). Other components can call the same tools from a template, script or function that prepares their input.',
    },
    {
      title: 'Turn a component into a tool',
      text: 'Almost all components can become tools: add `.asTool` to the factory and an `inputSchema` declaring their arguments. Agents, workflows and other components that support tools can then call them.',
    },
  ],
};
