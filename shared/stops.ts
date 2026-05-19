// Bidirectional map between Trafiklab sams-id and the GTFS IDs surfaced by dim_active_stations.
// Kept solely for inbound URL-param normalization in YellowAlerts.tsx and Index.tsx,
// so legacy bookmarks like /delay-alerts?from=740001554&to=860000626 still resolve.
// Safe to delete once we're confident no sams-id bookmarks remain in the wild.

export const SAMS_TO_GTFS: Record<string, string> = {
  "740000003": "3",        // Malmö C
  "740001554": "1587",     // Malmö Triangeln
  "740001586": "1586",     // Malmö Hyllie
  "860000284": "25314",    // CPH Airport
  "860000322": "23657",    // Tårnby
  "860000501": "25313",    // Ørestad
  "860000626": "25315",    // København H
};

export const GTFS_TO_SAMS: Record<string, string> = Object.fromEntries(
  Object.entries(SAMS_TO_GTFS).map(([sams, gtfs]) => [gtfs, sams])
);
