import Link from 'next/link';
import { JsonLd } from './json-ld';
import { AdminIntro, FaqList, PlaceLinks } from './seo-blocks';
import { countries } from '../directory/areas';
import { serviceGroups } from '../directory/service-groups';
import type { Landing } from '../content/pages';
import { breadcrumbLd, faqLd, getSeo, pageOverride, SITE_ORIGIN } from '../lib/seo';

const cityNames = ['Phoenix', 'Las Vegas', 'Denver', 'Charlotte', 'New Orleans', 'San Antonio', 'Minneapolis', 'Pittsburgh', 'Tucson', 'Cleveland', 'Omaha', 'Indianapolis'];
const cities = countries.flatMap((country) => country.regions.flatMap((region) => region.cities));

/** Landing page for a search topic: real content, links into cities and categories, FAQ and structured data. */
export async function InfoPage({ page, category }: { page: Landing; category?: string }) {
  const { settings } = await getSeo();
  const override = await pageOverride(page.path);
  const places = cityNames.flatMap((name) => cities.filter((city) => city.name === name).slice(0, 1));
  const service = category ? serviceGroups.flatMap((group) => group.services).find((item) => item.slug === category) : undefined;
  return <main id="main" className="legal-page">
    <article className="legal-content info-page">
      <JsonLd data={[
        settings.schema.breadcrumbs && breadcrumbLd([{ name: 'Home', path: '/' }, { name: page.h1, path: page.path }]),
        { '@context': 'https://schema.org', '@type': 'WebPage', name: page.h1, description: page.description, url: SITE_ORIGIN + page.path, inLanguage: 'en', isPartOf: { '@id': SITE_ORIGIN + '/#website' } },
        settings.schema.faq && page.faq.length > 0 && faqLd(page.faq),
      ]} />
      <p className="legal-kicker">{settings.site.name}</p>
      <h1>{override.h1 || page.h1}</h1>
      <p className="legal-summary">{page.lead}</p>
      <AdminIntro text={override.intro} />
      <div className="legal-copy">
        {page.sections.map((section) => <section key={section.heading}>
          <h2>{section.heading}</h2>
          {section.paragraphs?.map((text) => <p key={text}>{text}</p>)}
          {section.list && <ul>{section.list.map((item) => <li key={item}>{item}</li>)}</ul>}
        </section>)}
      </div>
      <PlaceLinks title={service ? `${service.name} in popular cities` : 'Browse popular cities'} places={places.map((city) => ({ name: service ? `${service.name} in ${city.name}` : city.name, href: service ? city.href + '/' + service.slug : city.href }))} more={{ href: '/browse', label: 'All cities' }} />
      <FaqList items={page.faq} />
      <nav className="seo-places" aria-label="Related pages"><h2>Related</h2><ul>{page.related.map((item) => <li key={item.href}><Link href={item.href}>{item.label}</Link></li>)}</ul></nav>
    </article>
  </main>;
}
