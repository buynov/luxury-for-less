import { redirectTarget } from "./redirect.mjs";

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const country = context.request.cf && context.request.cf.country;
  const target = redirectTarget(url.pathname, country);
  if (!target) return context.next();

  const destination = new URL(target + url.search, url.origin);
  return new Response(null, {
    status: 302,
    headers: {
      Location: destination.toString(),
      "Cache-Control": "private, no-store",
    },
  });
}
