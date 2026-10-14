const ts = require('typescript');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const root = require('node:path').resolve(__dirname, '..') + '/';
function load(path, modules) {
 const source = fs.readFileSync(root + path, 'utf8').replaceAll('import.meta.env', 'globalThis.__testEnv');
 const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
 const mod = { exports: {} };
 new Function('require', 'module', 'exports', code)(name => modules[name], mod, mod.exports);
 return mod.exports;
}
globalThis.__testEnv = { PROD: true };
const utils = load('src/utils/ai.ts', {});
const reading = load('src/utils/reading-assistance.ts', {});
for(const action of ['explain','example','translate']) {
 const quote='Transformer 使用自注意力机制。\n保留公式 x = Wq。';
 const prompt=reading.passagePrompt(action,quote);
 assert.ok(prompt.includes(quote), 'selected text and formulas must reach the model unchanged');
 assert.ok(reading.passagePrompt(action,'字'.repeat(10000)).length<=utils.MAX_MESSAGE_LENGTH, 'selected-text prompt must fit the API limit');
}
assert.ok(reading.referencePrompt('题'.repeat(10000)).length<=utils.MAX_MESSAGE_LENGTH);
assert.ok(reading.reviewPrompt.includes('不给答案'), 'self-test must let the reader think before revealing references');
const markup=require('node-html-parser').parse('<div class="markdown-content"><section><h2 id="heading">标题</h2><section><p id="paragraph"><strong id="term">概念</strong></p><ul id="list"><li><p><em id="list-text">列表内容</em></p></li></ul><table id="table"><tr><td id="cell">表格内容</td></tr></table><pre id="code"><code id="code-text">print(x)</code></pre></section></section></div>',{blockTextElements:{}});
for(const [selected,anchor] of [['term','paragraph'],['list-text','list'],['cell','table'],['code-text','code'],['heading','heading']]) {
 assert.equal(reading.passageAnchor(markup.querySelector('#'+selected)).id,anchor,'help must be beside the passage without breaking nested sections, lists or tables');
}
console.log('PASS: bounded passage prompts, preserved quotes/formulas, nested Markdown placement, three-question review before references.');
const fixtures = new Map([['public', {data: {title:'测试文章',encrypted:false,draft:false},body:'开头：学习Docker。结尾：容器与镜像不同。'}], ['secret',{data:{encrypted:true},body:'私密正文'}],['draft',{data:{draft:true},body:'草稿正文'}]]);
const sse = load('src/utils/sse.ts', {});
const {petChatLayout,petPanelLayout}=load('src/utils/pet-chat-layout.ts', {});
for(const [w,h,pet] of [
 [583,900,{left:16,right:104,top:795,bottom:883}],
 [390,844,{left:16,right:104,top:738,bottom:826}],
 [320,640,{left:16,right:104,top:534,bottom:622}],
 [390,844,{left:152,right:240,top:350,bottom:438}],
 [1440,900,{left:1270,right:1424,top:700,bottom:854}],
 [780,400,{left:340,right:428,top:170,bottom:258}],
]) {
 const box=petChatLayout(w,h,pet);
 assert.ok(box.left>=0 && box.top>=0 && box.left+box.width<=w && box.top+box.height<=h);
 assert.ok(box.left+box.width<=pet.left || box.left>=pet.right || box.top+box.height<=pet.top || box.top>=pet.bottom, 'chat must not cover pet');
}
// Chat, information and speech share collision rules, including a dragged pet in the middle.
let panelCases=0;
for (const w of [320,390,583,780,1440]) for (const h of [240,400,640,844,900]) {
 for (const petSize of [88,154]) for (const x of [8,(w-petSize)/2,w-petSize-8]) for (const y of [8,(h-petSize)/2,h-petSize-8]) {
  const pet={left:x,right:x+petSize,top:y,bottom:y+petSize};
  for(const size of [{width:370,height:560},{width:256,height:340},{width:215,height:90},{width:175,height:150}]) {
   const box=petPanelLayout(w,h,pet,size);
   assert.ok(box.width>0 && box.height>0, 'surface must have usable scroll space');
   assert.ok(box.left>=12 && box.top>=12 && box.left+box.width<=w-12 && box.top+box.height<=h-12, 'surface must stay in viewport');
   assert.ok(box.left+box.width<=pet.left-14 || box.left>=pet.right+14 || box.top+box.height<=pet.top-14 || box.top>=pet.bottom+14, 'surface must keep a gap from the pet');
   panelCases++;
  }
 }
}
console.log(`Pet surface layout: ${panelCases} viewport/position/size cases passed.`);
const guideFixtures = [
 {id:'agent/start',data:{title:'AI Agent 入门',tags:['Agent'],description:'智能体基础',published:new Date('2026-01-01')},body:'不应发送的正文'},
 {id:'bpe',data:{title:'AI Tokenizer 从零入门',tags:['AI'],description:'学习分词器基础',published:new Date('2025-01-01')}},
 {id:'secret',data:{title:'秘密标题',tags:[],description:'私密简介',encrypted:true}},
 {id:'draft',data:{title:'草稿标题',tags:[],description:'未发布简介',draft:true}},
];
const guide = load('src/utils/site-guide.server.ts', {'astro:content':{getCollection:async(_,filter)=>guideFixtures.filter(filter)},'@/config':{siteConfig:{title:'测试网站'}},'@utils/url':{getPostUrl:entry=>'/posts/'+(entry.data.routeName || entry.id)+'/'}});
const route = load('src/pages/api/ai.ts', {'astro:content':{getEntry:async (_,id) => fixtures.get(id)},'@utils/ai':utils,'@utils/sse':sse,'@utils/site-guide.server':guide});
process.env.BIGMODEL_API_KEY='test-key'; process.env.BIGMODEL_MODEL='glm-4.7-flash';
let calls=0, lastBody, providerStatus=200;
globalThis.fetch=async (url,options) => {
 calls++; assert.equal(JSON.parse(options.body).model,'glm-4.7-flash'); assert.equal(JSON.parse(options.body).tools,undefined); assert.ok(url === 'https://open.bigmodel.cn/api/paas/v4/chat/completions');
 assert.equal(options.headers.authorization,'Bearer test-key'); lastBody=JSON.parse(options.body);
 return new Response(JSON.stringify(providerStatus===200 ? {choices:[{message:{reasoning_content:'隐藏思考',content:'**这是一段真实响应格式的测试内容。**'},finish_reason:'stop'}]} : {error:{message:'test-key secret-project'}}),{status:providerStatus});
};
const invoke=(body,ip='test',headers={}) => route.POST({request:new Request('http://localhost:4321/api/ai/',{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)}),clientAddress:ip,locals:{}});
(async()=>{
 assert.equal((await invoke(null)).status,400);
 assert.equal((await invoke({action:'chat',postId:'public',message:'x',history:[{role:'model',text:'x'}]})).status,400);
 assert.equal((await invoke({action:'summary',postId:'secret'})).status,404);
 assert.equal((await invoke({action:'summary',postId:'draft'})).status,404);
 assert.equal((await invoke({action:'summary',postId:'missing'})).status,404);
 assert.equal((await invoke({action:'summary',postId:'public'},'test',{origin:'https://other.example'})).status,403);
 assert.equal(calls,0);
 process.env.BIGMODEL_MODEL='glm-4.7-flashx'; assert.equal((await invoke({action:'summary',postId:'public'})).status,503); assert.equal(calls,0); process.env.BIGMODEL_MODEL='glm-4.7-flash';
 const petRequest={action:'pet',persona:'lulu',message:'推荐 AI Agent 入门文章',currentPath:'/'};
 assert.equal((await invoke({...petRequest,persona:'bad'})).status,400);
 assert.equal((await invoke({...petRequest,currentPath:'https://other.example/'})).status,400);
 assert.equal((await invoke({...petRequest,currentPath:'//other.example/'})).status,400);
 assert.equal((await invoke({...petRequest,message:' '.repeat(2)})).status,400);
 process.env.BIGMODEL_MODEL='glm-4.7-flashx'; assert.equal((await invoke(petRequest)).status,503); assert.equal(calls,0); process.env.BIGMODEL_MODEL='glm-4.7-flash';
 const guideInfo=await guide.siteGuide('nailong',petRequest.message,[],petRequest.currentPath);
 assert.ok(guideInfo.instruction.includes('奶龙')); assert.ok(guideInfo.instruction.includes('Ctrl+K'));
 assert.ok(!/秘密标题|私密简介|草稿标题|未发布简介|不应发送的正文/.test(guideInfo.instruction));
 const usageGuide=await guide.siteGuide('lulu','怎么搜索文章和使用 AI 总结？',[],'/'); assert.ok(!usageGuide.links.some(link=>link.url==='/posts/agent/start/'));
 assert.equal(guideInfo.links[0].url,'/posts/'); assert.ok(guideInfo.links.some(link=>link.url==='/posts/agent/start/')); assert.ok(!guideInfo.links.some(link=>link.url==='/posts/bpe/'));
 const petResponse=await invoke(petRequest,'pet'); assert.equal(petResponse.status,200);
 const petResult=await petResponse.json(); assert.equal(petResult.truncated,false); assert.ok(petResult.links.some(link=>link.url==='/posts/agent/start/'));
 assert.ok(lastBody.messages[0].content.includes('水豚噜噜')); assert.equal(lastBody.messages.at(-1).content,petRequest.message);
 calls=0;
 const [a,b] = await Promise.all([invoke({action:'summary',postId:'public'}),invoke({action:'summary',postId:'public'})]);
 assert.equal(a.status,200); assert.equal(b.status,200); assert.equal(calls,1);
 const response=await a.json(); assert.equal(response.text,'这是一段真实响应格式的测试内容。'); assert.ok(!response.text.includes('思考'));
 assert.ok(lastBody.messages[0].content.includes('容器与镜像不同'));
 assert.equal((await (await invoke({action:'summary',postId:'public'})).json()).cached,true); assert.equal(calls,1);
 fixtures.get('public').body += '更新的内容'; await invoke({action:'summary',postId:'public'}); assert.equal(calls,2);
 const history=[{role:'user',text:'上一轮问题'},{role:'model',text:'上一轮答案'}];
 for(const message of [reading.passagePrompt('explain','容器与镜像不同。'),reading.glossaryPrompt,reading.reviewPrompt,reading.referencePrompt('1. 容器与镜像有什么区别？')]) {
  const result=await invoke({action:'chat',postId:'public',message,history:[]},'study-'+message.slice(0,10));
  assert.equal(result.status,200); assert.equal(lastBody.messages.at(-1).content,message);
  assert.ok(lastBody.messages[0].content.includes('容器与镜像不同'));
  assert.equal(lastBody.model,'glm-4.7-flash'); assert.equal(lastBody.tools,undefined);
 }
 await invoke({action:'chat',postId:'public',message:'后续问题',history}); assert.equal(lastBody.model,'glm-4.7-flash'); assert.equal(lastBody.thinking.type,'disabled'); assert.equal(lastBody.messages[2].role,'assistant'); assert.equal(lastBody.messages.length,4); assert.equal(lastBody.messages[3].content,'后续问题');
 providerStatus=429;
 const beforeRetry=calls;
 const limited=await invoke({action:'chat',postId:'public',message:'x'},'quota'); assert.equal(limited.status,429); assert.equal(calls-beforeRetry,3); assert.ok(!(await limited.text()).includes('test-key'));
 providerStatus=200;
 for(let i=0;i<8;i++) assert.equal((await invoke({action:'chat',postId:'public',message:'x'},'ratelimit')).status,200);
 assert.equal((await invoke({action:'chat',postId:'public',message:'x'},'ratelimit')).status,429);
 const long='头'+ 'a'.repeat(100000)+'尾'; const context=utils.articleContext(long); assert.ok(context.startsWith('头')); assert.ok(context.endsWith('尾')); assert.ok(context.includes('长文节选'));

 // Deliberately split Chinese UTF-8 and SSE delimiters at every byte.
 const byteStream = text => {
  const bytes = new TextEncoder().encode(text); let index = 0;
  return new ReadableStream({pull(controller) {if(index === bytes.length) controller.close(); else controller.enqueue(bytes.slice(index, ++index));}});
 };
 const decoded=[];
 for await(const data of sse.sseData(byteStream(': heartbeat\r\ndata: 你\r\ndata: 好\r\n\r\ndata: [DONE]'))) decoded.push(data);
 assert.deepEqual(decoded,['你\n好','[DONE]']);
 let releaseProvider, providerController;
 globalThis.fetch=async (_, options) => {
  assert.equal(JSON.parse(options.body).stream,true);
  assert.equal(JSON.parse(options.body).model,'glm-4.7-flash');
  return await new Promise(resolve => {releaseProvider=resolve;});
 };
 const live = await invoke({action:'chat',postId:'public',message:'x',stream:true},'stream');
 assert.ok(live.headers.get('content-type').includes('text/event-stream'));
 const frames=sse.sseData(live.body);
 assert.equal(JSON.parse((await frames.next()).value).type,'start');
 releaseProvider(new Response(new ReadableStream({start(controller) {providerController=controller;}}),{headers:{'content-type':'text/event-stream'}}));
 const delta = text => 'data: '+JSON.stringify({choices:[{delta:{content:text}}]})+'\r\n\r\n';
 for(const byte of new TextEncoder().encode(delta('你'))) providerController.enqueue(Uint8Array.of(byte));
 // This must arrive before the provider finishes, ruling out whole-response buffering.
 assert.deepEqual(JSON.parse((await frames.next()).value),{type:'delta',text:'你'});
 providerController.enqueue(new TextEncoder().encode('data: '+JSON.stringify({choices:[{delta:{reasoning_content:'秘密思考'}}]})+'\n\n'+delta('好')+'data: '+JSON.stringify({choices:[{delta:{},finish_reason:'stop'}]})+'\n\ndata: [DONE]\n\n'));
 providerController.close();
 const rest=[]; for await(const frame of frames) rest.push(JSON.parse(frame));
 assert.equal(rest[0].text,'好'); assert.equal(rest[1].type,'done'); assert.equal(rest[1].text,'你好');
 assert.ok(!JSON.stringify(rest).includes('秘密思考'));
 const streamResult = async (raw, ip) => {
  globalThis.fetch=async()=>new Response(byteStream(raw),{headers:{'content-type':'text/event-stream'}});
  const response=await invoke({action:'chat',postId:'public',message:'x',stream:true},ip);
  const items=[]; for await(const frame of sse.sseData(response.body)) items.push(JSON.parse(frame)); return items;
 };
 globalThis.fetch=async()=>new Response(byteStream(delta('奶龙带你找文章')+'data: [DONE]\n\n'),{headers:{'content-type':'text/event-stream'}});
 const petLive=await invoke({...petRequest,persona:'nailong',stream:true},'petstream');
 const petFrames=[]; for await(const frame of sse.sseData(petLive.body)) petFrames.push(JSON.parse(frame));
 assert.equal(petFrames[1].type,'delta'); assert.equal(petFrames.at(-1).type,'done'); assert.ok(petFrames.at(-1).links.some(link=>link.url==='/posts/agent/start/'));
 console.log('PASS: pet personas, strict free model, safe page context, public metadata only, article recommendations, streaming site links.');
 const broken=await streamResult(delta('已收到的内容'),'broken');
 assert.equal(broken[1].text,'已收到的内容'); assert.equal(broken.at(-1).type,'error'); assert.ok(!broken.some(frame=>frame.type==='done'));
 const capped=await streamResult(delta('部分答案')+'data: '+JSON.stringify({choices:[{finish_reason:'length'}]})+'\n\ndata: [DONE]\n\n','capped');
 assert.equal(capped.at(-1).type,'error');
 const privateError=await streamResult('data: '+JSON.stringify({error:{message:'test-key secret-project'}})+'\n\n','providererror');
 assert.equal(privateError.at(-1).type,'error'); assert.ok(!JSON.stringify(privateError).includes('test-key'));
 globalThis.fetch=async()=>new Response('{}',{status:401});
 const denied=await invoke({action:'chat',postId:'public',message:'x',stream:true},'denied');
 const deniedItems=[]; for await(const frame of sse.sseData(denied.body)) deniedItems.push(JSON.parse(frame));
 assert.equal(deniedItems.at(-1).type,'error');
 let cancelled=false;
 globalThis.fetch=async(_,options)=>new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>{cancelled=true;reject(new DOMException('Aborted','AbortError'));},{once:true}));
 const cancelledResponse=await invoke({action:'chat',postId:'public',message:'x',stream:true},'cancelled');
 const cancelReader=cancelledResponse.body.getReader(); await cancelReader.read(); await cancelReader.cancel();
 assert.equal(cancelled,true);
 console.log('PASS: streaming before completion, byte-split UTF-8/CRLF, ignored reasoning, clean completion, interrupted and length-limited streams, sanitized provider errors, cancellation.');
 fixtures.set('body-timeout',{data:{title:'超时测试',encrypted:false,draft:false},body:'新的测试正文'});
 const originalTimeout=AbortSignal.timeout;
 AbortSignal.timeout=milliseconds=>{assert.equal(milliseconds,90000,'Summary and stream must allow the same provider waiting time');return new AbortController().signal;};
 globalThis.fetch=async()=>({ok:true,json:async()=>{throw new DOMException('Body timeout','AbortError');}});
 const bodyTimeout=await invoke({action:'summary',postId:'body-timeout'},'bodytimeout');
 assert.equal(bodyTimeout.status,504);assert.ok((await bodyTimeout.json()).error.includes('超时'));
 AbortSignal.timeout=originalTimeout;
 console.log('PASS: consistent 90-second summary timeout and explicit 504 when the response body times out.');
 console.log('PASS: validation, private/draft exclusion, origin checks, generation format, hidden thoughts, concurrent deduplication, summary cache, revision invalidation, conversation history, quota errors, rate limiting, long-article context. Provider requests are mocked.');
})().catch(error=>{console.error(error);process.exitCode=1;});
