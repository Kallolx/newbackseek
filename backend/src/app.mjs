import Fastify from "fastify";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { z } from "zod";
import {
  PutObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { OAuth2Client } from "google-auth-library";
import { config } from "./config.mjs";
import { sql, audit } from "./db.mjs";
import { token, digest, hashPassword, verifyPassword } from "./security.mjs";
import { redis, images } from "./queue.mjs";
import { s3, storageReady } from "./storage.mjs";
import { emailReady, sendVerificationEmail, sendPasswordResetEmail } from "./email.mjs";
import { adminManagement } from "./admin-routes.mjs";

const id = z.string().regex(/^\d+$/);
const uuid = z.uuid();
const pagination = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
});
const adInput = z.object({
  title: z.string().trim().min(5).max(140),
  description: z.string().trim().min(20).max(6000),
  categorySlug: z.string().min(1).max(100),
  age: z.number().int().min(18).max(120).optional(),
  location: z.string().max(200).default(""),
  phone: z.string().max(40).default(""),
  contactEmail: z.union([z.email().max(254),z.literal('')]).default(''),
  cityIds: z.array(z.number().int().positive()).min(1).max(1000),
  mediaIds: z.array(uuid).max(12).default([]),
});
const fail = (statusCode, message) =>
  Object.assign(new Error(message), { statusCode });
const cookieOptions = {
  path: "/",
  httpOnly: true,
  secure: config.NODE_ENV === "production",
  sameSite: "lax",
  maxAge: 604800,
};
const googleStateCookie =
  config.NODE_ENV === "production" ? "__Host-bpn-google-state" : "bpn-google-state";
const adminGoogleStateCookie =
  config.NODE_ENV === "production" ? "__Host-bpn-admin-google-state" : "bpn-admin-google-state";
const adminGoogleRedirectUri = new URL("/api/admin/auth/google/callback", config.ADMIN_ORIGIN).toString();
const googleClient = config.GOOGLE_CLIENT_ID
  ? new OAuth2Client(config.GOOGLE_CLIENT_ID)
  : null;
const appContext = (req) =>
  req.headers["x-backpagenew-app"] === "admin" ? "admin" : "public";
const sessionCookie = (req) =>
  config.NODE_ENV === "production"
    ? appContext(req) === "admin"
      ? "__Host-bpn-admin-session"
      : "__Host-bpn-session"
    : appContext(req) === "admin"
      ? "bpn-admin-session"
      : "bpn-session";

export async function buildApp() {
  const telemetry = { requests: 0, errors: 0, latency: [], startedAt: new Date().toISOString() };
  const app = Fastify({
    logger: {
      redact: [
        "req.headers.cookie",
        "req.headers.authorization",
        "password",
        "password_hash",
      ],
    },
    bodyLimit: 65536,
  });
  await app.register(cookie);
  await app.register(helmet);
  await app.register(rateLimit, { max: 120, timeWindow: "1 minute", redis });
  app.addHook("onRequest", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      ![config.SITE_ORIGIN, config.ADMIN_ORIGIN].includes(
        req.headers.origin || "",
      )
    )
      throw fail(403, "Request origin is not allowed");
  });
  app.addHook("onResponse", async (req, reply) => {
    telemetry.requests += 1;
    if (reply.statusCode >= 500) telemetry.errors += 1;
    telemetry.latency.push(reply.elapsedTime);
    if (telemetry.latency.length > 500) telemetry.latency.shift();
  });
  app.decorateRequest("user", null);
  async function member(req) {
    const session = req.cookies[sessionCookie(req)];
    if (!session) throw fail(401, "Please log in");
    const [user] =
      await sql`select u.id,u.email,u.username,u.role,u.email_verified_at,s.actor_id,
      (select v.status from verifications v where v.user_id=u.id order by v.created_at desc limit 1) as verification_status from sessions s join users u on u.id=s.user_id
     where s.token_hash=${digest(session)} and s.expires_at>now() and u.status='active' and u.email_verified_at is not null`;
    if (!user) { await sql`delete from sessions where token_hash=${digest(session)}`; throw fail(401, "Please log in"); }
    req.user = user;
  }
  async function verifiedMember(req) {
    if (!req.user?.email_verified_at)
      throw fail(403, "Verify your email address before posting or uploading images");
  }
  async function admin(req) {
    if (appContext(req) !== "admin") throw fail(404, "Not found");
    await member(req);
    if (req.user.role !== "admin" || req.user.actor_id)
      throw fail(403, "Administrator access required");
  }
  async function session(reply, userId, actorId = null, context = "public") {
    const [eligible] = await sql`select id from users where id=${userId} and status='active' and email_verified_at is not null`;
    if (!eligible) throw fail(403, 'Verify your email address before logging in.');
    const secret = token();
    await sql`insert into sessions (token_hash,user_id,actor_id,expires_at) values (${digest(secret)},${userId},${actorId},now()+interval '7 days')`;
    const name =
      config.NODE_ENV === "production"
        ? context === "admin"
          ? "__Host-bpn-admin-session"
          : "__Host-bpn-session"
        : context === "admin"
          ? "bpn-admin-session"
          : "bpn-session";
    reply.setCookie(name, secret, cookieOptions);
  }
  async function verifyCaptcha(captchaToken, req) {
    if (!config.CAPTCHA_PROVIDER && config.NODE_ENV !== "production") return;
    if (!config.TURNSTILE_SECRET_KEY)
      throw fail(503, "Spam protection is not configured");
    const body = new URLSearchParams({
      secret: config.TURNSTILE_SECRET_KEY,
      response: captchaToken,
      remoteip: req.ip,
    });
    let result;
    try {
      const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body,
      });
      result = await response.json();
    } catch {
      throw fail(503, "Spam protection is temporarily unavailable");
    }
    if (!result?.success) throw fail(400, "Please complete the security check");
  }
  async function issueVerification(user) {
    if (!emailReady()) throw fail(503, "Email delivery is not configured");
    const verificationToken = token();
    await sql.begin(async (tx) => {
      await tx`delete from email_verifications where user_id=${user.id}`;
      await tx`insert into email_verifications (token_hash,user_id,expires_at) values (${digest(verificationToken)},${user.id},now()+interval '24 hours')`;
    });
    await sendVerificationEmail({ ...user, verificationToken });
  }
  async function uniqueGoogleUsername(email) {
    const base = email.split("@")[0].replace(/[^a-zA-Z0-9]/g, "").slice(0, 24) || "member";
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const suffix = token().replace(/[^a-zA-Z0-9]/g, "").slice(0, 6);
      const username = (base.slice(0, 24) + suffix).slice(0, 30);
      if (!(await sql`select id from users where username=${username}`).length) return username;
    }
    throw fail(503, "Please try Google sign-in again");
  }
  app.setErrorHandler((error, req, reply) => {
    if (error instanceof z.ZodError)
      return reply
        .code(400)
        .send({ error: "Invalid input", fields: error.flatten() });
    if (error.code === "23505") {
      if (['users_email_key','users_live_email_key'].includes(error.constraint_name))
        return reply.code(409).send({error:'This email already has an account. Log in or resend your verification email.',code:'EMAIL_IN_USE'});
      if (['users_username_key','users_live_username_key'].includes(error.constraint_name))
        return reply.code(409).send({error:'This username is taken. Please choose another.',code:'USERNAME_IN_USE'});
      return reply.code(409).send({ error: "This item already exists. Refresh and try again." });
    }
    if (error.code === "23503")
      return reply
        .code(400)
        .send({ error: "Referenced record does not exist" });
    const status = error.statusCode || 500;
    if (status >= 500) req.log.error(error);
    reply
      .code(status)
      .send({
        error:
          status >= 500 ? "Service temporarily unavailable" : error.message,
        ...(error.publicCode ? {code:error.publicCode} : {}),
      });
  });
  app.get("/api/health", async () => ({ status: "ok" }));
  app.get("/api/ready", async () => {
    await sql`select 1`;
    await redis.ping();
    return { status: "ready" };
  });
  app.post(
    "/api/auth/register",
    { config: { rateLimit: { max: 5, timeWindow: "1 hour" } } },
    async (req, reply) => {
      const input = z
        .object({
          email: z.email().toLowerCase(),
          username: z.string().regex(/^[a-zA-Z0-9]{3,30}$/),
          password: z.string().min(12).max(128),
          captchaToken: z.string().min(1).max(4096),
        })
        .parse(req.body);
      await verifyCaptcha(input.captchaToken, req);
      const [user] =
        await sql`insert into users (email,username,password_hash) values (${input.email},${input.username},${await hashPassword(input.password)}) returning id,email,username,role`;
      let verificationEmailSent = true;
      try { await issueVerification(user); }
      catch (error) { verificationEmailSent = false; req.log.error({ err: error }, "Verification delivery failed after account creation"); }
      const previousSession = req.cookies[sessionCookie(req)];
      if (previousSession) await sql`delete from sessions where token_hash=${digest(previousSession)}`;
      reply.clearCookie(sessionCookie(req), {path:'/',secure:cookieOptions.secure});
      return reply.code(201).send({ user, verificationRequired: true, verificationEmailSent });
    },
  );
  app.post(
    "/api/auth/login",
    { config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } },
    async (req, reply) => {
      const input = z
        .object({
          email: z.email().toLowerCase(),
          password: z.string().min(1).max(128),
          captchaToken: z.string().min(1).max(4096),
        })
        .parse(req.body);
      await verifyCaptcha(input.captchaToken, req);
      const [user] =
        await sql`select * from users where email=${input.email} and status='active'`;
      const valid = await verifyPassword(
        input.password,
        user?.password_hash || (await hashPassword("dummy-password")),
      );
      if (!user || !valid || user.role !== "member")
        throw fail(401, "Incorrect email or password");
      if (!user.email_verified_at) throw Object.assign(fail(403, 'Verify your email address before logging in. You can resend the verification email below.'), { publicCode: 'EMAIL_NOT_VERIFIED' });
      await session(reply, user.id);
      return {
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          role: user.role,
        },
      };
    },
  );
  app.post('/api/auth/resend-verification-public',{config:{rateLimit:{max:3,timeWindow:'1 hour'}}},async(req)=>{
    const input=z.object({email:z.email().toLowerCase(),password:z.string().min(1).max(128),captchaToken:z.string().min(1).max(4096)}).parse(req.body);
    await verifyCaptcha(input.captchaToken,req);
    const [user]=await sql`select * from users where email=${input.email} and role='member' and status='active'`;
    const valid=await verifyPassword(input.password,user?.password_hash||await hashPassword('dummy-password'));
    if(!user||!valid)throw fail(401,'Incorrect email or password');
    if(!user.email_verified_at)await issueVerification(user);
    return {ok:true,alreadyVerified:Boolean(user.email_verified_at)};
  });
  app.get("/api/auth/google/start", async (req, reply) => {
    if (appContext(req) !== "public" || !googleClient || !config.GOOGLE_CLIENT_SECRET || !config.GOOGLE_REDIRECT_URI)
      throw fail(503, "Google sign-in is not configured");
    const state = token();
    reply.setCookie(googleStateCookie, state, {
      path: "/",
      httpOnly: true,
      secure: config.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600,
    });
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({
      client_id: config.GOOGLE_CLIENT_ID,
      redirect_uri: config.GOOGLE_REDIRECT_URI,
      response_type: "code",
      scope: "openid email profile",
      state,
      prompt: "select_account",
    }).toString();
    return reply.redirect(url.toString());
  });
  app.get("/api/auth/google/callback", async (req, reply) => {
    const query = z.object({ code: z.string().min(1), state: z.string().min(1) }).parse(req.query);
    const expectedState = req.cookies[googleStateCookie];
    reply.clearCookie(googleStateCookie, { path: "/", secure: cookieOptions.secure });
    if (!expectedState || digest(expectedState) !== digest(query.state))
      return reply.code(303).redirect(`${config.SITE_ORIGIN}/auth?error=google_state`);
    if (!googleClient || !config.GOOGLE_CLIENT_SECRET || !config.GOOGLE_REDIRECT_URI)
      return reply.code(303).redirect(`${config.SITE_ORIGIN}/auth?error=google_unavailable`);
    try {
      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code: query.code,
          client_id: config.GOOGLE_CLIENT_ID,
          client_secret: config.GOOGLE_CLIENT_SECRET,
          redirect_uri: config.GOOGLE_REDIRECT_URI,
          grant_type: "authorization_code",
        }),
      });
      const tokenPayload = await tokenResponse.json();
      if (!tokenResponse.ok || !tokenPayload.id_token) throw new Error("Google token exchange failed");
      const ticket = await googleClient.verifyIdToken({ idToken: tokenPayload.id_token, audience: config.GOOGLE_CLIENT_ID });
      const profile = ticket.getPayload();
      if (!profile?.sub || !profile.email || !profile.email_verified) throw new Error("Google email is not verified");
      let [user] = await sql`select id,email,username,role from users where google_subject=${profile.sub} and status='active' and role='member'`;
      if (!user) {
        const [existing] = await sql`select id from users where email=${profile.email} and status!='deleted'`;
        if (existing) return reply.code(303).redirect(`${config.SITE_ORIGIN}/auth?error=google_account_exists`);
        const username = await uniqueGoogleUsername(profile.email);
        [user] = await sql`insert into users (email,username,password_hash,google_subject,email_verified_at) values (${profile.email},${username},${await hashPassword(token())},${profile.sub},now()) returning id,email,username,role`;
      }
      await sql`update users set email_verified_at=coalesce(email_verified_at,now()) where id=${user.id}`;
      await session(reply, user.id);
      return reply.code(303).redirect(`${config.SITE_ORIGIN}/myaccount`);
    } catch (error) {
      req.log.warn({ err: error }, "Google sign-in failed");
      return reply.code(303).redirect(`${config.SITE_ORIGIN}/auth?error=google_failed`);
    }
  });
  app.get("/api/auth/verify-email", async (req, reply) => {
    const { token: verificationToken } = z.object({ token: z.string().min(20).max(200) }).parse(req.query);
    const verified = await sql.begin(async (tx) => {
      const [row] = await tx`delete from email_verifications where token_hash=${digest(verificationToken)} and expires_at>now() returning user_id`;
      if (!row) return false;
      await tx`update users set email_verified_at=coalesce(email_verified_at,now()) where id=${row.user_id}`;
      return true;
    });
    return reply.code(303).redirect(`${config.SITE_ORIGIN}/auth?email=${verified ? "verified" : "invalid"}`);
  });
  app.post("/api/auth/resend-verification", { preHandler: member, config: { rateLimit: { max: 3, timeWindow: "1 hour" } } }, async (req) => {
    if (req.user.email_verified_at) return { ok: true, alreadyVerified: true };
    await issueVerification(req.user);
    return { ok: true };
  });
  app.post('/api/auth/request-password-reset',{config:{rateLimit:{max:5,timeWindow:'1 hour'}}},async(req)=>{
    const input=z.object({email:z.email().toLowerCase(),captchaToken:z.string().min(1).max(4096)}).parse(req.body);
    await verifyCaptcha(input.captchaToken,req);
    if(!emailReady())throw fail(503,'Email delivery is temporarily unavailable. Please try again later.');
    const [user]=await sql`select id,email from users where email=${input.email} and role='member' and status='active'`;
    if(user){const resetToken=token();await sql.begin(async tx=>{await tx`delete from password_resets where user_id=${user.id}`;await tx`insert into password_resets(token_hash,user_id,expires_at) values(${digest(resetToken)},${user.id},now()+interval '30 minutes')`;});await sendPasswordResetEmail({email:user.email,resetToken});}
    return {ok:true};
  });
  app.post('/api/auth/reset-password',{config:{rateLimit:{max:10,timeWindow:'15 minutes'}}},async(req)=>{
    const input=z.object({token:z.string().min(30).max(100),password:z.string().min(12).max(128),captchaToken:z.string().min(1).max(4096)}).parse(req.body);
    await verifyCaptcha(input.captchaToken,req);const hash=await hashPassword(input.password);
    await sql.begin(async tx=>{const [reset]=await tx`delete from password_resets where token_hash=${digest(input.token)} and expires_at>now() returning user_id`;if(!reset)throw fail(400,'This reset link has expired or was already used. Request a new link.');const changed=await tx`update users set password_hash=${hash},email_verified_at=coalesce(email_verified_at,now()) where id=${reset.user_id} and role='member' and status='active' returning id`;if(!changed.length)throw fail(400,'This account is unavailable');await tx`delete from sessions where user_id=${reset.user_id}`;await tx`delete from password_resets where user_id=${reset.user_id}`;});
    return {ok:true};
  });
  app.post(
    "/api/admin/auth/login",
    { config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } },
    async (req, reply) => {
      if (appContext(req) !== "admin") throw fail(404, "Not found");
      const input = z
        .object({
          email: z.email().toLowerCase(),
          password: z.string().min(1).max(128),
          captchaToken: z.string().min(1).max(4096),
        })
        .parse(req.body);
      await verifyCaptcha(input.captchaToken, req);
      const [user] =
        await sql`select * from users where email=${input.email} and status='active' and role='admin'`;
      const valid = await verifyPassword(
        input.password,
        user?.password_hash || (await hashPassword("dummy-password")),
      );
      if (!user || !valid)
        throw fail(401, "Incorrect administrator email or password");
      await session(reply, user.id, null, "admin");
      return {
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          role: user.role,
        },
      };
    },
  );
  app.get("/api/admin/auth/google/start", async (req, reply) => {
    if (appContext(req) !== "admin" || !googleClient || !config.GOOGLE_CLIENT_SECRET)
      throw fail(503, "Google sign-in is not configured");
    const state = token();
    reply.setCookie(adminGoogleStateCookie, state, { path: "/", httpOnly: true, secure: config.NODE_ENV === "production", sameSite: "lax", maxAge: 600 });
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({ client_id: config.GOOGLE_CLIENT_ID, redirect_uri: adminGoogleRedirectUri, response_type: "code", scope: "openid email profile", state, prompt: "select_account" }).toString();
    return reply.redirect(url.toString());
  });
  app.get("/api/admin/auth/google/callback", async (req, reply) => {
    if (appContext(req) !== "admin") throw fail(404, "Not found");
    const query = z.object({ code: z.string().min(1), state: z.string().min(1) }).parse(req.query);
    const expectedState = req.cookies[adminGoogleStateCookie];
    reply.clearCookie(adminGoogleStateCookie, { path: "/", secure: cookieOptions.secure });
    if (!expectedState || digest(expectedState) !== digest(query.state)) return reply.code(303).redirect(`${config.ADMIN_ORIGIN}/login?error=google_state`);
    try {
      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code: query.code, client_id: config.GOOGLE_CLIENT_ID, client_secret: config.GOOGLE_CLIENT_SECRET, redirect_uri: adminGoogleRedirectUri, grant_type: "authorization_code" }) });
      const tokenPayload = await tokenResponse.json();
      if (!tokenResponse.ok || !tokenPayload.id_token) throw new Error("Google token exchange failed");
      const ticket = await googleClient.verifyIdToken({ idToken: tokenPayload.id_token, audience: config.GOOGLE_CLIENT_ID });
      const profile = ticket.getPayload();
      if (!profile?.sub || !profile.email || !profile.email_verified) throw new Error("Google email is not verified");
      const [user] = await sql`select id,email,username,role,google_subject from users where email=${profile.email} and status='active' and role='admin'`;
      if (!user || (user.google_subject && user.google_subject !== profile.sub)) return reply.code(303).redirect(`${config.ADMIN_ORIGIN}/login?error=not_authorized`);
      if (!user.google_subject) await sql`update users set google_subject=${profile.sub},email_verified_at=coalesce(email_verified_at,now()) where id=${user.id}`;
      await session(reply, user.id, null, "admin");
      return reply.code(303).redirect(`${config.ADMIN_ORIGIN}/admin`);
    } catch (error) {
      req.log.warn({ err: error }, "Administrator Google sign-in failed");
      return reply.code(303).redirect(`${config.ADMIN_ORIGIN}/login?error=google_failed`);
    }
  });
  app.get("/api/auth/me", { preHandler: member }, async (req) => ({
    user: req.user,
  }));
  app.post("/api/auth/logout", async (req, reply) => {
    const name = sessionCookie(req);
    if (req.cookies[name])
      await sql`delete from sessions where token_hash=${digest(req.cookies[name])}`;
    reply.clearCookie(name, { path: "/", secure: cookieOptions.secure });
    return { ok: true };
  });
  app.get("/api/locations", async (req) => {
    const q = z
      .object({
        country: z.string().max(10).default(""),
        region: z.string().max(100).default(""),
      })
      .parse(req.query);
    return {
      cities:
        await sql`select * from cities where (${q.country}='' or country_code=${q.country}) and (${q.region}='' or region=${q.region}) order by country,region,name`,
    };
  });
  app.get("/api/categories", async () => ({
    categories: await sql`select * from categories order by group_name,name`,
  }));
  app.get("/api/ads", async (req) => {
    const q = pagination
      .extend({
        cityId: z.coerce.number().int().positive().optional(),
        cityHref: z.string().max(300).optional(),
        category: z.string().max(100),
        search: z.string().max(120).default(""),
      })
      .parse(req.query);
    const cityId = q.cityId || (await sql`select id from cities where href=${q.cityHref || ''}`)[0]?.id;
    if (!cityId) return { posts: [], page: q.page, hasMore: false };
    const rows =
      await sql`select a.id,a.title,left(a.description,240) as description,a.age,a.location,p.ranked_at,
     (select variants from media where ad_id=a.id and status='ready' and purpose='ad' order by created_at limit 1) as image
     from placements p join ads a on a.id=p.ad_id where p.city_id=${cityId} and a.category_slug=${q.category} and a.status='published'
     and (${q.search}='' or a.search_document @@ websearch_to_tsquery('english',${q.search}))
     order by p.ranked_at desc,p.ad_id desc limit 51 offset ${(q.page - 1) * 50}`;
    return {
      posts: rows.slice(0, 50),
      page: q.page,
      hasMore: rows.length > 50,
    };
  });
  app.get("/api/ads/:id", async (req) => {
    const [ad] =
      await sql`select id,title,description,age,location,phone,contact_email,category_slug,created_at from ads where id=${id.parse(req.params.id)} and status='published'`;
    if (!ad) throw fail(404, "Post not found");
    return {
      post: ad,
      images:
        await sql`select id,variants,width,height from media where ad_id=${ad.id} and status='ready' and purpose='ad' order by created_at`,
      cities:
        await sql`select c.* from placements p join cities c on c.id=p.city_id where p.ad_id=${ad.id}`,
    };
  });
  app.get("/api/account/ads", { preHandler: member }, async (req) => {
    const { page } = pagination.parse(req.query);
    return {
      posts:
        await sql`select a.*,
          (select c.name from placements p join cities c on c.id=p.city_id where p.ad_id=a.id order by p.ranked_at desc limit 1) as city_name,
          (select c.href from placements p join cities c on c.id=p.city_id where p.ad_id=a.id order by p.ranked_at desc limit 1) as city_href,
          (select variants from media m where m.ad_id=a.id and m.status='ready' and m.purpose='ad' order by m.created_at limit 1) as image,
          coalesce((select json_agg(m.variants order by m.created_at,m.id) from media m where m.ad_id=a.id and m.status='ready' and m.purpose='ad'),'[]') as images,
          coalesce((select json_agg(m.id order by m.created_at,m.id) from media m where m.ad_id=a.id and m.status='ready' and m.purpose='ad'),'[]') as media_ids
          from ads a where a.owner_id=${req.user.id} and a.status!='deleted' order by a.created_at desc limit 50 offset ${(page - 1) * 50}`,
    };
  });
  app.post("/api/account/ads", { preHandler: [member, verifiedMember] }, async (req, reply) => {
    const input = adInput.parse(req.body);
    const ad = await sql.begin(async (tx) => {
      const [ad] =
        await tx`insert into ads (owner_id,category_slug,title,description,age,location,phone,contact_email,status) values
       (${req.user.id},${input.categorySlug},${input.title},${input.description},${input.age ?? null},${input.location},${input.phone},${input.contactEmail},'pending') returning *`;
      await tx`insert into placements ${tx([...new Set(input.cityIds)].map((city_id) => ({ ad_id: ad.id, city_id })))}`;
      if (input.mediaIds.length) {
        const media =
          await tx`update media set ad_id=${ad.id} where id in ${tx(input.mediaIds)} and owner_id=${req.user.id} and ad_id is null and purpose='ad' and status='ready' returning id`;
        if (media.length !== input.mediaIds.length)
          throw fail(400, "One or more images are unavailable");
      }
      await audit(tx, req.user.id, "ad.create", ad.id);
      return ad;
    });
    return reply.code(201).send({ post: ad });
  });
  app.patch("/api/account/ads/:id", { preHandler: member }, async (req) => {
    const value=adInput.partial().extend({keepMediaIds:z.array(uuid).max(6).optional()}).parse(req.body);
    return sql.begin(async tx=>{
      const [old]=await tx`select * from ads where id=${id.parse(req.params.id)} and owner_id=${req.user.id} and status!='deleted' for update`;
      if(!old)throw fail(404,'Post not found');
      const [post]=await tx`update ads set title=${value.title??old.title},description=${value.description??old.description},category_slug=${value.categorySlug??old.category_slug},age=${value.age??old.age},location=${value.location??old.location},phone=${value.phone??old.phone},contact_email=${value.contactEmail??old.contact_email},status='pending',updated_at=now() where id=${old.id} returning *`;
      if(value.keepMediaIds){
        const saved=await tx`select id from media where ad_id=${old.id} and purpose='ad' and status='ready'`;
        if(value.keepMediaIds.some(mediaId=>!saved.some(photo=>photo.id===mediaId)))throw fail(400,'One or more saved pictures are unavailable');
        const removed=saved.filter(photo=>!value.keepMediaIds.includes(photo.id)).map(photo=>photo.id);
        if(removed.length)await tx`update media set ad_id=null where id in ${tx(removed)} and ad_id=${old.id}`;
      }
      if(value.mediaIds?.length){
        const attached=await tx`update media set ad_id=${old.id} where id in ${tx(value.mediaIds)} and owner_id=${req.user.id} and purpose='ad' and status='ready' and ad_id is null returning id`;
        if(attached.length!==new Set(value.mediaIds).size)throw fail(400,'One or more pictures are unavailable');
      }
      const [count]=await tx`select count(*)::int as total from media where ad_id=${old.id} and purpose='ad'`;
      if(count.total>6)throw fail(400,'You can add up to 6 pictures');
      await audit(tx,req.user.id,'ad.owner.edit',old.id);
      return {post};
    });
  });
  app.get('/api/account/ads/:id',{preHandler:member},async req=>{
    const [post]=await sql`select id,title,description,age,location,phone,contact_email,category_slug,status,created_at from ads where id=${id.parse(req.params.id)} and owner_id=${req.user.id} and status!='deleted'`;
    if(!post)throw fail(404,'Post not found');
    return {post,images:await sql`select id,variants from media where ad_id=${post.id} and purpose='ad' and status='ready' order by created_at,id`,cities:await sql`select c.* from placements p join cities c on c.id=p.city_id where p.ad_id=${post.id} order by c.id`};
  });
  app.delete('/api/account/ads/:id',{preHandler:member},async req=>sql.begin(async tx=>{
    const [post]=await tx`update ads set status='deleted',updated_at=now() where id=${id.parse(req.params.id)} and owner_id=${req.user.id} and status!='deleted' returning id`;
    if(!post)throw fail(404,'Post not found');
    await audit(tx,req.user.id,'ad.owner.delete',post.id);return {ok:true};
  }));
  app.post('/api/account/ads/:id/status',{preHandler:member},async req=>sql.begin(async tx=>{
    const {status}=z.object({status:z.enum(['paused','pending'])}).parse(req.body);
    const [old]=await tx`select id,status from ads where id=${id.parse(req.params.id)} and owner_id=${req.user.id} and status!='deleted' for update`;
    if(!old)throw fail(404,'Post not found');
    if(status==='paused'&&old.status!=='published')throw fail(400,'Only a published ad can be paused');
    if(status==='pending'&&!['paused','rejected','draft'].includes(old.status))throw fail(400,'This ad is already published or awaiting review');
    await tx`update ads set status=${status},updated_at=now() where id=${old.id}`;
    await audit(tx,req.user.id,'ad.owner.'+status,old.id);return {ok:true};
  }));
  app.post(
    "/api/media/uploads",
    {
      preHandler: [member, verifiedMember],
      config: { rateLimit: { max: 30, timeWindow: "1 hour" } },
    },
    async (req) => {
      if (!storageReady()) throw fail(503, "Image storage is not configured");
      const input = z
        .object({
          bytes: z.number().int().min(1).max(10485760),
          contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
          purpose: z.enum(["ad", "verification"]).default("ad"),
        })
        .parse(req.body);
      const key = "incoming/" + req.user.id + "/" + token();
      const [media] =
        await sql`insert into media (owner_id,object_key,expected_bytes,content_type,purpose) values (${req.user.id},${key},${input.bytes},${input.contentType},${input.purpose}) returning id`;
      const url = await getSignedUrl(
        s3,
        new PutObjectCommand({
          Bucket: config.R2_BUCKET,
          Key: key,
          ContentType: input.contentType,
          ContentLength: input.bytes,
        }),
        { expiresIn: 300 },
      );
      return { id: media.id, url, expiresIn: 300 };
    },
  );
  app.post("/api/media/:id/complete", { preHandler: member }, async (req) => {
    const [media] =
      await sql`select * from media where id=${uuid.parse(req.params.id)} and owner_id=${req.user.id}`;
    if (!media) throw fail(404, "Image not found");
    if (media.status !== "uploading") return { status: media.status };
    const object = await s3.send(
      new HeadObjectCommand({
        Bucket: config.R2_BUCKET,
        Key: media.object_key,
      }),
    );
    if (
      object.ContentLength !== media.expected_bytes ||
      object.ContentType !== media.content_type
    )
      throw fail(400, "Upload does not match declared file");
    await images.add("process", { id: media.id }, { jobId: media.id });
    await sql`update media set status='queued' where id=${media.id} and status='uploading'`;
    return { status: "queued" };
  });
  app.get("/api/media/:id", { preHandler: member }, async (req) => {
    const [media] =
      await sql`select id,status,variants from media where id=${uuid.parse(req.params.id)} and owner_id=${req.user.id}`;
    if (!media) throw fail(404, "Image not found");
    return media;
  });
  app.post("/api/reports", { preHandler: member }, async (req) => {
    const input = z
      .object({
        adId: z.number().int().positive(),
        reason: z.string().trim().min(5).max(2000),
      })
      .parse(req.body);
    await sql`insert into reports (ad_id,reporter_id,reason) values (${input.adId},${req.user.id},${input.reason})`;
    return { ok: true };
  });
  app.post("/api/account/verification", { preHandler: [member, verifiedMember] }, async (req) => {
    const input = z
      .object({ mediaId: uuid, notes: z.string().max(2000).default("") })
      .parse(req.body);
    const [media] =
      await sql`select id from media where id=${input.mediaId} and owner_id=${req.user.id} and purpose='verification' and status='ready'`;
    if (!media) throw fail(400, "Upload a verification photo first");
    await sql.begin(async tx=>{
      await tx`select id from users where id=${req.user.id} for update`;
      if((await tx`select id from verifications where user_id=${req.user.id} and status in ('pending','approved')`).length)throw fail(409,'You already have a verification request awaiting review or approval.');
      await tx`insert into verifications (user_id,media_id,notes) values (${req.user.id},${media.id},${input.notes})`;
    });
    return { ok: true };
  });
  adminManagement(app, { admin, fail });
  app.get("/api/admin/health/system", { preHandler: admin }, async () => {
    const start = performance.now();
    await sql`select 1`;
    const databaseMs = performance.now() - start;
    return {
      databaseMs,
      queue: await images.getJobCounts("waiting", "active", "failed"),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      telemetry: { requests: telemetry.requests, errors: telemetry.errors, startedAt: telemetry.startedAt, p95: [...telemetry.latency].sort((a,b)=>a-b)[Math.floor(telemetry.latency.length*.95)] || 0 },
    };
  });
  app.post("/api/admin/ads/:id/:action", { preHandler: admin }, async (req) => {
    const adId = id.parse(req.params.id);
    const action = z
      .enum(["bump", "distribute", "status"])
      .parse(req.params.action);
    await sql.begin(async (tx) => {
      if (!(await tx`select id from ads where id=${adId} and status!='deleted' for update`).length)
        throw fail(404, "Post not found");
      if (action === "bump") {
        const [post] = await tx`select status from ads where id=${adId}`;
        if (post.status !== "published") throw fail(400, "Only published ads can be bumped");
        await tx`update placements set ranked_at=now() where ad_id=${adId}`;
      }
      if (action === "distribute") {
        const { cityIds } = z
          .object({
            cityIds: z.array(z.number().int().positive()).min(1).max(1000),
          })
          .parse(req.body);
        await tx`insert into placements ${tx([...new Set(cityIds)].map((city_id) => ({ ad_id: adId, city_id })))} on conflict do nothing`;
      }
      if (action === "status") {
        const { status } = z
          .object({
            status: z.enum(["published", "paused", "rejected", "deleted"]),
          })
          .parse(req.body);
        await tx`update ads set status=${status},updated_at=now() where id=${adId}`;
      }
      await audit(tx, req.user.id, "ad." + action, adId, req.body || {});
    });
    return { ok: true };
  });
  app.patch("/api/admin/users/:id", { preHandler: admin }, async (req) => {
    const userId = uuid.parse(req.params.id);
    const { status } = z
      .object({ status: z.enum(["active", "suspended"]) })
      .parse(req.body);
    if (userId === req.user.id)
      throw fail(400, "You cannot suspend your own account");
    await sql.begin(async (tx) => {
      const changed = await tx`update users set status=${status} where id=${userId} and role='member' and status!='deleted' returning id`;
      if (!changed.length) throw fail(400, 'Only existing member accounts can be suspended or restored');
      if (status === 'suspended') await tx`update ads set status='paused',updated_at=now() where owner_id=${userId} and status='published'`;
      await tx`delete from sessions where user_id=${userId}`;
      await audit(tx, req.user.id, "user.status", userId, { status });
    });
    return { ok: true };
  });
  app.post(
    "/api/admin/users/:id/impersonate",
    { preHandler: admin },
    async (req, reply) => {
      const userId = uuid.parse(req.params.id);
      const [user] =
        await sql`select id from users where id=${userId} and status='active' and role='member' and email_verified_at is not null`;
      if (!user) throw fail(404, "Active member not found");
      await audit(sql, req.user.id, "user.impersonate", userId);
      const handoff = token();
      await sql`insert into impersonation_handoffs (token_hash,user_id,actor_id,expires_at) values (${digest(handoff)},${userId},${req.user.id},now()+interval '1 minute')`;
      return { url: `${config.SITE_ORIGIN}/api/auth/impersonate?token=${handoff}` };
    },
  );
  app.get("/api/auth/impersonate", async (req, reply) => {
    if (appContext(req) !== "public") throw fail(404, "Not found");
    const value = z.string().min(30).max(100).parse(req.query.token);
    const [handoff] = await sql`delete from impersonation_handoffs where token_hash=${digest(value)} and expires_at>now() returning *`;
    if (!handoff) throw fail(400, "This support sign-in link has expired");
    const [actor] = await sql`select id from users where id=${handoff.actor_id} and role='admin' and status='active'`;
    const [user] = await sql`select id from users where id=${handoff.user_id} and role='member' and status='active'`;
    if (!actor || !user) throw fail(403, "Support sign-in is unavailable");
    await session(reply, user.id, actor.id);
    return reply.code(303).redirect(`${config.SITE_ORIGIN}/myaccount`);
  });
  app.post("/api/account/impersonation/stop", { preHandler: member }, async (req,reply) => {
    if (!req.user.actor_id) throw fail(400, "No support session is active");
    await sql`delete from sessions where token_hash=${digest(req.cookies[sessionCookie(req)])}`;
    reply.clearCookie(sessionCookie(req), {path:"/",secure:cookieOptions.secure});
    return {ok:true};
  });
  app.patch("/api/admin/reports/:id", { preHandler: admin }, async (req) => {
    const { status } = z
      .object({ status: z.enum(["resolved", "dismissed"]) })
      .parse(req.body);
    await sql.begin(async (tx) => {
      await tx`update reports set status=${status} where id=${id.parse(req.params.id)}`;
      await audit(tx, req.user.id, "report.status", req.params.id, { status });
    });
    return { ok: true };
  });
  app.get(
    "/api/admin/verifications/:id/photo",
    { preHandler: admin },
    async (req) => {
      const [row] =
        await sql`select m.object_key from media m join verifications v on v.media_id=m.id where v.id=${uuid.parse(req.params.id)}`;
      if (!row) throw fail(404, "Verification not found");
      await audit(sql, req.user.id, "verification.view", req.params.id);
      return {
        url: await getSignedUrl(
          s3,
          new GetObjectCommand({
            Bucket: config.R2_BUCKET,
            Key: row.object_key,
          }),
          { expiresIn: 60 },
        ),
      };
    },
  );
  app.patch(
    "/api/admin/verifications/:id",
    { preHandler: admin },
    async (req) => {
      const { status } = z
        .object({ status: z.enum(["approved", "rejected"]) })
        .parse(req.body);
      await sql.begin(async (tx) => {
        await tx`update verifications set status=${status} where id=${uuid.parse(req.params.id)}`;
        await audit(tx, req.user.id, "verification.status", req.params.id, {
          status,
        });
      });
      return { ok: true };
    },
  );
  app.addHook("onClose", async () => {
    await images.close();
    await redis.quit();
    await sql.end();
  });
  return app;
}
