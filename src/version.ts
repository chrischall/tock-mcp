// Single source of truth for the package version. release-please bumps the
// literal on the line below (registered in release-please-config.json
// extra-files); every other manifest is a JSON extra-file. Import VERSION
// wherever the version is needed rather than re-declaring it.
export const VERSION = '0.1.0'; // x-release-please-version
