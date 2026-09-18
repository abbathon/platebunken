/**
 * Inspect and adjust the kiosk's Music Assistant user.
 *
 *   node --env-file=.env scripts/ma-user.ts                       # show user, tokens, players
 *   node --env-file=.env scripts/ma-user.ts --players A,B,C       # restrict to these players
 *   node --env-file=.env scripts/ma-user.ts --players all         # clear the restriction
 *   node --env-file=.env scripts/ma-user.ts --revoke <token_id>   # revoke a long-lived token
 *
 * `player_filter` is enforced by Music Assistant itself, so it holds even if this app has
 * a bug. MA's web UI does not expose it — this is the only way to set it.
 *
 * Changing the filter needs an admin token. Set MA_ADMIN_TOKEN to use one just for this
 * command, so the kiosk's own credential stays unable to widen its own access.
 */
import { MassClient } from "../src/ma/client.ts";

const arg = (flag: string) => {
  const i = process.argv.indexOf(flag);
  return i === -1 ? undefined : process.argv[i + 1];
};
const players = arg("--players");
const revoke = arg("--revoke");
const writing = players !== undefined || revoke !== undefined;

const token = (writing && process.env.MA_ADMIN_TOKEN) || process.env.MA_TOKEN;
if (!token) { console.error("No MA_TOKEN in the environment."); process.exit(1); }

const client = new MassClient({
  baseUrl: `http://${process.env.MA_HOST}:${process.env.MA_PORT ?? 8095}`,
  token,
});
await client.connect();

const me = await client.command<any>("auth/me");
console.log(`\nuser      ${me.username}  (role: ${me.role})`);
console.log(`player_filter    ${me.player_filter?.length ? me.player_filter.join(", ") : "— none: every speaker is reachable —"}`);
console.log(`provider_filter  ${me.provider_filter?.length ? me.provider_filter.join(", ") : "— none —"}`);

if (revoke) {
  await client.command("auth/token/revoke", { token_id: revoke });
  console.log(`\nrevoked ${revoke}`);
} else if (players !== undefined) {
  const player_filter = players === "all" ? [] : players.split(",").map((s) => s.trim()).filter(Boolean);
  await client.command("auth/user/update", { user_id: me.user_id, player_filter });
  console.log(`\nplayer_filter → ${player_filter.length ? player_filter.join(", ") : "cleared"}`);
} else {
  const tokens = await client.command<any[]>("auth/tokens", {}).catch(() => []);
  if (tokens.length) {
    console.log(`\nlong-lived tokens for this user`);
    for (const t of tokens) {
      // expires_at is an ISO string, not an epoch.
      const exp = t.expires_at ? String(t.expires_at).slice(0, 10) : "?";
      const used = t.last_used_at ? String(t.last_used_at).slice(0, 10) : "never used";
      console.log(`  ${t.token_id}  ${String(t.name ?? "").padEnd(22)} expires ${exp}  (${used})`);
    }
  }
  console.log(`\nplayers this token can see`);
  for (const p of client.players.filter((p) => p.available)) {
    console.log(`  ${p.player_id.padEnd(38)} ${p.name}`);
  }
  console.log(`\n(pass --players <ids|all> to change the restriction; needs MA_ADMIN_TOKEN)`);
}

client.close();
process.exit(0);
