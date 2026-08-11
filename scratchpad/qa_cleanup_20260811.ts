import { cleanup } from "../docs/nutrition-pivot/qa-web/harness.ts";
const ids = ["e09408ae-b812-4d9a-b6c5-4920877457be","156225e5-d9f7-4251-97ab-a8fceb9b52bd","7705d7c0-2992-43a5-a704-507bb96b7edd","fc1cc080-1144-42e5-a746-5a242db99c5e","19ad3a67-7d13-44a6-b976-e1ad967df9d1","1dfee74a-4ddc-4fec-bf55-497b4eb70d0c","b9d29af6-afa8-4fa4-8a3f-9a1791bda2ed","cb5755fc-2b7a-4fc5-a387-423c2c0f1c35","75e7f162-7cd2-4df1-8546-302b50258619","90c6dae2-4aa6-4e78-8f23-1a87f6b540de","59c97402-a183-461f-ba02-baf3f70769a7","2552604a-4c58-46dd-8942-f1804943881f","9efeb88d-f5ca-4888-ab2c-646500f5558b","9706d186-e109-4686-9d07-47ae9aacd3ed"];
for (const id of ids) { try { await cleanup(id); } catch (e) { console.log(`${id}: ${e}`); } }
console.log("nettoyage termine");
