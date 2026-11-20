import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { JsonLd } from "../components/json-ld";
import { AdminIntro, FaqList, PlaceLinks } from "../components/seo-blocks";
import { faqLd, getSeo, organizationLd, pageMetadata, pageOverride, websiteLd } from "../lib/seo";
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

export async function generateMetadata(): Promise<Metadata> { return pageMetadata({ path: "/", kind: "home" }); }

const homeFaq = [
  { q: "What is BackpageNew?", a: "BackpageNew is a free local classifieds and personal ads website, and a new Backpage alternative. Ads are organised by country, state or region, city and category in the United States, Canada, the United Kingdom and Australia." },
  { q: "Is BackpageNew free?", a: "Browsing is free and posting is currently free. If paid options are added, they will be shown clearly before you pay." },
  { q: "Is BackpageNew the same as Backpage.com?", a: "No. BackpageNew is an independent site and is not connected to the former Backpage.com. It follows a similar simple, local, city-by-city idea with clear rules and moderation." },
  { q: "How do I post an ad?", a: "Create a free account, verify your email, choose Post an Ad, pick your cities and a category, and add a title, description and pictures. New ads are reviewed before they appear." },
];
const topCities = ["Phoenix", "Las Vegas", "Denver", "Charlotte", "New Orleans", "San Antonio", "Minneapolis", "Pittsburgh", "Tucson", "Cleveland", "Omaha", "Indianapolis"]
  .flatMap((name) => places.filter((place) => place.name === name && place.context.includes(", ")).slice(0, 1));

export default async function Home() {
  const { settings } = await getSeo();
  const override = await pageOverride("/");
  return (
    <main id="main">
      <JsonLd data={[settings.schema.organization && organizationLd(settings), settings.schema.website && websiteLd(settings), settings.schema.faq && faqLd(homeFaq)]} />
      <section className="hero">
        <div className="shell hero-inner">
          <h1>
            {override.h1 || "Local Classifieds & Personal Ads for a Free Backpage Alternative"}
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
                <Link href={country.href} prefetch={false}>
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
                </Link>
              </header>
              <ul>
                {country.regions.map((region) => (
                  <li key={region.href}>
                    <Link href={region.href} prefetch={false}>
                      <RegionArrow />
                      {region.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
        <AdminIntro text={override.intro} />
        <section className="seo-text home-about" aria-labelledby="home-about">
          <h2 id="home-about">The new Backpage alternative for local classifieds</h2>
          <p>BackpageNew helps you find and post local classifieds and personal ads in your own city. Choose your country, then your state or region, then your city, and browse categories such as dating, services, jobs, rentals, buy and sell, pets and automotive.</p>
          <p>Read more about <Link href="/backpage-alternative">the new Backpage alternative</Link>, browse <Link href="/classifieds">free classifieds</Link>, <Link href="/personals">personal ads</Link> or <Link href="/dating">dating ads</Link>, or see <Link href="/about">how BackpageNew works</Link>.</p>
        </section>
        <PlaceLinks title="Popular cities" places={topCities.map((place) => ({ name: place.name, href: place.href }))} more={{ href: "/browse", label: "All cities" }} />
        {settings.schema.faq && <FaqList items={homeFaq} />}
      </div>
    </main>
  );
}
