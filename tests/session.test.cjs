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
test('member ads retain all full photos and lightweight card and thumbnail variants',async()=>{
 const photos=[1,2,3].map(n=>({card:{url:`https://media.example.com/${n}/card.webp`},full:{url:`https://media.example.com/${n}/full.webp`},thumb:{url:`https://media.example.com/${n}/thumb.webp`}}));
 const api=setup(async url=>url==='/api/account/ads'?response(200,{posts:[{id:1,title:'Photo check',image:photos[0],images:photos}]}):response(200,{user:{id:'member-photo',email:'user@example.com',username:'photos'}}));await api.refreshMember();const post=api.useMember().member.posts[0];assert.equal(post.images.length,3);assert.equal(post.images[2],photos[2].full.url);assert.equal(post.coverImage,photos[0].card.url);assert.deepEqual(Array.from(post.thumbnails),photos.map(photo=>photo.thumb.url));
});
