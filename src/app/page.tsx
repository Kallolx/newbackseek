import Image from "next/image";
import { LocationSearch } from "../components/location-search";
import { RegionArrow } from "../components/region-arrow";
import { countries } from "../directory/areas";

const places = countries.flatMap((country) =>
  country.regions.flatMap((region) => [
    { name: region.name, context: country.name, href: region.href },
    ...region.cities.map((city) => ({
      name: city.name,
      context: region.name + ", " + country.name,
      href: city.href,
    })),
  ]),
);

const countryFlags: Record<string, { src: string; alt: string }> = {
  us: { src: "/flags/us.svg", alt: "United States flag" },
  ca: { src: "/flags/ca.svg", alt: "Canada flag" },
  uk: { src: "/flags/gb.svg", alt: "United Kingdom flag" },
  au: { src: "/flags/au.svg", alt: "Australia flag" },
};

export default function Home() {
  return (
    <main id="main">
      <section className="hero">
        <div className="shell hero-inner">
          <h1>
            Local Classifieds &amp; Personal Ads for a Free Backpage Alternative
          </h1>
          <p>
            Browse local classifieds, personal ads, and city listings across the
            US, Canada, the UK, and Australia.
          </p>
        </div>
      </section>
      <div className="shell directory">
        <LocationSearch places={places} />
        <div className="countries">
          {countries.map((country) => (
            <section
              key={country.code}
              className={"country country-" + country.code}
            >
              <header className="country-banner">
                <a href={country.href}>
                  <span className="country-location" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                      <path d="M20 10c0 5.3-8 11-8 11S4 15.3 4 10a8 8 0 1 1 16 0Z" />
                      <circle cx="12" cy="10" r="2.5" />
                    </svg>
                  </span>
                  <h3>{country.name}</h3>
                  <span className="country-flag">
                    <Image
                      src={countryFlags[country.code].src}
                      alt={countryFlags[country.code].alt}
                      width={40}
                      height={28}
                    />
                  </span>
                </a>
              </header>
              <ul>
                {country.regions.map((region) => (
                  <li key={region.href}>
                    <a href={region.href}>
                      <RegionArrow />
                      {region.name}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
