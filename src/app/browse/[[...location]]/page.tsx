import Link from 'next/link';
import { notFound } from 'next/navigation';
import { RegionArrow } from '../../../components/region-arrow';
import { ServiceListings } from '../../../components/service-listings';
import { PostDetail } from '../../../components/post-detail';
import { countries } from '../../../directory/areas';
import { serviceGroups } from '../../../directory/service-groups';
import { getAd, getFeed } from '../../../lib/public-data';

type Place = { name: string; href: string };

export async function generateMetadata({ params }: { params: Promise<{ location?: string[] }> }) {
  const { location = [] } = await params;
  const path = '/browse/' + location.slice(0, 3).join('/');
  const place = countries.flatMap(country => [country, ...country.regions.flatMap(region => [region, ...region.cities])]).find(item => item.href === path);
  const service = serviceGroups.flatMap(group => group.services).find(item => item.slug === location[3]);
  return { title: place ? `${service ? service.name + ' in ' : ''}${place.name} Classifieds & Personal Ads` : 'Browse Cities' };
}

// Always rendered live: a newly published ad must show in every city on the very
// first visit. (Saved page copies made ads look missing in cities nobody had
// visited recently.) Data comes from the API's own cache, cleared on every write.
export const dynamic = 'force-dynamic';

const allCities = countries.flatMap((country) =>
  country.regions.flatMap((region) => region.cities),
);
const popularCityNames = [
  'Phoenix', 'Buffalo', 'Denver', 'Indianapolis', 'Kansas City', 'St Louis',
  'New Orleans', 'Las Vegas', 'Charlotte', 'Long Island', 'San Antonio',
  'Omaha', 'Minneapolis', 'Pittsburgh', 'Tucson', 'Cleveland', 'Spokane',
];
const popularCities = popularCityNames.flatMap((name) =>
  allCities.filter((city) => city.name === name),
);


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

export default async function BrowsePage({
  params,
}: {
  params: Promise<{ location?: string[] }>;
}) {
  const { location = [] } = await params;
  if (!location.length) {
    return (
      <main id="main" className="shell browse-page">
        <h1>All cities</h1>
        {countries.map((country) => (
          <section className="browse-group" key={country.href}>
            <h2>{country.name}</h2>
            <LocationLinks places={country.regions.flatMap((region) => region.cities)} />
          </section>
        ))}
      </main>
    );
  }

  const [countryCode, regionSlug, citySlug, serviceSlug] = location;
  if (location.length > 5) notFound();
  const country = countries.find(({ code }) => code === countryCode);
  if (!country) notFound();
  const region = country.regions.find(({ href }) => href === country.href + '/' + regionSlug);
  if (regionSlug && !region) notFound();
  const city = region?.cities.find(({ href }) => href === region.href + '/' + citySlug);
  if (citySlug && !city) notFound();
  const postId = location[4];
  if (postId && city && region && serviceSlug) {
    const group = serviceGroups.find(({ services }) => services.some(({ slug }) => slug === serviceSlug));
    const service = group?.services.find(({ slug }) => slug === serviceSlug);
    if (!service || !/^\d+$/.test(postId)) notFound();
    const [ad, feed] = await Promise.all([getAd(postId), getFeed(city.href, service.slug)]);
    const initial = ad === 'missing' ? { missing: true as const }
      : ad && ad.post.category_slug === service.slug && ad.cities.some((place) => place.href === city.href)
        ? { post: ad.post, images: ad.images, recent: (feed?.posts || []).filter((item) => String(item.id) !== postId).slice(0, 8) }
        : ad ? { missing: true as const } : undefined;
    return <PostDetail city={city} region={region} service={service} postId={postId} initial={initial} />;
  }
  if (serviceSlug && city && region) {
    const group = serviceGroups.find(({ services }) =>
      services.some(({ slug }) => slug === serviceSlug),
    );
    const service = group?.services.find(({ slug }) => slug === serviceSlug);
    if (!group || !service) notFound();
    const feed = await getFeed(city.href, service.slug);

    return (
      <main id="main" className="shell browse-page">
        <nav className="browse-crumbs" aria-label="Breadcrumb">
          {[country, region, city].map((place) => (
            <span key={place.href}><Link href={place.href}>{place.name}</Link> <span aria-hidden="true">›</span> </span>
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
        />
      </main>
    );
  }
  const current = city ?? region ?? country;

  return (
    <main id="main" className="shell browse-page">
      <nav className="browse-crumbs" aria-label="Breadcrumb">
        {(region ? (city ? [country, region] : [country]) : []).map((place) => (
          <span key={place.href}><Link href={place.href}>{place.name}</Link> <span aria-hidden="true">›</span> </span>
        ))}
        <span aria-current="page">{current.name}</span>
      </nav>
      <h1>{current.title ?? `${current.name} Classifieds & Personal Ads for Backpage ${current.name} Alternative`}</h1>
      <p className="browse-intro">
        {city ? 'Select a category below to browse free ads.' :
          region ? 'Choose a city below to view local listings:' : 'Choose a region below to find a city.'}
      </p>
      {city ? (
        <div className="browse-columns">
          <div>
            {serviceGroups.map((group) => (
              <section className="browse-group" key={group.name}>
                <h2>{group.name}</h2>
                <ul className="service-links">
                  {group.services.map((service) => (
                    <li key={service.slug}>
                      <Link href={city.href + '/' + service.slug} prefetch={false}>
                        <RegionArrow />
                        {service.slug === 'women-seeking-men' ? <strong>{service.name}</strong> : service.name}
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
    </main>
  );
}
