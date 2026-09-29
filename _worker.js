// Worker entry (`main` in wrangler.jsonc). `assets.run_worker_first` lists the
// paths below; without that, Cloudflare serves index.html for `/` and this
// file never runs. `.assetsignore` keeps it out of the public upload.
//
// Visitors from Bulgaria who open the root pages are sent to /bg/.
// /bg with no trailing slash is sent to /bg/ for every country, so relative
// asset URLs resolve inside that directory. /about is accepted as well as
// /about.html because Pages rewrites the .html URL before the worker sees it.

export function redirectTarget(pathname, country) {
  if (pathname === "/bg") return "/bg/";
  if (country !== "BG") return null;
  if (pathname === "/" || pathname === "/index.html") return "/bg/";
  if (pathname === "/about" || pathname === "/about.html") return "/bg/about.html";
  return null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const country = request.cf && request.cf.country;
    const target = redirectTarget(url.pathname, country);
    if (!target) return env.ASSETS.fetch(request);

    const destination = new URL(target + url.search, url.origin);
    return new Response(null, {
      status: 302,
      headers: {
        Location: destination.toString(),
        "Cache-Control": "private, no-store",
      },
    });
  },
};
