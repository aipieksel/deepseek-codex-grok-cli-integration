import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {generate,parseReply,responseSchemaFor,requestText,validatedReply} from '../lib/cli-adapter.js';

test('response schema admits only supplied tool names, including no-tool requests',()=>{
  const schema=responseSchemaFor([{name:'read'},{name:'skill'}]);
  assert.deepEqual(schema.properties.toolCalls.items.properties.name.enum,['read','skill']);
  assert.equal(responseSchemaFor([]).properties.toolCalls.maxItems,0);
  assert.throws(()=>parseReply({text:'',toolCalls:[{name:'read_file',arguments:'{}'}]},[{name:'read'}]),/unavailable tool/);
});

test('Grok process receives verbatim full history and the authoritative tool catalog',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'ap-cli-test-'));
  const previous=process.env.AGENTS_PRO_GROK;
  try {
    const fake=join(dir,'grok'),capture=join(dir,'capture.json');
    await writeFile(fake,`#!${process.execPath}\nconst fs=require('node:fs');const args=process.argv.slice(2);fs.writeFileSync(${JSON.stringify(capture)},JSON.stringify({args,backendSearch:process.env.GROK_BACKEND_SEARCH,prompt:fs.readFileSync(args[args.indexOf('--prompt-file')+1],'utf8')}));console.log(JSON.stringify({structuredOutput:{text:'retained result',toolCalls:[]}}));`,{mode:0o700});
    process.env.AGENTS_PRO_GROK=fake;
    const options={provider:'grok-cli',model:'grok-4.7',tools:[{name:'read'}],messages:[{role:'user',content:[{type:'text',text:'long history '.repeat(30000)}]},{role:'tool',content:[{type:'tool-result',toolCallId:'loaded-skill',content:[{type:'text',text:'Skill already loaded: PROOF-538'}]}]}]};
    assert.equal((await generate(options)).text,'retained result');
    const result=JSON.parse(await readFile(capture,'utf8'));
    assert(result.args.includes('--verbatim'));
    assert(result.args.includes('--no-subagents'));
    assert(result.args[result.args.indexOf('--disallowed-tools')+1].includes('read_file'));
    assert(result.prompt.startsWith(requestText(options)));
    assert.equal(result.backendSearch,'0');
    assert(result.prompt.includes('PROOF-538'));
    assert.deepEqual(JSON.parse(result.args[result.args.indexOf('--json-schema')+1]).properties.toolCalls.items.anyOf[0].properties.name.enum,['read']);
    // Temporary payloads are removed on successful completion.
    await assert.rejects(readFile(result.args[result.args.indexOf('--prompt-file')+1]),{code:'ENOENT'});
  } finally {
    if(previous===undefined)delete process.env.AGENTS_PRO_GROK;else process.env.AGENTS_PRO_GROK=previous;
    await rm(dir,{recursive:true,force:true});
  }
});


test('complete Grok envelopes and structured argument objects normalize without changing content',()=>{
  const tools=[{name:'read'}];
  const reply={text:'next',toolCalls:[{name:'read',arguments:{file_path:'/tmp/a "quoted" name.md',limit:200}}]};
  for(const envelope of [reply,{structuredOutput:reply},{structured_output:JSON.stringify(reply)},{result:JSON.stringify(reply)},{text:JSON.stringify(reply),stopReason:'end_turn'}]) {
    const result=parseReply(JSON.stringify(envelope),tools);
    assert.deepEqual(JSON.parse(result.toolCalls[0].arguments),reply.toolCalls[0].arguments);
  }
  // A malformed structured result must not fall back to a conflicting text payload.
  assert.throws(()=>parseReply({structuredOutput:null,text:JSON.stringify(reply)},tools),e=>e.code==='CLI_PROTOCOL_ERROR');
});

test('malformed multi-tool batch is rejected in full, including the observed nested JSON fault',()=>{
  const tools=[{name:'read'},{name:'grep'}];
  const broken={text:'read planning files',toolCalls:[{name:'read',arguments:'{"file_path":"/tmp/planner.md"}'},{name:'grep',arguments:'{"pattern":"controls","head_limit":80}},{"'}]};
  assert.throws(()=>parseReply({structuredOutput:broken},tools),e=>e.code==='CLI_PROTOCOL_ERROR');
  for(const invalid of ['', '{"text":', {text:'next',toolCalls:[null]}, {text:'next',toolCalls:[{name:'read',arguments:[]}]}])assert.throws(()=>parseReply(invalid,tools),e=>e.code==='CLI_PROTOCOL_ERROR');
});

test('protocol correction retries once before dispatch and never retries process failures or cancellation',async()=>{
  let attempts=[];
  const reply=await validatedReply(async n=>{attempts.push(n);return n===0?'broken':{text:'ok',toolCalls:[{name:'read',arguments:{file_path:'/tmp/x'}}]};},[{name:'read'}]);
  assert.deepEqual(attempts,[0,1]);assert.equal(reply.toolCalls.length,1);
  attempts=[];await assert.rejects(validatedReply(async n=>{attempts.push(n);return '{}';},[]),e=>e.code==='CLI_PROTOCOL_ERROR');assert.deepEqual(attempts,[0,1]);
  attempts=[];await assert.rejects(validatedReply(async n=>{attempts.push(n);throw Error('process failed');},[]),/process failed/);assert.deepEqual(attempts,[0]);
  const controller=new AbortController();attempts=[];
  await assert.rejects(validatedReply(async n=>{attempts.push(n);controller.abort(Error('cancelled'));return '{}';},[],controller.signal),/cancelled/);assert.deepEqual(attempts,[0]);
});
