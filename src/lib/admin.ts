// Single-owner internal-tools gate. The same id backs the digest_events read
// policy (migration 20260618_admin_reads_digest_events). If a second admin is
// ever needed, swap this constant + the RLS policy for a profiles.is_admin flag.
export const ADMIN_USER_ID = "70924f63-a550-49f1-b4d4-18b0497a6d5c";
