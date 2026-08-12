set -e
S=/private/tmp/claude-502/-Users-ahmedamara-Dev-Sophia-2/639799c9-2f25-4edb-9506-714015ac52aa/scratchpad/preview
R="/Users/ahmedamara/Dev/Sophia 2/frontend"; D="/Users/ahmedamara/Dev/Sophia 2/scratchpad/site/families"
python3 - <<PY
import io,re
R="$R"; S="$S"
src=io.open(R+"/src/keel/pages/FamiliesPage.tsx",encoding="utf-8").read()
src=src.replace('import SEO from "../../components/SEO";','')
src=src.replace('import { LEGAL_ENTITY, organizationStructuredData } from "../../lib/legalEntity";',
 'const LEGAL_ENTITY={siteUrl:""}; const organizationStructuredData=()=>({});')
src=src.replace('import { PublicFooter, PublicHeader } from "../components/PublicHeader";',
 'const PublicHeader=(_:{audience?:string})=>null; const PublicFooter=()=>null;')
src=src.replace('import { ButtonLink } from "../components/ui/Button";','import { ButtonLink } from "'+R+'/src/keel/components/ui/Button";')
src=src.replace('import { Kicker, PriceCard, SectionTitle } from "../components/ui/Marketing";','import { Kicker, PriceCard, SectionTitle } from "'+R+'/src/keel/components/ui/Marketing";')
src=src.replace('import { t } from "../i18n/t";','import { t } from "./t-stub";')
src=re.sub(r'      <SEO[\s\S]*?/>\n','',src)
io.open(S+"/FamiliesPage.copy.tsx","w",encoding="utf-8").write(src)
PY
cd $S && npx vite build --logLevel warn >/dev/null
rm -rf "$D/_preview"; mkdir -p "$D/_preview"; cp -R $S/dist/* "$D/_preview"/
python3 -c "
import io; D='$D'
h=io.open(D+'/_preview/index.html',encoding='utf-8').read().replace('./assets/','./_preview/assets/')
io.open(D+'/apercu-page.html','w',encoding='utf-8').write(h)"
echo rebuilt
