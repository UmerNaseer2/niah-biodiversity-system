// The parts of the sensor pages that are safe for the browser: the rows, the words for each alert,
// and the checks on what an admin types. Nothing here reads the clock or the database.

import { plural } from "./format";

export type AlertSeverity = "urgent" | "routine";
export type AlertStatus = "open" | "acknowledged" | "resolved";
export type AlertKind =
  | "disturbance"
  | "movement"
  | "soil_dry"
  | "soil_wet"
  | "too_hot"
  | "too_cold"
  | "battery_low"
  | "quiet";

export type SensorAlert = {
  id: number;
  nodeId: string;
  nodeName: string;
  kind: AlertKind;
  severity: AlertSeverity;
  status: AlertStatus;
  readingField: string | null;
  readingValue: number | null;
  limitValue: number | null;
  firstSeenAt: string;
  lastSeenAt: string;
  repeatCount: number;
  acknowledgedAt: string | null;
  acknowledgedByName: string | null;
  resolvedAt: string | null;
  resolvedByName: string | null;
  closedByItself: boolean;
};

export type NodeStatus = {
  nodeId: string;
  name: string;
  zone: string;
  edgeDeviceId: string | null;
  lastReadingAt: string | null;
  temperatureC: number | null;
  humidityPercent: number | null;
  soilMoisturePercent: number | null;
  rainPercent: number | null;
  batteryPercent: number | null;
  tiltDegrees: number | null;
  motionDetected: boolean | null;
  quiet: boolean;
};

export type AlertLimits = {
  tiltDegreesMax: number;
  shockGMax: number;
  distanceChangeCmMax: number;
  soilMoistureMin: number;
  soilMoistureMax: number;
  temperatureMinC: number;
  temperatureMaxC: number;
  batteryMinPercent: number;
  quietMinutes: number;
  reraiseMinutes: number;
};

export type HistoryReading = {
  recordedAt: string;
  temperatureC: number | null;
  soilMoisturePercent: number | null;
};

// The columns the pages read. iot_nodes also has old columns that 002 filled with made up numbers,
// and iot_readings has the GPS columns, so neither gets a select("*").
export const NODE_COLUMNS =
  "node_id, name, zone, edge_device_id, last_reading_at, temperature_c, humidity_percent, soil_moisture_percent, rain_percent, battery_percent, tilt_degrees, motion_detected, quiet";
export const ALERT_COLUMNS =
  "id, node_id, node_name, kind, severity, status, reading_field, reading_value, limit_value, first_seen_at, last_seen_at, repeat_count, acknowledged_at, acknowledged_by_name, resolved_at, resolved_by_name, closed_by_itself";
export const HISTORY_COLUMNS = "recorded_at, temperature_c, soil_moisture_percent";

type Row = Record<string, unknown>;

/** Postgres numerics can arrive as strings, and a value a sensor didn't send is null */
function numberOrNull(value: unknown) {
  return value === null || value === undefined ? null : Number(value);
}

function textOrNull(value: unknown) {
  return typeof value === "string" ? value : null;
}

export function alertFromRow(row: Row): SensorAlert {
  return {
    id: Number(row.id),
    nodeId: String(row.node_id),
    nodeName: String(row.node_name ?? ""),
    kind: row.kind as AlertKind,
    severity: row.severity as AlertSeverity,
    status: row.status as AlertStatus,
    readingField: textOrNull(row.reading_field),
    readingValue: numberOrNull(row.reading_value),
    limitValue: numberOrNull(row.limit_value),
    firstSeenAt: String(row.first_seen_at),
    lastSeenAt: String(row.last_seen_at),
    repeatCount: Number(row.repeat_count),
    acknowledgedAt: textOrNull(row.acknowledged_at),
    acknowledgedByName: textOrNull(row.acknowledged_by_name),
    resolvedAt: textOrNull(row.resolved_at),
    resolvedByName: textOrNull(row.resolved_by_name),
    closedByItself: row.closed_by_itself === true,
  };
}

export function nodeFromRow(row: Row): NodeStatus {
  return {
    nodeId: String(row.node_id),
    name: String(row.name ?? ""),
    zone: String(row.zone ?? ""),
    edgeDeviceId: textOrNull(row.edge_device_id),
    lastReadingAt: textOrNull(row.last_reading_at),
    temperatureC: numberOrNull(row.temperature_c),
    humidityPercent: numberOrNull(row.humidity_percent),
    soilMoisturePercent: numberOrNull(row.soil_moisture_percent),
    rainPercent: numberOrNull(row.rain_percent),
    batteryPercent: numberOrNull(row.battery_percent),
    tiltDegrees: numberOrNull(row.tilt_degrees),
    motionDetected: typeof row.motion_detected === "boolean" ? row.motion_detected : null,
    quiet: row.quiet === true,
  };
}

export function limitsFromRow(row: Row): AlertLimits {
  return {
    tiltDegreesMax: Number(row.tilt_degrees_max),
    shockGMax: Number(row.shock_g_max),
    distanceChangeCmMax: Number(row.distance_change_cm_max),
    soilMoistureMin: Number(row.soil_moisture_min),
    soilMoistureMax: Number(row.soil_moisture_max),
    temperatureMinC: Number(row.temperature_min_c),
    temperatureMaxC: Number(row.temperature_max_c),
    batteryMinPercent: Number(row.battery_min_percent),
    quietMinutes: Number(row.quiet_minutes),
    reraiseMinutes: Number(row.reraise_minutes),
  };
}

export function historyFromRow(row: Row): HistoryReading {
  return {
    recordedAt: String(row.recorded_at),
    temperatureC: numberOrNull(row.temperature_c),
    soilMoisturePercent: numberOrNull(row.soil_moisture_percent),
  };
}

/** Urgent first, then the newest. Acknowledged ones go below the ones nobody has picked up yet. */
export function alertOrder(a: SensorAlert, b: SensorAlert) {
  return (
    Number(a.status === "acknowledged") - Number(b.status === "acknowledged") ||
    Number(b.severity === "urgent") - Number(a.severity === "urgent") ||
    b.lastSeenAt.localeCompare(a.lastSeenAt)
  );
}

// What officers read. Each one says what it means and what to do about it, because the people using
// this page aren't the people who built the sensors.
export const ALERT_WORDS: Record<AlertKind, { title: string; means: string; todo: string }> = {
  disturbance: {
    title: "Possible disturbance",
    means:
      "This node was tilted, knocked or shifted. Something may have hit it, or someone may be cutting or digging near the plant.",
    todo: "Ask the patrol team to check the plant and the node as soon as they can. If it was only knocked, set it straight, then resolve this.",
  },
  movement: {
    title: "Movement near a plant",
    means: "The motion sensor saw something near this plant. It could be a person or an animal.",
    todo: "Check if anyone is meant to be there today. If this keeps coming back, ask the patrol team to take a look.",
  },
  soil_dry: {
    title: "Soil is very dry",
    means:
      "The soil here is drier than the limit. The plant may be short of water, or the probe may have come loose.",
    todo: "Check the probe at the next visit. If the soil really is that dry, tell the botanist who looks after this plot.",
  },
  soil_wet: {
    title: "Soil is very wet",
    means: "The soil here is wetter than the limit. That could be heavy rain or flooding.",
    todo: "Look at the rain reading on this node. If it hasn’t rained, check the probe at the next visit.",
  },
  too_hot: {
    title: "Too hot",
    means:
      "The temperature here is over the limit. That could be a long dry spell, a fire nearby, or a sensor sitting in direct sun.",
    todo: "Compare it with the other nodes. If they’re hot too, ask the patrol team to look for smoke or fire.",
  },
  too_cold: {
    title: "Too cold",
    means: "The temperature here is under the limit. That’s unusual at Niah, so the sensor may be faulty.",
    todo: "Compare it with the other nodes. If only this one reads low, check the sensor at the next visit.",
  },
  battery_low: {
    title: "Battery low",
    means: "This node’s battery is running out, and it’ll stop sending when it’s flat.",
    todo: "Charge or swap the battery at the next visit.",
  },
  quiet: {
    title: "Node has gone quiet",
    means:
      "Nothing has come in from this node. Its battery may be flat, the WiFi may be down, or it may have been damaged or taken.",
    todo: "See if other nodes on the same edge device are quiet too. If they are, check the edge device and the router. If it’s only this one, send someone to look. This closes by itself when readings come back.",
  },
};

const READING_FIELDS: Record<string, { label: string; unit: string }> = {
  tilt_degrees: { label: "Tilt", unit: "°" },
  shock_g: { label: "Shock", unit: " g" },
  distance_change_cm: { label: "Distance change", unit: " cm" },
  soil_moisture_percent: { label: "Soil moisture", unit: "%" },
  temperature_c: { label: "Temperature", unit: " °C" },
  battery_percent: { label: "Battery", unit: "%" },
};

/** 12.5, not 12.50 */
export function shortNumber(value: number) {
  return String(Math.round(value * 10) / 10);
}

/** "Tilt 45° (limit 30°)", or null when the alert has no number to show */
export function alertReading(alert: SensorAlert) {
  const { readingField, readingValue, limitValue } = alert;
  if (readingValue === null) return null;
  if (readingField === "quiet_minutes") {
    return `Quiet for ${plural(Math.round(readingValue), "minute")} when this came up${
      limitValue === null ? "" : ` (limit ${plural(limitValue, "minute")})`
    }`;
  }
  const field = readingField ? READING_FIELDS[readingField] : undefined;
  if (!field) return null;
  const limit = limitValue === null ? "" : ` (limit ${shortNumber(limitValue)}${field.unit})`;
  return `${field.label} ${shortNumber(readingValue)}${field.unit}${limit}`;
}

/** "less than a minute ago", "20 minutes ago", "3 hours ago", "2 days ago" */
export function ageInWords(iso: string, nowMs: number) {
  const minutes = Math.floor((nowMs - Date.parse(iso)) / 60000);
  if (minutes < 1) return "less than a minute ago";
  if (minutes < 60) return `${plural(minutes, "minute")} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${plural(hours, "hour")} ago`;
  return `${plural(Math.floor(hours / 24), "day")} ago`;
}

type Checked<T> = { ok: true; value: T } | { ok: false; message: string };

const DEVICE_ID = /^[A-Za-z0-9-]{3,40}$/;
const MAX_NAME = 80;

function tidied(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

export function checkAlertId(input: unknown): Checked<number> {
  if (typeof input !== "number" || !Number.isSafeInteger(input) || input < 1) {
    return { ok: false, message: "That isn’t an alert the database knows." };
  }
  return { ok: true, value: input };
}

export function checkDeviceId(input: unknown): Checked<string> {
  const id = tidied(input);
  if (!DEVICE_ID.test(id)) {
    return {
      ok: false,
      message: "An ID is 3 to 40 letters, numbers or hyphens, like NNP-EDGE-01.",
    };
  }
  return { ok: true, value: id };
}

export type NewDevice = { deviceId: string; name: string; zone: string };

export function checkNewDevice(input: unknown): Checked<NewDevice> {
  const raw = (input ?? {}) as Record<string, unknown>;
  const id = checkDeviceId(raw.deviceId);
  if (!id.ok) return id;
  const name = tidied(raw.name);
  const zone = tidied(raw.zone);
  if (!name) return { ok: false, message: "Enter a name, like Niah north edge device." };
  if (name.length > MAX_NAME || zone.length > MAX_NAME) {
    return { ok: false, message: `Names and zones can be up to ${MAX_NAME} characters.` };
  }
  return { ok: true, value: { deviceId: id.value, name, zone } };
}

export type DeviceSwitch = { deviceId: string; enabled: boolean };

export function checkDeviceSwitch(input: unknown): Checked<DeviceSwitch> {
  const raw = (input ?? {}) as Record<string, unknown>;
  const id = checkDeviceId(raw.deviceId);
  if (!id.ok) return id;
  if (typeof raw.enabled !== "boolean") {
    return { ok: false, message: "Reload the page, then try again." };
  }
  return { ok: true, value: { deviceId: id.value, enabled: raw.enabled } };
}

export type NewNode = { nodeId: string; name: string; zone: string; deviceId: string | null };

export function checkNewNode(input: unknown): Checked<NewNode> {
  const raw = (input ?? {}) as Record<string, unknown>;
  const id = checkDeviceId(raw.nodeId);
  if (!id.ok) return { ok: false, message: id.message.replace("NNP-EDGE-01", "NNP-IOT-04") };
  const name = tidied(raw.name);
  const zone = tidied(raw.zone);
  if (!name) return { ok: false, message: "Enter a name for the node." };
  if (!zone) return { ok: false, message: "Enter the zone it’s in." };
  if (name.length > MAX_NAME || zone.length > MAX_NAME) {
    return { ok: false, message: `Names and zones can be up to ${MAX_NAME} characters.` };
  }
  const device = checkNodeDevice(raw.deviceId);
  if (!device.ok) return device;
  return { ok: true, value: { nodeId: id.value, name, zone, deviceId: device.value } };
}

function checkNodeDevice(input: unknown): Checked<string | null> {
  if (input === null || input === "") return { ok: true, value: null };
  const id = checkDeviceId(input);
  return id.ok ? id : { ok: false, message: "Reload the page, then choose the device again." };
}

export type NodeLink = { nodeId: string; deviceId: string | null };

export function checkNodeLink(input: unknown): Checked<NodeLink> {
  const raw = (input ?? {}) as Record<string, unknown>;
  const id = checkDeviceId(raw.nodeId);
  if (!id.ok) return { ok: false, message: "Reload the page, then try again." };
  const device = checkNodeDevice(raw.deviceId);
  if (!device.ok) return device;
  return { ok: true, value: { nodeId: id.value, deviceId: device.value } };
}
