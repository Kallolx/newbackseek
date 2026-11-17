import assert from 'node:assert/strict';
import {sql} from '../src/db.mjs';
import {hashPassword} from '../src/security.mjs';
try {
 const [database]=await sql`select current_database() as name`;assert.equal(database.name,'bpn_test');
 const hash=await hashPassword('browser-test-password-2026');
 for(const role of ['admin','member'])await sql`insert into users(email,username,password_hash,role,email_verified_at) values(${role+'@browser.example.com'},${'browser'+role},${hash},${role},now()) on conflict(email) do nothing`;
 console.log('Isolated browser accounts ready');
}finally{await sql.end();}
