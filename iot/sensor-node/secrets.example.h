// Copy this to secrets.h, which git ignores, and fill it in. Never commit secrets.h.

// The AP router for this forest region
#define WIFI_SSID     "your-router-name"
#define WIFI_PASSWORD "your-router-password"

// This node's ID. It has to be on the Devices page, linked to this region's edge device.
#define NODE_ID "NNP-IOT-01"

// Where the edge device listens. It prints its address on the Serial Monitor when it starts. Give
// it a fixed address on the router, so this doesn't change.
#define EDGE_URL "http://192.168.1.50/reading"

// Has to match NODE_SECRET on this region's edge device. Make up a long random string for each
// region. This isn't the device token. Nodes never get that.
#define NODE_SECRET "make-up-a-long-random-string"
