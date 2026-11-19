// Checks a deployed website from the outside, straight after a deploy (docs/deployment.md):
//
//   npm run check-deploy -- https://your-site.vercel.app
//
// It only reads public pages, so it needs no keys and is fine to run any time. It exits with 1 if
// anything failed.

const address = (process.argv[2] || process.env.SITE_URL || '').trim().replace(/\/+$/, '');
if (!address) {
  console.error('Give the website address, for example: npm run check-deploy -- https://your-site.vercel.app');
  process.exit(1);
}
let site;
try {
  site = new URL(address);
} catch {
  console.error(`${address} isn't a web address`);
  process.exit(1);
}
const local = ['localhost', '127.0.0.1'].includes(site.hostname);

let failed = 0;
function result(ok, what, detail = '') {
  if (!ok) failed += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${what}${detail ? `: ${detail}` : ''}`);
}

async function get(path, options = {}) {
  try {
    return await fetch(`${site.origin}${path}`, {
      redirect: 'manual',
      signal: AbortSignal.timeout(15000),
      ...options,
    });
  } catch (error) {
    return { status: 0, error: error?.cause?.code || error?.name || 'no answer' };
  }
}

// Vercel answers 401 with its own login page when Deployment Protection is on (previews)
function protectedBy(response) {
  return response.status === 401 && response.headers?.get('server') === 'Vercel';
}

console.log(`Checking ${site.origin}\n`);
result(
  site.protocol === 'https:' || local,
  'https',
  site.protocol === 'https:' ? '' : local ? 'not needed on this computer' : 'the live site has to use https',
);

const home = await get('/');
if (protectedBy(home)) {
  console.log('\nVercel asked for a login, so Deployment Protection is on for this address.');
  console.log('Check the Production address instead, or open this one in a browser signed in to Vercel.');
  process.exit(1);
}
result(home.status === 200, 'home page', home.status ? `${home.status}` : home.error);
if (home.status === 200) {
  result(Boolean(home.headers.get('content-security-policy')), 'security headers', 'Content-Security-Policy');
  if (!local) {
    result(Boolean(home.headers.get('strict-transport-security')), 'security headers', 'Strict-Transport-Security');
  }
}

const health = await get('/health');
let healthBody = null;
try {
  healthBody = health.status ? await health.json() : null;
} catch {
  healthBody = null;
}
result(
  health.status === 200 && healthBody?.status === 'ok',
  'database (/health)',
  health.status === 200
    ? ''
    : health.status === 503
      ? 'the website has no Supabase settings, or can\'t read species_public. The reason is in the Vercel logs, as "Health check failed"'
      : health.status === 404
        ? 'no /health page, so this deploy is older than main'
        : `${health.status || health.error}`,
);

const login = await get('/login');
const loginPage = login.status === 200 ? await login.text() : '';
result(
  login.status === 200 && !/set up on this server/.test(loginPage),
  'staff sign in',
  login.status !== 200
    ? `${login.status || login.error}`
    : /set up on this server/.test(loginPage)
      ? 'the build had no Supabase settings. Add them in Vercel and redeploy'
      : '',
);

const dashboard = await get('/dashboard');
const goesTo = dashboard.headers?.get('location') || '';
result(
  [302, 303, 307, 308].includes(dashboard.status) && goesTo.includes('/login'),
  'dashboard asks for sign in',
  dashboard.status ? `${dashboard.status}${goesTo ? ` to ${goesTo}` : ''}` : dashboard.error,
);

const welcome = await get('/welcome');
result(welcome.status === 200, 'invite and password page (/welcome)', `${welcome.status || welcome.error}`);

const plants = await get('/plants');
const plantsPage = plants.status === 200 ? await plants.text() : '';
const shown = plantsPage.match(/Showing all (\d+) plants?/);
result(
  plants.status === 200,
  'plant list',
  plants.status === 200 ? (shown ? `${shown[1]} species` : '') : `${plants.status || plants.error}`,
);

console.log(failed ? `\n${failed} check${failed === 1 ? '' : 's'} failed.` : '\nEverything answered as it should.');
console.log('This can\'t see the Supabase Auth URL settings. Check those by hand (docs/deployment.md).');
process.exit(failed ? 1 : 0);
