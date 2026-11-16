import { AsyncEnvironment } from 'cascada-engine';

async function fetchJson(path: string) {
  const response = await fetch(
    `https://jsonplaceholder.typicode.com${path}`
  );
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

const env = new AsyncEnvironment();

const result = await env.renderScriptString(`
  var user = fetchJson("/users/1")
  var posts = fetchJson("/posts?userId=1")

  return { name: user.name, postCount: posts.length }
`, { fetchJson });

console.log(result);
