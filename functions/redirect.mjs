// Visitors from Bulgaria who open the root pages are sent to /bg/.
// /bg with no trailing slash is sent to /bg/ for every country, so relative
// asset URLs resolve inside that directory.

export function redirectTarget(pathname, country) {
  if (pathname === "/bg") return "/bg/";
  if (country !== "BG") return null;
  if (pathname === "/" || pathname === "/index.html") return "/bg/";
  if (pathname === "/about.html") return "/bg/about.html";
  return null;
}
