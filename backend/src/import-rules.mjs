import { z } from 'zod';
import { sql, audit } from './db.mjs';

const domain = z.string().trim().toLowerCase().min(4).max(253).regex(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/);
const selector = z.string().trim().max(300);
const input = z.object({
  name: z.string().trim().min(2).max(60),
  selectors: z.object({
    title: selector.min(1), description: selector.min(1), images: selector.min(1),
    age: selector.default(''), location: selector.default(''), phone: selector.default(''), email: selector.default(''),
  }).strict(),
}).strict();

export function importRuleRoutes(app, { admin }) {
  app.get('/api/admin/import-rules', { preHandler: admin }, async () => {
    const rows = await sql`select domain,name,selectors,updated_at from admin_import_rules order by domain`;
    return { rules: rows };
  });
  app.put('/api/admin/import-rules/:domain', { preHandler: admin }, async req => {
    const key = domain.parse(req.params.domain);
    const body = input.parse(req.body);
    const [row] = await sql`insert into admin_import_rules (domain,name,selectors,created_by,updated_by)
      values (${key},${body.name},${sql.json(body.selectors)},${req.user.id},${req.user.id})
      on conflict (domain) do update set name=excluded.name,selectors=excluded.selectors,updated_by=excluded.updated_by,updated_at=now()
      returning domain,name,selectors,updated_at`;
    await audit(sql, req.user.id, 'import_rule.save', key);
    return { rule: row };
  });
}
