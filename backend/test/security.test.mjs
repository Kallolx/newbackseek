import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, digest, token } from '../src/security.mjs';
test('passwords are salted and reject incorrect input',async()=>{
 const a=await hashPassword('example-strong-password');
 const b=await hashPassword('example-strong-password');
 assert.notEqual(a,b);
 assert.equal(await verifyPassword('example-strong-password',a),true);
 assert.equal(await verifyPassword('incorrect-password',a),false);
});
test('session tokens have sufficient entropy and are stored as hashes',()=>{
 const a=token();assert.notEqual(a,token());assert.equal(a.length,43);assert.equal(digest(a).length,64);
});
