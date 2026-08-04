const envText = await Deno.readTextFile("supabase/.env");
const env = Object.fromEntries(
  envText.split(/\n/).map((line) => line.match(/^([^#=]+)=(.*)$/)).filter((
    match,
  ): match is RegExpMatchArray => Boolean(match)).map((match) => [
    match[1].trim(),
    match[2].trim(),
  ]),
);
const key = env.edge_functions_anon_key;
if (!key) throw new Error("missing_edge_functions_anon_key");
const response = await fetch(
  "http://127.0.0.1:54321/functions/v1/test-send-message",
  {
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
    },
  },
);
console.log(response.status);
console.log((await response.text()).slice(0, 200));
