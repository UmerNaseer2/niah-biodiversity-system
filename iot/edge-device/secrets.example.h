// Copy this to secrets.h, which git ignores, and fill it in. Never commit secrets.h.

// The AP router for this forest region. It needs internet for readings to reach Supabase.
#define WIFI_SSID     "your-router-name"
#define WIFI_PASSWORD "your-router-password"

// The project's address and its publishable key. The publishable key is not secret on its own. It
// only lets this device ask, and the token is what the database checks.
#define SUPABASE_URL             "https://your-project.supabase.co"
#define SUPABASE_PUBLISHABLE_KEY "your-publishable-key"

// This device's ID and token. An admin makes the token on the Devices page in the dashboard, and
// it's only shown once. If it's lost or this file gets out, make a new one there. The old one stops
// working straight away.
#define DEVICE_ID    "NNP-EDGE-01"
#define DEVICE_TOKEN "paste-the-token-from-the-devices-page"

// Has to match NODE_SECRET on this region's sensor nodes. Make up a long random string.
#define NODE_SECRET "make-up-a-long-random-string"

// The nodes allowed to send through this device. Anything else is turned down here.
static const char *const ALLOWED_NODES[] = {"NNP-IOT-01", "NNP-IOT-02", "NNP-IOT-03"};

// The certificate the HTTPS connection is checked against. Use the root certificate your project's
// address really chains up to. iot/README.md says how to get it. It's public, not a secret, but it
// goes here because it changes with the project. If it's wrong, the device refuses to connect,
// which is what we want.
static const char SUPABASE_ROOT_CA[] = R"PEM(
-----BEGIN CERTIFICATE-----
paste the root certificate here
-----END CERTIFICATE-----
)PEM";
