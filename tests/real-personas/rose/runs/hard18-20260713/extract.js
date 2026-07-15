const fs=require("fs");
const j=JSON.parse(fs.readFileSync(process.argv[2],"utf8"));
const r=j.response||{};
const t=j.conversation_turn_trace||{};
const tf=t.turn_frame||{};
const rd=t.route_decision||{};
const sk=t.skill_run||{};
const led=t.effect_ledger||{};
const c=led.counts||{};
const safety=tf.safety||{};
const nr=tf.needs_research;
const de=tf.direct_effects||[];
const cr=tf.conversation_risk||{};
const mp=tf.memory_plan||{};
const out={
 ok:j.ok, status:j.empty_response?"EMPTY":(j.aborted?"ABORTED":"ok"),
 owner:t.response_owner||rd.response_owner,
 handler:rd.selected_handler,
 reason:rd.reason_code,
 blocked_paths:rd.blocked_paths,
 direct_effects_to_run:rd.direct_effects_to_run,
 safety:{band:safety.risk_band,reasons:safety.reason_codes},
 conv_risk:{score:cr.score,prev:cr.previous_scores,exit:cr.should_exit_flows},
 needs_research: nr && (nr.required!==undefined||nr.needed!==undefined||typeof nr==="boolean") ? nr : (nr||null),
 skill:{id:sk.selected_skill_id,status:sk.status,reason:sk.reason_code,diagnosis:sk.diagnosis||null},
 direct_effects: de.map(e=>({type:e.type||e.tool||e.operation_type,intent:e.intent,status:e.status,target:e.target_item_id||e.plan_item_id||null,when:e.when_hint||e.date_hint||e.scheduled_for||null,technique:e.technique||e.card_type||null})),
 ledger_counts:{req:c.requested,allowed:c.allowed,blocked:c.blocked,committed:c.committed,superseded:c.superseded,failed:c.failed,proposed:c.proposed,cancelled:c.cancelled},
 ledger_entries:(led.entries||[]).map(e=>({op:e.operation_type,status:e.status,id:e.committed_id||e.id,label:e.local_label||null,reason:e.reason||e.block_reason||null})),
 response_intent:mp.response_intent,
 op_suggestion: tf.operation_suggestion||tf.pending_recommendation||null,
};
console.log("=== SOPHIA ===");
console.log(String(r.content??r.message??"").trim());
console.log("=== TRACE ===");
console.log(JSON.stringify(out,null,1));
