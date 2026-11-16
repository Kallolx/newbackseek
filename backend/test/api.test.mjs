import {test} from 'node:test';
import assert from 'node:assert/strict';
test('API permissions and ad lifecycle',{skip:process.env.INTEGRATION_TEST!=='1'},async()=>{
 const {sql}=await import('../src/db.mjs');
 const {buildApp}=await import('../src/app.mjs');
 const app=await buildApp();
 const headers={origin:process.env.SITE_ORIGIN};
 const call=(method,url,payload,cookie)=>app.inject({method,url,payload,headers:{...headers,...(cookie?{cookie}:{})}});
 try {
  assert.equal((await call('GET','/api/ready')).statusCode,200);
  assert.equal((await call('GET','/api/admin/users')).statusCode,401);
  assert.equal((await app.inject({method:'POST',url:'/api/auth/register',payload:{}})).statusCode,403);
  const register=await call('POST','/api/auth/register',{email:'test@example.com',username:'testuser',password:'long-example-password'});
  assert.equal(register.statusCode,201,register.body);
  const user=register.json().user;
  const cookie=register.headers['set-cookie'].split(';')[0];
  assert.equal((await call('GET','/api/admin/users',undefined,cookie)).statusCode,403);
  const [city]=await sql`insert into cities(country_code,country,region,name,href) values ('us','United States','Test','Test City','/test') returning id`;
  await sql`insert into categories(slug,name,group_name) values ('test','Test','Test')`;
  const create=await call('POST','/api/account/ads',{title:'Test listing',description:'This is a complete test listing description.',categorySlug:'test',cityIds:[Number(city.id)]},cookie);
  assert.equal(create.statusCode,201,create.body);
  const ad=create.json().post;
  assert.equal((await call('GET','/api/ads/'+ad.id)).statusCode,404);
  await sql`update users set role='admin' where id=${user.id}`;
  assert.equal((await call('POST','/api/admin/ads/'+ad.id+'/status',{status:'published'},cookie)).statusCode,200);
  const feed=await call('GET','/api/ads?cityId='+city.id+'&category=test');
  assert.equal(feed.statusCode,200,feed.body);assert.equal(feed.json().posts.length,1);
  assert.equal((await call('POST','/api/admin/ads/'+ad.id+'/bump',{},cookie)).statusCode,200);
  assert.equal((await call('POST','/api/admin/ads/'+ad.id+'/distribute',{cityIds:[Number(city.id)]},cookie)).statusCode,200);
  assert.equal((await call('GET','/api/ads/'+ad.id)).statusCode,200);
  assert.equal((await call('POST','/api/auth/logout',{},cookie)).statusCode,200);
  assert.equal((await call('GET','/api/auth/me',undefined,cookie)).statusCode,401);
 }finally{await app.close();}
});
