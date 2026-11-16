import Link from 'next/link';
import { notFound } from 'next/navigation';
import { RegionArrow } from '../../../components/region-arrow';
import { ServiceListings } from '../../../components/service-listings';
import { PostDetail } from '../../../components/post-detail';
import { countries } from '../../../directory/areas';
import { serviceGroups } from '../../../directory/service-groups';

type Place = { name: string; href: string };

export async function generateMetadata({ params }: { params: Promise<{ location?: string[] }> }) {
  const { location = [] } = await params;
  const path = '/browse/' + location.slice(0, 3).join('/');
  const place = countries.flatMap(country => [country, ...country.regions.flatMap(region => [region, ...region.cities])]).find(item => item.href === path);
  const service = serviceGroups.flatMap(group => group.services).find(item => item.slug === location[3]);
  return { title: place ? `${service ? service.name + ' in ' : ''}${place.name} Classifieds & Personal Ads` : 'Browse Cities' };
}

// City routes are mostly static. Revalidate the small dynamic listing variants
// periodically instead of rebuilding their response for every request.
export const revalidate = 3600;

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

export function generateStaticParams() {
  const paths = countries.flatMap((country) => [
    country.href,
    ...country.regions.flatMap((region) => [region.href, ...region.cities.map((city) => city.href)]),
  ]);
  return [{ location: [] }, ...paths.map((href) => ({ location: href.split('/').slice(2) }))];
}

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
    return <PostDetail city={city} region={region} service={service} postId={postId} />;
  }
  if (serviceSlug && city && region) {
    const group = serviceGroups.find(({ services }) =>
      services.some(({ slug }) => slug === serviceSlug),
    );
    const service = group?.services.find(({ slug }) => slug === serviceSlug);
    if (!group || !service) notFound();

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
