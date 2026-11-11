import referenceLocations from './reference-locations.json';

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export const countries = referenceLocations.map((country) => {
  const href = '/browse/' + country.code;

  return {
    code: country.code,
    name: country.name,
    href,
    title: undefined,
    regions: country.regions.map((region) => {
      const regionHref = href + '/' + slug(region.name);

      return {
        name: region.name,
        title: region.title,
        href: regionHref,
        cities: region.cities.map((city) => ({
          name: city.name,
          title: city.title,
          href: regionHref + '/' + slug(city.name),
        })),
      };
    }),
  };
});
