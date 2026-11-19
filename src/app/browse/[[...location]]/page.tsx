import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import { RegionArrow } from '../../../components/region-arrow';
import { ServiceListings } from '../../../components/service-listings';
import { PostDetail } from '../../../components/post-detail';
import { JsonLd } from '../../../components/json-ld';
import { AdminIntro, FaqList, PlaceLinks } from '../../../components/seo-blocks';
import { countries } from '../../../directory/areas';
import { serviceGroups } from '../../../directory/service-groups';
import { isBoldGroup, isBoldService } from '../../../directory/emphasis';
import { getAd, getFeed, getStats } from '../../../lib/public-data';
import { adLd, breadcrumbLd, collectionLd, excerpt, faqLd, getSeo, pageMetadata, pageOverride, type Kind } from '../../../lib/seo';

type Place = { name: string; href: string };
type Params = { params: Promise<{ location?: string[] }> };

const allServices = serviceGroups.flatMap((group) => group.services);
const allCities = countries.flatMap((country) => country.regions.flatMap((region) => region.cities));
const popularCityNames = ['Phoenix', 'Buffalo', 'Denver', 'Indianapolis', 'Kansas City', 'St Louis', 'New Orleans', 'Las Vegas', 'Charlotte', 'Long Island', 'San Antonio', 'Omaha', 'Minneapolis', 'Pittsburgh', 'Tucson', 'Cleveland', 'Spokane'];
const popularCities = popularCityNames.flatMap((name) => allCities.filter((city) => city.name === name));

/** Works out which country / region / city / category / ad a /browse/... address means. */
function resolve(location: string[]) {
  const [countryCode, regionSlug, citySlug, serviceSlug, postId] = location;
  if (location.length > 5) return null;
  const country = countries.find(({ code }) => code === countryCode);
  if (!country) return null;
  const region = country.regions.find(({ href }) => href === country.href + '/' + regionSlug);
  if (regionSlug && !region) return null;
  const city = region?.cities.find(({ href }) => href === region.href + '/' + citySlug);
  if (citySlug && !city) return null;
  const group = serviceSlug ? serviceGroups.find(({ services }) => services.some(({ slug }) => slug === serviceSlug)) : undefined;
  const service = group?.services.find(({ slug }) => slug === serviceSlug);
  if (serviceSlug && (!city || !service)) return null;
  if (postId && (!service || !/^\d+$/.test(postId))) return null;
  return { country, region, city, group, service, postId };
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { location = [] } = await params;
  const place = resolve(location);
  if (!location.length) return pageMetadata({ path: '/browse', kind: 'page', title: 'All Cities – BackpageNew Classifieds in the US, Canada, UK & Australia', description: 'Browse every BackpageNew city: free local classifieds and personal ads in the United States, Canada, the United Kingdom and Australia.', vars: { title: 'All cities' } });
  if (!place) return { title: 'Page not found', robots: { index: false, follow: false } };
  const { country, region, city, service, postId } = place;
  const { settings } = await getSeo();
  const vars = { country: country.name, region: region?.name, city: city?.name, category: service?.name };

  if (postId && city && service) {
    const ad = await getAd(postId);
    if (!ad || ad === 'missing') return { title: 'Ad not available', robots: { index: false, follow: true } };
    const canonical = (ad.canonicalHref || city.href) + '/' + ad.post.category_slug + '/' + ad.post.id;
    const old = settings.indexing.adMaxAgeDays > 0 && Date.now() - new Date(ad.post.created_at).getTime() > settings.indexing.adMaxAgeDays * 86400000;
    const image = ad.images[0]?.variants.full?.url || ad.images[0]?.variants.card?.url;
    return pageMetadata({ path: canonical, kind: 'ad', vars: { ...vars, city: city.name, title: ad.post.title, excerpt: excerpt(ad.post.description) }, image, noindex: old, type: 'article', published: ad.post.created_at, modified: ad.post.created_at });
  }
  if (service && city) {
    const feed = await getFeed(city.href, service.slug);
    const count = feed?.posts.length ?? 0;
    const adsLine = count ? (feed?.hasMore ? `${count}+ active ads.` : `${count} active ad${count === 1 ? '' : 's'}.`) : '';
    // Pages with (almost) no ads are kept out of Google; they would only dilute the site's quality.
    const thin = feed !== null && count < Math.max(1, settings.indexing.minAdsForListing);
    return pageMetadata({ path: city.href + '/' + service.slug, kind: 'category', vars: { ...vars, adsLine }, noindex: thin });
  }
  const kind: Kind = city ? 'city' : region ? 'region' : 'country';
  const stats = city ? await getStats(city.href) : null;
  const adsLine = stats?.total ? `${stats.total} active ads right now.` : '';
  return pageMetadata({ path: (city ?? region ?? country).href, kind, vars: { ...vars, adsLine } });
}

// Always rendered live: a newly published ad must show in every city on the very
// first visit. (Saved page copies made ads look missing in cities nobody had
// visited recently.) Data comes from the API's own cache, cleared on every write.
export const dynamic = 'force-dynamic';

function LocationLinks({ places }: { places: Place[] }) {
  return (
    <ul className="location-links">
      {places.map((place) => (
        <li key={place.href}>
          <Link href={place.href} prefetch={false}><RegionArrow />{place.name}</Link>
        </li>
      ))}
    </ul>
  );
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export default async function BrowsePage({ params }: Params) {
  const { location = [] } = await params;
  const { settings } = await getSeo();
  if (!location.length) {
    const override = await pageOverride('/browse');
    return (
      <main id="main" className="shell browse-page">
        <JsonLd data={settings.schema.breadcrumbs && breadcrumbLd([{ name: 'Home', path: '/' }, { name: 'All cities', path: '/browse' }])} />
        <h1>{override.h1 || 'All cities'}</h1>
        <AdminIntro text={override.intro} />
        {countries.map((country) => (
          <section className="browse-group" key={country.href}>
            <h2><Link href={country.href}>{country.name}</Link></h2>
            <LocationLinks places={country.regions.flatMap((region) => region.cities)} />
          </section>
        ))}
      </main>
    );
  }

  const place = resolve(location);
  if (!place) notFound();
  const { country, region, city, group, service, postId } = place;

  // ----- One ad -----
  if (postId && city && region && service) {
    const [ad, feed] = await Promise.all([getAd(postId), getFeed(city.href, service.slug)]);
    // An ad that is gone answers with a real 404 (search engines drop it), not an empty page.
    if (ad === 'missing') notFound();
    if (ad && ad.post.category_slug !== service.slug) {
      const right = allServices.find((item) => item.slug === ad.post.category_slug);
      if (right && ad.canonicalHref) permanentRedirect(ad.canonicalHref + '/' + right.slug + '/' + ad.post.id);
      notFound();
    }
    // Asked for in a city the ad is not in: send visitors (and search engines) to its main address.
    if (ad && !ad.cities.some((item) => item.href === city.href)) permanentRedirect((ad.canonicalHref || ad.cities[0]?.href || city.href) + '/' + service.slug + '/' + ad.post.id);
    const initial = ad ? { post: ad.post, images: ad.images, recent: (feed?.posts || []).filter((item) => String(item.id) !== postId).slice(0, 8) } : undefined;
    const canonical = ad ? (ad.canonicalHref || city.href) + '/' + service.slug + '/' + postId : city.href + '/' + service.slug + '/' + postId;
    return <>
      {ad && <JsonLd data={[
        settings.schema.ad && adLd({ title: ad.post.title, description: excerpt(ad.post.description), path: canonical, images: ad.images.map((image) => image.variants.full?.url || image.variants.card?.url || '').filter(Boolean).slice(0, 5), published: ad.post.created_at, modified: ad.post.created_at }),
        settings.schema.breadcrumbs && breadcrumbLd([{ name: 'Home', path: '/' }, { name: country.name, path: country.href }, { name: region.name, path: region.href }, { name: city.name, path: city.href }, { name: service.name, path: city.href + '/' + service.slug }, { name: ad.post.title, path: canonical }]),
      ]} />}
      <PostDetail city={city} region={region} service={service} postId={postId} initial={initial} />
    </>;
  }

  // ----- A city's category (the ad list) -----
  if (service && city && region && group) {
    const feed = await getFeed(city.href, service.slug);
    const path = city.href + '/' + service.slug;
    const override = await pageOverride(path);
    return (
      <main id="main" className="shell browse-page">
        <JsonLd data={[
          settings.schema.breadcrumbs && breadcrumbLd([{ name: 'Home', path: '/' }, { name: country.name, path: country.href }, { name: region.name, path: region.href }, { name: city.name, path: city.href }, { name: service.name, path }]),
          settings.schema.itemList && collectionLd({ name: `${service.name} in ${city.name}, ${region.name}`, path, description: `${service.name} ads in ${city.name}, ${region.name}.`, place: { city: city.name, region: region.name, country: country.name }, items: (feed?.posts ?? []).slice(0, 20).map((post) => ({ name: post.title, path: path + '/' + post.id })) }),
        ]} />
        <nav className="browse-crumbs" aria-label="Breadcrumb">
          {[country, region, city].map((item) => (
            <span key={item.href}><Link href={item.href}>{item.name}</Link> <span aria-hidden="true">›</span> </span>
          ))}
          <strong aria-current="page">{service.name}</strong>
        </nav>
        <ServiceListings
          key={city.href + '/' + service.slug}
          city={city}
          service={service}
          groups={serviceGroups}
          dating={group.name === 'Dating' || group.name === 'Adult'}
          initial={feed ?? undefined}
          heading={override.h1 || undefined}
        />
        <AdminIntro text={override.intro} />
        <PlaceLinks title={`More ${service.name} near ${city.name}`} places={region.cities.filter((item) => item.href !== city.href).slice(0, 12).map((item) => ({ name: `${service.name} in ${item.name}`, href: item.href + '/' + service.slug }))} />
        <PlaceLinks title={`Other categories in ${city.name}`} places={group.services.filter((item) => item.slug !== service.slug).slice(0, 12).map((item) => ({ name: item.name, href: city.href + '/' + item.slug }))} more={{ href: city.href, label: `All categories in ${city.name}` }} />
      </main>
    );
  }

  // ----- Country, region or city page -----
  const current = city ?? region ?? country;
  const override = await pageOverride(current.href);
  const stats = await getStats(current.href);
  const crumbs = [{ name: 'Home', path: '/' }, { name: country.name, path: country.href }, ...(region ? [{ name: region.name, path: region.href }] : []), ...(city ? [{ name: city.name, path: city.href }] : [])];
  const h1 = override.h1 || current.title || `${current.name} Classifieds & Personal Ads for Backpage ${current.name} Alternative`;

  // Words that are true for this place right now (unique per page, not boilerplate).
  const categoryNames = new Map(allServices.map((item) => [item.slug, item.name]));
  const top = (stats?.categories ?? []).slice(0, 3).map((item) => categoryNames.get(item.slug) ?? item.slug);
  const intro = city
    ? `${city.name} is one of the cities on BackpageNew, the new Backpage alternative. Browse free classifieds and personal ads from people in ${city.name}, ${region?.name}, or post your own.${stats?.total ? ` There ${stats.total === 1 ? 'is' : 'are'} ${plural(stats.total, 'active ad')} in ${city.name} right now${top.length ? `, most of them in ${top.length > 1 ? top.slice(0, -1).join(', ') + ' and ' + top[top.length - 1] : top[0]}` : ''}.` : ''}`
    : region
      ? `Choose a city in ${region.name} to see its local classifieds and personal ads. BackpageNew covers ${plural(region.cities.length, 'city')} in ${region.name}.${stats?.total ? ` Together they have ${plural(stats.total, 'active ad')} right now.` : ''}`
      : `BackpageNew has free classifieds and personal ads across ${plural(country.regions.length, country.code === 'us' ? 'state' : 'region')} in ${country.name}. Choose a ${country.code === 'us' ? 'state' : 'region'} to find your city.`;
  const faq = city ? [
    { q: `How do I post an ad in ${city.name}?`, a: `Create a free BackpageNew account, verify your email, choose Post an Ad, pick ${city.name} as the city and a category, then add a title, description and pictures. Your ad is reviewed and then appears in ${city.name}.` },
    { q: `Is BackpageNew free to use in ${city.name}?`, a: `Browsing ${city.name} classifieds and personal ads is free. Posting is currently free as well; if paid options are added, they will be shown clearly before you pay.` },
    { q: `How do I stay safe meeting someone from an ad in ${city.name}?`, a: `Meet in a public place, tell a friend where you are going, never send money to someone you have not met and trust your instincts. Read our safety tips on the blog and report any ad that breaks the Guidelines.` },
    { q: `Do I need to be 18 to use BackpageNew?`, a: `Yes. BackpageNew is for adults only. You must be at least 18 years old to browse or post.` },
  ] : [];

  return (
    <main id="main" className="shell browse-page">
      <JsonLd data={[
        settings.schema.breadcrumbs && breadcrumbLd(crumbs),
        settings.schema.itemList && collectionLd({ name: h1, path: current.href, description: intro, place: { city: city?.name, region: region?.name, country: country.name }, items: city ? serviceGroups.flatMap((item) => item.services).slice(0, 12).map((item) => ({ name: `${item.name} in ${city.name}`, path: city.href + '/' + item.slug })) : (region?.cities ?? country.regions).slice(0, 50).map((item) => ({ name: item.name, path: item.href })) }),
        settings.schema.faq && faq.length > 0 && faqLd(faq),
      ]} />
      <nav className="browse-crumbs" aria-label="Breadcrumb">
        {(region ? (city ? [country, region] : [country]) : []).map((place) => (
          <span key={place.href}><Link href={place.href}>{place.name}</Link> <span aria-hidden="true">›</span> </span>
        ))}
        <span aria-current="page">{current.name}</span>
      </nav>
      <h1>{h1}</h1>
      <p className="browse-intro">{intro}</p>
      <AdminIntro text={override.intro} />
      {city ? (
        <div className="browse-columns">
          <div>
            {serviceGroups.map((item) => (
              <section className="browse-group" key={item.name}>
                <h2 data-bold={isBoldGroup(item.name) || undefined}>{item.name}</h2>
                <ul className="service-links">
                  {item.services.map((service) => (
                    <li key={service.slug}>
                      <Link href={city.href + '/' + service.slug} prefetch={false}>
                        <RegionArrow />
                        {isBoldService(service.slug) ? <strong>{service.name}</strong> : service.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
          <aside className="browse-group popular-cities">
            <h2>Popular Cities</h2>
            <LocationLinks places={popularCities} />
            <Link href="/browse">See All Cities →</Link>
          </aside>
        </div>
      ) : <LocationLinks places={region?.cities ?? country.regions} />}
      {city && region && <PlaceLinks title={`Nearby cities in ${region.name}`} places={region.cities.filter((item) => item.href !== city.href).slice(0, 14).map((item) => ({ name: item.name, href: item.href }))} more={{ href: region.href, label: `All ${region.name} cities` }} />}
      {!city && region && stats?.cities?.length ? <PlaceLinks title={`Most active cities in ${region.name}`} places={stats.cities.slice(0, 10).flatMap((item) => { const found = region.cities.find((c) => c.href === item.href); return found ? [{ name: found.name, href: found.href, note: plural(item.n, 'ad') }] : []; })} /> : null}
      {!city && !region && <PlaceLinks title={`Popular cities in ${country.name}`} places={country.regions.flatMap((item) => item.cities).filter((item) => popularCityNames.includes(item.name)).slice(0, 14).map((item) => ({ name: item.name, href: item.href }))} more={{ href: '/browse', label: 'All cities' }} />}
      {faq.length > 0 && settings.schema.faq && <FaqList items={faq} />}
    </main>
  );
}
