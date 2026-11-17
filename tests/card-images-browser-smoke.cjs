const assert = require('node:assert/strict');
const {chromium} = require(process.env.BPN_PLAYWRIGHT_MODULE || 'playwright');
const sharp=require('sharp');

// Browser-only responses exercise rendering without creating accounts or sessions.
(async()=>{
 const base=process.env.BPN_TEST_BASE || 'http://localhost:3107';
 const image='https://media.backpagenew.com/public/29784b72-116a-419c-8dee-18565078b3a6/card.webp';
 const post={id:'1001',title:'Image rendering check',description:'A test card with a real prepared CDN photo.',age:25,location:'Auburn',city_name:'Auburn',city_href:'/browse/us/alabama/auburn',category_slug:'automotive-services',status:'published',created_at:new Date().toISOString(),image:{card:{url:image}}};
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 const photos=await Promise.all([[120,300],[300,120],[200,200]].map(async([width,height],i)=>({url:`https://images.example.test/${i}.png`,buffer:await sharp({create:{width,height,channels:3,background:['#315b90','#6a8d56','#ae7548'][i]}}).png().toBuffer()})));
 const variants=photos.map(photo=>({full:{url:photo.url},thumb:{url:photo.url},card:{url:image}}));
 post.images=variants;post.phone='+1 202 555 0142';post.contact_email='public-contact@example.com';
 try {
  for(const width of [390,1366]){
   const context=await browser.newContext({viewport:{width,height:900}});
   await context.route('https://images.example.test/**',route=>route.fulfill({contentType:'image/png',body:photos.find(photo=>photo.url===route.request().url()).buffer}));
   await context.route('**/api/auth/me',route=>route.fulfill({json:{user:{id:'render-only',username:'rendercheck',email:'render@example.com',email_verified_at:new Date().toISOString()}}}));
   await context.route('**/api/account/ads',route=>route.fulfill({json:{posts:[post]}}));
   await context.route('**/api/ads?*',route=>route.fulfill({json:{posts:[post],hasMore:false}}));
   await context.route('**/api/ads/1001',route=>route.fulfill({json:{post,images:variants.map((variants,i)=>({id:String(i),variants})),cities:[{href:post.city_href}]}}));
   const page=await context.newPage();
   for(const path of ['/myaccount','/browse/us/alabama/auburn/automotive-services']){
    await page.goto(base+path,{waitUntil:'domcontentloaded'});
    const photo=page.locator('.post-thumbnail img').first();await photo.waitFor();
    await photo.evaluate(img=>img.decode());
    assert.equal(await photo.evaluate(img=>img.naturalWidth>0),true);
    assert.equal(await photo.getAttribute('src'),image,'Prepared images should load directly from the CDN');
    assert.equal(Math.round((await photo.boundingBox()).height),120,'List photos have a bounded height');
    await page.getByRole('button',{name:'Gallery',exact:true}).click();
    assert.equal(Math.round((await photo.boundingBox()).height),180,'Gallery photos have a bounded height');
    console.log(`${width}px ${path}: image decoded, direct CDN URL, list 120px / gallery 180px passed`);
   }
   for(const path of ['/myaccount/posts/1001','/browse/us/alabama/auburn/automotive-services/1001']){
    await page.goto(base+path,{waitUntil:'domcontentloaded'});
    const gallery=page.getByRole('region',{name:'Ad pictures'});await gallery.waitFor();
    assert.equal(await gallery.getByRole('button',{name:/Show picture/}).count(),3);
    let size;
    for(let n=0;n<3;n++){
     await gallery.getByRole('button',{name:`Show picture ${n+1}`,exact:true}).click();
     const main=gallery.getByAltText(`Image rendering check — picture ${n+1}`);await main.evaluate(img=>img.decode());
     assert.equal(await main.evaluate(img=>getComputedStyle(img).objectFit),'contain');
     const bounds=await main.boundingBox();assert.equal(Math.round(bounds.height),width===390?280:480);if(size)assert.equal(bounds.height,size.height);size=bounds;
    }
    if(path.includes('/browse/')){assert.equal(await page.locator('.post-facts a[href^="tel:"]').count(),1);assert.equal(await page.locator('.post-facts a[href="mailto:public-contact@example.com"]').count(),1);}
    await page.screenshot({path:`artifacts/gallery-${width}-${path.startsWith('/myaccount')?'member':'public'}.png`});
    console.log(`${width}px ${path}: three selectable thumbnails, portrait/landscape fit stable frame passed`);
   }
   await context.close();
  }
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
