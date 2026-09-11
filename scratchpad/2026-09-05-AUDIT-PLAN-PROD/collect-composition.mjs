import {api,save} from './run.mjs';
const snapshot={at:new Date().toISOString()};
for(const table of ['food_composition_refs','food_composition_aliases']){
 const rows=[];for(let offset=0;offset<50000;offset+=1000){const r=await api(`/rest/v1/${table}?select=*&order=${table.endsWith('refs')?'slug':'alias'}.asc&limit=1000&offset=${offset}`);if(r.status!==200)throw Error(JSON.stringify(r));rows.push(...r.data);if(r.data.length<1000)break;}
 snapshot[table]=rows;
}
save('composition-snapshot.json',snapshot);console.log(Object.fromEntries(Object.entries(snapshot).map(([k,v])=>[k,Array.isArray(v)?v.length:v])));
