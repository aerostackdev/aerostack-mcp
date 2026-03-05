// get-aerostack Cloudflare Worker
// Serves https://get.aerostack.dev
// 
// Best practice: redirect to GitHub Raw. This means:
//   - Scripts live as real .sh files in the repo (no escaping hell)
//   - Script updates require NO worker redeploy — just commit to main
//   - 302 redirect so clients always fetch latest from GitHub

const GITHUB_BASE =
  "https://raw.githubusercontent.com/aerostackdev/sdks/main/packages/cli/install";

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    switch (url.pathname) {
      case "/":
      case "/install.sh":
        return Response.redirect(`${GITHUB_BASE}/install.sh`, 302);

      case "/uninstall.sh":
        return Response.redirect(`${GITHUB_BASE}/uninstall.sh`, 302);

      default:
        return new Response("Not Found", { status: 404 });
    }
  },
};
