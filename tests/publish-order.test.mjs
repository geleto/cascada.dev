import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { planUploads, describeUploads } from '../scripts/publish-files.mjs';
import { publishSite } from '../scripts/publish.mjs';
import { contentHash } from '../scripts/publish-config.mjs';
import { verifyReferenceRelease } from '../scripts/verify-reference.mjs';

const config = { host: 'example.invalid', port: 22, user: 'publisher', password: 'never-save-this', remoteDir: 'www' };
async function fixture(t) {
  const cache = resolve('.cache'); await mkdir(cache, { recursive:true });
  const root = await mkdtemp(join(cache, 'publish-order-'));
  assert.equal(dirname(root), cache);
  t.after(()=>rm(root, { recursive:true, force:true }));
  const directory = join(root, 'build');
  for (const [path, text] of Object.entries({ 'index.html':'Home', 'documentation/reference/index.html':'Reference', 'reference-assets/chapters-123.html':'Chapters', 'reference-assets/client-123.js':'Client', 'documentation/reference/documentation.md':'Markdown', '.htaccess':'new rules' })) {
    await mkdir(dirname(join(directory,path)),{recursive:true}); await writeFile(join(directory,path),text);
  }
  let remote = null;
  const client = {
    uploaded:[], closed:false,
    async access(){this.selected=false;}, async cd(){this.selected=true;}, async pwd(){return this.selected ? '/account/www' : '/account';}, async list(){return [];},
    async readRemoteFile(){return remote === null ? null : Buffer.from(remote);},
    async uploadFiles(path, files){for (const file of files){this.uploaded.push(file);if(file==='.htaccess')remote=await readFile(join(path,file),'utf8');}},
    async close(){this.closed=true;},
  };
  return { directory, client, stateDirectory:join(root,'state'), setRemote:value=>{remote=value;}, remote:()=>remote };
}

test('dry-run order is the real asset, page, routing order, including shared HTML assets', async t=>{
  const f=await fixture(t); const phases=await planUploads(f.directory);
  assert.ok(phases[0].files.includes('reference-assets/chapters-123.html'));
  assert.ok(phases[1].files.includes('documentation/reference/index.html'));
  assert.deepEqual(phases[2].files,['.htaccess']);
  assert.match(describeUploads(phases), /1\. assets: 3 files\n2\. pages: 2 files\n3\. routing: 1 files \(\.htaccess last\)/);
  await publishSite({...f, config, log(){}, uploadPlan:phases});
  assert.deepEqual(f.client.uploaded, phases.flatMap(p=>p.files));
  assert.equal(f.remote(),'new rules');
});

test('unknown remote configuration requires a reviewed hash, and unchanged baselines permit later updates', async t=>{
  const f=await fixture(t); f.setRemote('hosting rules');
  await assert.rejects(publishSite({...f,config,log(){}}), /differs from the published baseline/);
  assert.deepEqual(f.client.uploaded,[]);
  await publishSite({...f,config,log(){},reviewedConfigHash:contentHash('hosting rules')});
  assert.equal(f.remote(),'new rules');
  await writeFile(join(f.directory,'.htaccess'),'newer merged rules');
  await publishSite({...f,config,log(){}});
  assert.equal(f.remote(),'newer merged rules');
});

test('matching remote bytes recover a missing baseline without rewriting the routing file', async t=>{
  const f=await fixture(t); f.setRemote('new rules');
  await publishSite({...f,config,log(){}});
  assert.ok(!f.client.uploaded.includes('.htaccess'));
  await writeFile(join(f.directory,'.htaccess'),'next rules');
  await publishSite({...f,config,log(){}});
  assert.equal(f.remote(),'next rules');
});

test('external drift is rechecked before activation and does not replace unknown rules', async t=>{
  const f=await fixture(t);
  const upload=f.client.uploadFiles.bind(f.client);
  f.client.uploadFiles=async(path,files)=>{await upload(path,files);if(files.includes('index.html'))f.setRemote('external edit');};
  await assert.rejects(publishSite({...f,config,log(){}}),/differs from the published baseline/);
  assert.equal(f.remote(),'external edit');
  assert.ok(!f.client.uploaded.includes('.htaccess'));
});

test('an earlier upload failure prevents routing activation and baseline adoption', async t=>{
  const f=await fixture(t);
  f.client.uploadFiles=async()=>{throw new Error('transfer failed');};
  await assert.rejects(publishSite({...f,config,log(){}}),/transfer failed/);
  assert.equal(f.remote(),null);
  assert.equal(f.client.closed,true);
  f.setRemote('unreviewed rules');
  await assert.rejects(publishSite({...f,config,log(){}}),/differs from the published baseline/);
});

test('config baselines are scoped to the exact server, account and resolved destination', async t=>{
  const f=await fixture(t);await publishSite({...f,config,log(){}});
  await writeFile(join(f.directory,'.htaccess'),'new rules v2');
  await assert.rejects(publishSite({...f,config:{...config,user:'another-account'},log(){}}), /differs from the published baseline/);
});

test('release verification requires permanent redirects and preserves suffixes and queries', async()=>{
  let mode='good'; const requests=[];
  const fetch=async(url,options)=>{
    requests.push({url,options});
    if(url.includes('/quick-reference')) {
      if(mode==='stale')return new Response('old page',{status:200});
      const destination=url.replace('/quick-reference','/reference').replace(/\/reference$/, '/reference/');
      return new Response('',{status:301,headers:{location:mode==='query' ? destination.split('?')[0] : destination}});
    }
    if (url.includes('/voicesessionsetup_') || url.includes('_asstream_astool/')) {
      if (mode === 'retired') return new Response('missing', { status: 404 });
      return new Response('', { status: 301, headers: { location: url.replace('/voicesessionsetup_', '/voiceagentbackend_').replace('_asstream_astool/', '_astool/') } });
    }
    const exported = new URL(url);
    const format = exported.pathname.endsWith('/README.md') ? 'md' : exported.pathname.endsWith('/reference.json') ? 'json' : null;
    if (format) {
      const destination = `${exported.origin}${exported.pathname.replace(/(?:README\.md|reference\.json)$/, '')}?download=${format}${exported.search ? '&' + exported.search.slice(1) : ''}`;
      return new Response('', { status: 301, headers: { location: destination } });
    }
    return new Response('guide-first-workflow ref-components',{status:200});
  };
  await verifyReferenceRelease('https://example.invalid',{fetch,log(){}});
  assert.ok(requests.some(r=>r.url.includes('?view=config&options=asTool')));
  assert.ok(requests.every(r=>r.options.redirect==='manual'));
  mode='stale';await assert.rejects(verifyReferenceRelease('https://example.invalid',{fetch,log(){}}),/must return 301/);
  mode='query';await assert.rejects(verifyReferenceRelease('https://example.invalid',{fetch,log(){}}),/Unexpected redirect destination/);
  mode='retired';await assert.rejects(verifyReferenceRelease('https://example.invalid',{fetch,log(){}}),/Retired component URL/);
});
