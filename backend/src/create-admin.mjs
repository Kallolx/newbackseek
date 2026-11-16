import { sql } from './db.mjs';
import { hashPassword } from './security.mjs';
const {ADMIN_EMAIL,ADMIN_USERNAME,ADMIN_PASSWORD}=process.env;
try {
 if(!ADMIN_EMAIL || !ADMIN_USERNAME || !ADMIN_PASSWORD || ADMIN_PASSWORD.length<16) throw new Error('Set ADMIN_EMAIL, ADMIN_USERNAME and ADMIN_PASSWORD (at least 16 characters)');
 await sql`insert into users (email,username,password_hash,role,email_verified_at) values (${ADMIN_EMAIL.toLowerCase()},${ADMIN_USERNAME},${await hashPassword(ADMIN_PASSWORD)},'admin',now())`;
 console.log('Administrator created');
} finally {await sql.end();}
