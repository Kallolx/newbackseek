// Creating a published ad on behalf of the team. Used by Ad Publish (right away) and by the Post planner
// (later, from the worker), so both produce exactly the same ad: owner, category, cities and pictures.
import { z } from 'zod';
import { audit } from './db.mjs';

export const adSchema = z.object({
  title: z.string().trim().min(5).max(140), description: z.string().trim().min(20).max(6000), categorySlug: z.string().min(1), owner: z.string().min(1),
  cityHrefs: z.array(z.string().startsWith('/browse/')).min(1).max(1500), age: z.number().int().min(18).max(120).optional(),
  location: z.string().max(200).default(''), phone: z.string().max(40).default(''), contactEmail: z.union([z.email().max(254), z.literal('')]).default(''),
  mediaIds: z.array(z.uuid()).max(12).default([]),
});

const problem = (message) => Object.assign(new Error(message), { statusCode: 400 });

/** Inserts the ad, its city placements and pictures inside `tx`. `input` must already match adSchema. */
export async function insertAd(tx, actorId, input, details = {}) {
  const [owner] = await tx`select id from users where username=${input.owner} and status='active'`;
  if (!owner) throw problem('Choose an existing active owner username');
  const hrefs = [...new Set(input.cityHrefs)];
  const cities = await tx`select id from cities where href in ${tx(hrefs)}`;
  if (cities.length !== hrefs.length) throw problem('Some destination cities are unavailable');
  const [post] = await tx`insert into ads(owner_id,title,description,category_slug,age,location,phone,contact_email,status) values(${owner.id},${input.title},${input.description},${input.categorySlug},${input.age ?? null},${input.location},${input.phone},${input.contactEmail},'published') returning *`;
  await tx`insert into placements ${tx(cities.map((city) => ({ ad_id: post.id, city_id: city.id })))}`;
  if (input.mediaIds.length) {
    const media = await tx`update media set ad_id=${post.id},ever_attached=true where id in ${tx(input.mediaIds)} and owner_id=${actorId} and purpose='ad' and status='ready' and ad_id is null returning id`;
    if (media.length !== input.mediaIds.length) throw problem('Images are still processing or unavailable');
  }
  await audit(tx, actorId, 'ad.publish', post.id, details);
  return post;
}
