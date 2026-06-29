const crypto = require("crypto");

const appId = process.argv[2] || "app_private_beta";
const keyName = process.argv[3] || "Private beta key";
const environment = process.argv[4] || "production";
const rawKey = `osh_${environment.slice(0, 4)}_${crypto.randomBytes(24).toString("hex")}`;
const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");
const keyPrefix = `${rawKey.slice(0, 8)}...`;
const keyId = `key_${crypto.randomBytes(8).toString("hex")}`;

console.log("Raw API key. Show this once, then store it securely:");
console.log(rawKey);
console.log("");
console.log("Supabase SQL:");
console.log(`
insert into public.developer_apps (id, name, status)
values ('${escapeSql(appId)}', '${escapeSql(appId.replace(/_/g, " "))}', 'active')
on conflict (id) do update set updated_at = now();

insert into public.developer_api_keys (
  id, app_id, name, key_hash, key_prefix, environment, status
) values (
  '${keyId}',
  '${escapeSql(appId)}',
  '${escapeSql(keyName)}',
  '${keyHash}',
  '${keyPrefix}',
  '${escapeSql(environment)}',
  'active'
);
`.trim());
console.log("");
console.log("Env-only fallback:");
console.log(`OSHER_INFRA_API_KEY_HASHES=${keyHash}`);

function escapeSql(value) {
  return String(value).replace(/'/g, "''");
}
