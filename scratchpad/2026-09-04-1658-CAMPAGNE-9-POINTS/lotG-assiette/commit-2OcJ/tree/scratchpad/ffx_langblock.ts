import { buildResponseLanguageBlock } from "../supabase/functions/_shared/keel/locale.ts";
for (const l of ["en-US","fr-FR","en-GB"]) {
  console.log(l, "len=", buildResponseLanguageBlock(l).length);
}
