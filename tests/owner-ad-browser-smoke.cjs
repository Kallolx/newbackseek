const assert=require('node:assert/strict');
const {chromium}=require(process.env.BPN_PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 try{for(const width of [390,1366]){
  const context=await browser.newContext({viewport:{width,height:900}});const mutations=[];let deleted=false;
  const image='https://media.backpagenew.com/public/29784b72-116a-419c-8dee-18565078b3a6/card.webp';
  const ids=[1,2,3].map(n=>`00000000-0000-4000-8000-00000000000${n}`);let photos=ids.map((id,index)=>({id,variants:{full:{url:image+'?photo='+index},card:{url:image},thumb:{url:image+'?photo='+index}}}));
  const post={id:'1001',title:'Owner management browser check',description:'A detailed example description for checking the owner edit form.',age:25,location:'Auburn',phone:'+1 202 555 0142',contact_email:'contact@example.com',city_name:'Auburn',city_href:'/browse/us/alabama/auburn',category_slug:'automotive-services',status:'published',created_at:new Date().toISOString()};
  await context.route('**/api/auth/me',route=>route.fulfill({json:{user:{id:'render-only',username:'ownercheck',email:'private@example.com',email_verified_at:new Date().toISOString()}}}));
  await context.route('**/api/locations?*',route=>route.fulfill({json:{cities:[{id:1,href:post.city_href}]}}));
  await context.route('**/api/ads?*',route=>route.fulfill({json:{posts:[],hasMore:false}}));
  await context.route('**/api/account/ads**',route=>{
   const request=route.request();const path=new URL(request.url()).pathname;const method=request.method();
   if(method==='PATCH'){const body=request.postDataJSON();mutations.push({method,body});Object.assign(post,{title:body.title,phone:body.phone,contact_email:body.contactEmail,status:'pending'});photos=photos.filter(photo=>body.keepMediaIds.includes(photo.id));return route.fulfill({json:{post}});}
   if(method==='DELETE'){mutations.push({method});deleted=true;return route.fulfill({json:{ok:true}});}
   if(method==='POST'){const body=request.postDataJSON();mutations.push({method,body});post.status=body.status;return route.fulfill({json:{ok:true}});}
   return route.fulfill({json:path.endsWith('/1001')?{post,images:photos,cities:[{href:post.city_href}]}:{posts:deleted?[]:[{...post,image:photos[0]?.variants,images:photos.map(photo=>photo.variants),media_ids:photos.map(photo=>photo.id)}]}});
  });
  const page=await context.newPage();await page.goto('http://localhost:3107/myaccount/posts/1001',{waitUntil:'domcontentloaded'});
  const menu=()=>page.getByRole('button',{name:'Manage this ad',exact:true});const item=async name=>{await menu().click();await page.getByRole('menuitem',{name,exact:true}).click();};
  await menu().waitFor();assert.equal(await page.locator('.browse-crumbs').count(),0,'owner view has no city/category breadcrumb');assert.equal(await page.getByRole('menuitem').count(),0,'owner actions stay inside the closed menu');
  await page.getByRole('button',{name:'Open picture 1 full screen'}).click();const viewer=page.getByRole('dialog',{name:/pictures$/});await viewer.waitFor();await page.keyboard.press('ArrowRight');await viewer.getByText('2 / 3').waitFor();await page.keyboard.press('Escape');await viewer.waitFor({state:'hidden'});
  await item('Edit ad');
  await page.getByRole('heading',{name:'Edit ad',exact:true}).waitFor();
  assert.equal(await page.locator('input[name="headline"]').inputValue(),post.title);
  assert.equal(await page.locator('input[type=email]').count(),1,'only the editable public contact email is shown');
  assert.equal(await page.locator('input[name=contactEmail]').inputValue(),'contact@example.com');
  assert.equal(await page.getByAltText(/Saved ad picture/).count(),3);
  await page.getByRole('button',{name:'Remove saved picture 3',exact:true}).click();assert.equal(mutations.length,0,'removal is deferred until Save');
  await page.locator('input[name=headline]').fill('Updated by the owner');
  await page.locator('input[name=contactEmail]').fill('changed@example.com');
  await page.locator('input[type=checkbox]').check();
  await page.getByRole('button',{name:'Save changes for review'}).click();
  await menu().waitFor();assert.equal(mutations[0].method,'PATCH');assert.equal(mutations[0].body.keepMediaIds.length,2);assert.equal(mutations[0].body.contactEmail,'changed@example.com');assert.equal(mutations[0].body.cityIds,undefined,'edits preserve all existing city placements');
  post.status='published';await page.reload({waitUntil:'domcontentloaded'});await item('Pause');
  await page.getByText('Paused',{exact:true}).waitFor();await item('Submit for review');await page.getByText('Pending',{exact:true}).waitFor();
  assert.ok(mutations.some(action=>action.body?.status==='paused'));assert.ok(mutations.some(action=>action.body?.status==='pending'));
  await item('Delete');await page.getByRole('button',{name:'Keep ad',exact:true}).click();assert.equal(deleted,false);
  await item('Delete');await page.getByRole('button',{name:'Delete ad',exact:true}).click();await page.getByRole('heading',{name:'My ads',exact:true}).waitFor();assert.equal(deleted,true);
  await page.goto('http://localhost:3107/admin/distribute',{waitUntil:'domcontentloaded'});
  // The navigation is present independently of the mocked admin list resources.
  if(width===390){const bar=page.getByRole('navigation',{name:'Mobile admin navigation'});await bar.waitFor();assert.equal(await bar.evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(17, 31, 54)');await page.getByRole('button',{name:'More admin pages',exact:true}).click();const sheet=page.getByRole('dialog');await sheet.waitFor();await page.waitForTimeout(300);const bounds=await sheet.boundingBox();assert.ok(bounds.height<350&&bounds.y>400,JSON.stringify(bounds));await page.screenshot({path:'artifacts/admin-dark-bar-compact-sheet.png'});}
  console.log(`${width}px: shared details, 3-dot menu, full-screen viewer, edit/save, deferred photo removal, pause/review, delete confirmation and compact navigation passed`);await context.close();
 }}finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
