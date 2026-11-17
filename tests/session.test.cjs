const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const ts=require('typescript');
function setup(fetch){const module={exports:{}};const window=new EventTarget();const source=ts.transpileModule(fs.readFileSync(require('node:path').join(__dirname,'../src/member/session.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;vm.runInNewContext(source,{module,exports:module.exports,require:()=>({useEffect:()=>{},useSyncExternalStore:(_,get)=>get()}),fetch,window,Event,Set,Promise});return module.exports;}
const response=(status,body)=>({status,ok:status<400,json:async()=>body});
test('logout clears all shared views and a stale identity response cannot restore the menu',async()=>{
 let resolveIdentity;let defer=false;const api=setup(async(url)=>{if(url==='/api/auth/logout')return response(200,{});if(url==='/api/account/ads')return response(200,{posts:[]});if(defer)return new Promise(resolve=>{resolveIdentity=resolve;});return response(200,{user:{id:'member-1',email:'user@example.com',username:'member'}});});
 await api.refreshMember();assert.equal(api.useMember().member.username,'member');defer=true;const stale=api.refreshMember(true);await api.logOut();assert.equal(api.useMember().member,null);resolveIdentity(response(200,{user:{id:'member-1',email:'user@example.com',username:'member'}}));await stale;assert.equal(api.useMember().member,null);
});
test('logout failure retains the real signed-in state and reports failure',async()=>{
 const api=setup(async url=>url==='/api/auth/logout'?response(503,{}):url==='/api/account/ads'?response(200,{posts:[]}):response(200,{user:{id:'member-2',email:'user@example.com',username:'member2'}}));await api.refreshMember();await assert.rejects(api.logOut(),/Unable to log out/);assert.equal(api.useMember().member.username,'member2');
});
