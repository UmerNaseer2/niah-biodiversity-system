// Runs once before any test file. The tests act as a phone set to Los Angeles time, which is 15 or
// 16 hours behind the park (Sarawak, UTC+8). So a screen that used the phone's own clock instead
// of park time would show the wrong time or day and fail. It also means the tests give the same
// result on every laptop and in CI.
// Jest can't change the zone from inside a test file, as each file gets its own copy of
// process.env, so it's set here before the test workers start.
module.exports = () => {
  process.env.TZ = 'America/Los_Angeles';
};
