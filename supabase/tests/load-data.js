// A lot of made up data on top of the stand-in's, to see how the website copes with a park's worth
// of records and weeks of sensor readings. The stand-in adds it when STAND_IN_LOAD_RECORDS is set
// (docs/test-results/item-37-performance.md says how we used it). Everything is made up and
// marked "Load test", like the rest of the stand-in's data. Never run it on a real project.

/** Where the made up plants go: a box around park HQ and the boardwalk, like the sample points */
const BOX = { lat: 3.805, lng: 113.765, latSpan: 0.025, lngSpan: 0.03 };

/**
 * Adds `records` plant records spread over the last `recordDays` days, and a reading a minute from
 * every sensor node for the `readingDays` days before the stand-in's own day of readings. The
 * records are mostly published, with some waiting and some rejected, across every species, and a
 * few have no species. The readings come from `deviceId`, which has to be there already.
 *
 * Both go in with one statement each, so 10,000 records and 30 days take a few seconds.
 */
export async function addLoadData(
  db,
  { records = 10000, recordDays = 365, readingDays = 30, deviceId = 'NNP-EDGE-01' } = {},
) {
  if (records > 0) {
    await db.query(
      `INSERT INTO public.records (id, species_slug, species_name, common_name, height_m,
         condition, gps, notes, recorded_by, recorded_at, status, review_notes, uploaded_at)
       SELECT
         -- The tag code is the first 6 characters of the ID, so random IDs would give the same
         -- code twice somewhere in 10,000 records, which the server turns down (005). These start
         -- A00001, A00002 and so on, which no other stand-in record does.
         (lpad(to_hex(${0xa00000} + i), 6, '0') || substr(md5('load test ' || i), 7))::uuid,
         s.id,
         coalesce(s.scientific_name, 'Ficus sp.'),
         coalesce(s.common_names[1], 'Strangler fig'),
         CASE WHEN i % 9 = 0 THEN NULL ELSE round((0.5 + (i * 7919 % 400) / 10.0)::numeric, 1) END,
         (ARRAY['healthy', 'healthy', 'healthy', 'healthy', 'damaged', 'diseased', 'dead'])[1 + i % 7],
         jsonb_build_object(
           'lat', round((${BOX.lat} + (i * 37 % 1000) * ${BOX.latSpan} / 1000.0)::numeric, 6),
           'lng', round((${BOX.lng} + (i * 53 % 1000) * ${BOX.lngSpan} / 1000.0)::numeric, 6),
           'accuracyM', 3 + i % 12),
         CASE i % 4
           WHEN 0 THEN 'Load test. Next to the Pangkalan Lubang boardwalk.'
           WHEN 1 THEN 'Load test. On the path up to the Great Cave.'
           WHEN 2 THEN 'Load test. Below the Bukit Kasut ridge.'
           ELSE 'Load test.'
         END,
         'Load test',
         t.at,
         CASE WHEN i % 25 = 0 THEN 'waiting' WHEN i % 40 = 1 THEN 'rejected' ELSE 'published' END,
         CASE WHEN i % 40 = 1 THEN 'Made up for the load test.' END,
         t.at + interval '2 hours'
       FROM generate_series(1, least($1::integer, ${0xfffff})) AS i
       CROSS JOIN LATERAL (
         SELECT now() - make_interval(secs => (i::double precision / $1) * $2 * 86400) AS at
       ) AS t
       -- Every 13th record has no species yet. The rest go round the species in turn.
       LEFT JOIN LATERAL (
         SELECT id, scientific_name, common_names
         FROM public.species
         WHERE i % 13 <> 0
         ORDER BY id
         OFFSET i % (SELECT count(*) FROM public.species)
         LIMIT 1
       ) AS s ON true`,
      [records, recordDays],
    );
  }

  if (readingDays > 0) {
    // From readingDays + 1 days ago up to a day ago, so the stand-in's own day of readings (with
    // its alerts and the node that goes quiet) stays the newest. inserted_at goes with recorded_at,
    // so the limit from 022 only counts the stand-in's own readings in the last hour.
    await db.query(
      `INSERT INTO public.iot_readings (device_id, node_id, boot_id, seq, recorded_at, ts_source,
         received_at, inserted_at, temp_c, hum_pct, soil_raw, rain_raw, dist_cm, baseline_cm,
         beep_on, rssi, motion)
       SELECT
         $1, n.node_id, 7 + n.k, m, t.at, 'device', t.at + interval '1 second',
         t.at + interval '2 seconds',
         round((26.5 + 3.5 * sin(2 * pi() * (t.hour - 9) / 24) + (m * 31 % 10) / 10.0 - 0.5)::numeric, 1),
         round(86 - 9 * sin(2 * pi() * (t.hour - 9) / 24) + (m * 17 % 5) - 2),
         2500 + n.k * 150 + (m * 13 % 80) - 40,
         CASE WHEN t.hour >= 15 AND t.hour < 16 THEN 2900 ELSE 4095 END,
         120 - n.k * 10 + (m * 7 % 10) / 10.0,
         120 - n.k * 10,
         false,
         -64 + (m * 11 % 12) - 6,
         m % 97 = 0
       FROM (SELECT node_id, row_number() OVER (ORDER BY node_id) - 1 AS k FROM public.iot_nodes) AS n
       CROSS JOIN generate_series(1, $2::integer * 1440) AS m
       CROSS JOIN LATERAL (
         SELECT now() - interval '1 day' - make_interval(mins => $2::integer * 1440 - m) AS at
       ) AS r
       CROSS JOIN LATERAL (
         SELECT r.at,
           extract(hour FROM r.at AT TIME ZONE 'Asia/Kuala_Lumpur')
             + extract(minute FROM r.at AT TIME ZONE 'Asia/Kuala_Lumpur') / 60 AS hour
       ) AS t`,
      [deviceId, readingDays],
    );
  }

  // So the planner knows how big the tables are now, like autovacuum would do on hosted
  await db.exec('ANALYZE public.records; ANALYZE public.iot_readings;');
}
