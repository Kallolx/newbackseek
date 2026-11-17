const base = process.argv[2] || 'https://backpagenew.com';
for (const path of ['/', '/auth', '/?asset-check=' + Date.now()]) {
  const response = await fetch(base + path);
  const html = await response.text();
  const assets = [...new Set([...html.matchAll(/(?:src|href)="([^" ]*\/_next\/static\/[^" ]*)/g)].map(match => match[1]))];
  const results = await Promise.all(assets.map(async asset => {
    const result = await fetch(new URL(asset, base));
    return { asset, status: result.status, type: result.headers.get('content-type') };
  }));
  console.log(JSON.stringify({path,cache:response.headers.get('cf-cache-status'),age:response.headers.get('age'),assets:results.length,failures:results.filter(result=>result.status!==200),css:results.filter(result=>result.asset.endsWith('.css'))}));
}
