import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { validateAiFindings } from "../src/lib/website-intelligence/ai.ts";
import { applyFindingReview } from "../src/lib/website-intelligence/finding-review.ts";

const context = { contextType:"unverified_candidate_guidance", evidenceAuthority:"original_chunks_only", items:[] };
function candidate(evidence, summary, category, key, status="inferred") {
  return {category,key,sourceId:"s",evidence,value:{summary,details:[]},observationStatus:status,confidence:"high"};
}
function check(row, pageType="about", productNames=[]) {
  const source={id:"s",url:"https://example.test/page",pageType,text:row.evidence,contentHash:"h",productNames,evidenceChunks:[{id:"c",text:row.evidence}]};
  const task={brand:"brand_voice",voice:"brand_voice",products:"products_commercial",audience:"audience_problems",problems:"audience_problems"}[row.category];
  return validateAiFindings({findings:[row]},[source],task,context)[0];
}
for (const group of ["טבעוניים", "צמחוניים", "נמנעים מגלוטן", "קהילת הצליאק", "vegan consumers"]) {
  test("a dietary audience needs its own cited premise: "+group,()=>{
    const text="אנחנו רוצים שאנשים יתאהבו בבישול הביתי ויכינו אוכל טעים בקלות.";
    assert.throws(()=>check(candidate(text,"קהל של "+group,"audience","audience_likely")),/unsupported_claim_expansion/);
  });
}
test("an explicitly addressed dietary audience remains observed",()=>{
  const text="הקהל שלנו כולל טבעוניים וצמחוניים.";
  const result=check(candidate(text,text,"audience","audience_likely"));
  assert.equal(result.key,"audience_explicit"); assert.equal(result.observationStatus,"observed");
});
test("product suitability may ground a narrow inference, not an observed or diagnosed audience",()=>{
  const text="Our products are gluten-free.";
  assert.equal(check(candidate(text,"צרכנים המחפשים מוצרים ללא גלוטן","audience","audience_likely")).observationStatus,"inferred");
  assert.throws(()=>check(candidate(text,"צרכנים המחפשים מוצרים ללא גלוטן","audience","audience_explicit","observed")),/unsupported_explicit_audience/);
  assert.throws(()=>check(candidate(text,"קהילת הצליאק","audience","audience_likely")),/unsupported_claim_expansion/);
});
for (const summary of ["רצון לפתרון שמקצר את הבישול.","Want easier meals that save time.","Want easy daily cooking for beginners."]) {
  test("ease does not entail added time, frequency or experience qualifiers: "+summary,()=>{
    assert.throws(()=>check(candidate("Our spice mixes make cooking simple and easy.",summary,"problems","desired_outcomes")),/unsupported_claim_expansion/);
  });
}
test("explicit faster/easier language supports a narrowly inferred need",()=>{
  const text="Our spice mixes make cooking faster and easier.";
  assert.equal(check(candidate(text,"רצון לבישול קל ומהיר.","problems","desired_outcomes")).observationStatus,"inferred");
});
test("a complete unsupported trailing sentence can be dropped without altering the source",()=>{
  const text="Our spice mixes make cooking simple and easy.";
  const original=candidate(text,"רצון לבישול פשוט וקל. זה חוסך זמן.","problems","desired_outcomes");
  const result=check(original);
  assert.equal(result.value.summary,"רצון לבישול פשוט וקל.");
  assert.equal(result.evidence,text);assert.equal(result.locator,"chunk:c");
  assert.equal(original.value.summary,"רצון לבישול פשוט וקל. זה חוסך זמן.");
});
test("unsupported qualifiers within one sentence cannot be guessed away",()=>{
  assert.throws(()=>check(candidate("Our spice mixes make cooking easier.","Want easier cooking, which saves time.","problems","desired_outcomes")),/unsupported_claim_expansion/);
});
for (const text of ["The bundle contains nine spice mixes and recipe cards.","בקופסה יש תשעה תערובות קבועות (לא ניתן להחליף את תכולת המארז).", "Available in sizes small and large."]) {
  test("contents and variants are not product taxonomy: "+text,()=>{
    assert.throws(()=>check(candidate(text,text,"products","categories","observed"),"category"),/unsupported_category_taxonomy/);
  });
}
test("genuine taxonomy and category headings retain their supported type",()=>{
  for(const text of ["Product categories: spice mixes, spreads and gift boxes.","תערובות תבלינים"]){
    assert.equal(check(candidate(text,text,"products","categories","observed"),"category").key,"categories");
  }
  assert.throws(()=>check(candidate("Nir Mix 25g","Nir Mix 25g","products","categories","observed"),"category",["Nir Mix 25g"]),/product_as_category/);
});
for (const key of ["benefits","desired_outcomes","pain_points_likely"]) {
  test("storage directions cannot become product benefits, pains or desires: "+key,()=>{
    const text="ככל שתראו את התבלינים והם יהיו נגישים לכם – ככה יש סיכוי טוב יותר שתשתמשו בהם.";
    assert.throws(()=>check(candidate(text,"נגישות התבלינים מגבירה את השימוש בהם.",key==="benefits"?"products":"problems",key)),/unsupported_semantic_type/);
  });
}
test("composition is not a benefit; directly stated taste benefit remains valid",()=>{
  assert.throws(()=>check(candidate("Made from stainless steel.","Made from stainless steel.","products","benefits","observed"),"product"),/unsupported_semantic_type/);
  assert.equal(check(candidate("יש בה מעט מרכיבים אבל עושר של טעמים.","יש בה מעט מרכיבים אבל עושר של טעמים.","products","benefits","observed"),"product").observationStatus,"observed");
});
test("tone is constrained to the cited excerpt, not practical instruction or site-wide recurrence",()=>{
  const text="לשאלות נוספות ניתן לפנות אלינו ב- support@example.test :)";
  assert.throws(()=>check(candidate(text,"טון ידידותי ושירותי עם הנחיות מעשיות.","voice","tone")),/unsupported_voice_quality/);
  assert.throws(()=>check(candidate(text,"השפה באתר נוהגת בטון ידידותי.","voice","tone")),/unsupported_interpretation_scope/);
  assert.equal(check(candidate(text,"בקטע המצוטט הטון ידידותי ושירותי.","voice","tone")).observationStatus,"inferred");
});
test("a favorable model decision cannot override deterministic material-wording checks",()=>{
  const row={...candidate("Easy cooking.","Faster cooking.","products","benefits"),sourceType:"ai"};
  const result=applyFindingReview([row],{decisions:[{index:0,approved:true,reason:"supported"}]});
  assert.equal(result.findings.length,0);assert.equal(result.rejected[0].reason,"unsupported_claim_expansion");
});
test("all five release-gate failures are rejected from immutable saved evidence",{skip:!fs.existsSync(".tmp/epic2-release-gate-20261005/ayelet-full-run.json")||!fs.existsSync(".tmp/epic2-release-gate-20261005/spicehaus-regression.json")},()=>{
  const data=JSON.parse(fs.readFileSync(".tmp/epic2-release-gate-20261005/ayelet-full-run.json"));
  const bad=new Set(["82ded549-3f63-4e39-9cf6-6a425f21dff3","b16536a3-e073-4105-b9c8-46f514250d56","3369b634-0332-47ee-abb2-2795cee9d336","44b8d488-26c1-4646-b289-d8be1a374957"]);
  for(const f of data.findings.filter(f=>bad.has(f.id))){
    assert.throws(()=>check(candidate(f.evidence,f.value.summary,f.category,f.key,f.observation_status)),/unsupported_claim_expansion|unsupported_category_taxonomy|unsupported_semantic_type/);
  }
  const spice=JSON.parse(fs.readFileSync(".tmp/epic2-release-gate-20261005/spicehaus-regression.json"));
  const tone=spice.findings.find(f=>f.key==="tone");
  assert.throws(()=>check(candidate(tone.evidence,tone.value.summary,tone.category,tone.key,tone.observationStatus)),/unsupported_interpretation_scope|unsupported_voice_quality/);
});
