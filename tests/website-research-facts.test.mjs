import test from "node:test";
import assert from "node:assert/strict";
import { assembleResearchChunks } from "../src/lib/website-intelligence/research-chunks.ts";
import { assembleAtomicResearchFacts, sensitiveResearchRewrite, strategicResearchChunks } from "../src/lib/website-intelligence/research-facts.ts";
import { validateResearchMap } from "../src/lib/website-intelligence/research-map.ts";
const source = (extra={}) => ({id:"s1",url:"https://example.test/shipping",pageType:"shipping",status:"completed",text:"נקודת איסוף חינם מעל 150 שקלים. משלוח לבית חינם מעל 300 שקלים. זמן משוער 3–7 ימי עסקים, למעט חגים. מבצע בדצמבר 2025 בלבד, לאחר הנחות ולפני משלוח.",...extra});
test("deterministic policy clauses retain separate methods, exact thresholds, dates and exceptions",()=>{
  const corpus=assembleResearchChunks([source()]);
  const facts=assembleAtomicResearchFacts(corpus.chunks);
  assert.equal(facts.length,4);
  assert.equal(facts[0].rawValue,"נקודת איסוף חינם מעל 150 שקלים.");
  assert.equal(facts[1].rawValue,"משלוח לבית חינם מעל 300 שקלים.");
  assert.ok(facts[2].rawValue.includes("משוער"));assert.ok(facts[2].rawValue.includes("למעט חגים"));
  assert.ok(facts[3].rawValue.includes("2025"));assert.ok(facts[3].rawValue.includes("לאחר הנחות ולפני משלוח"));
  for(const fact of facts){
    const chunk=corpus.chunks.find(c=>c.id===fact.chunkId);
    assert.equal(chunk.text.slice(fact.location.start,fact.location.end).trim(),fact.rawValue);
    assert.equal(fact.qualifierResolution,"unresolved");assert.equal(fact.sourceLocations[0].sourceId,"s1");
    assert.ok(fact.contextChunkIds.includes(fact.chunkId));
  }
});
test("operational facts cannot bypass deterministic route by relabeling as use cases or business description",()=>{
  for(const [category,claim]of [["use_cases","ניתן לתזמן משלוחים עד 30 ימים מראש"],["brand_business","ניתן לממש החל ממינימום 100 נקודות"],["products_groups","בקבוק של 200 מ״ל"],["use_cases","אפשרות איסוף עצמי בתיאום מראש"],["customer_pains_needs_desires","תערובות שמתחייבות לשדרוג מהיר"]])assert.equal(sensitiveResearchRewrite(category,claim),true);
  assert.equal(sensitiveResearchRewrite("positioning","פתרון נוח לאירוח ביתי"),false);
  assert.equal(sensitiveResearchRewrite("brand_business","הוקם ב-2014"),false);
});
test("commercial structure and conflicting inventory signals are retained without claiming live stock",()=>{
  const chunks=assembleResearchChunks([source({pageType:"product",url:"https://example.test/products/kit",text:"Cocktail kit",extracted:{htmlProduct:{name:"Cocktail kit",price:"149",currency:"ILS"},inventory:{conflict:true,signals:[{source:"json_ld",value:"in_stock"},{source:"visible",value:"out_of_stock"}]}}})]).chunks;
  const facts=assembleAtomicResearchFacts(chunks);
  assert.ok(facts.some(f=>f.rawValue.includes('"price":"149"')));
  assert.ok(facts.some(f=>f.rawValue.includes('"conflict":true')&&f.rawValue.includes('"out_of_stock"')&&f.rawValue.includes('"in_stock"')));
  assert.ok(facts.every(f=>f.interpretation==="source_statement_not_verified_truth"));
});
test("legal boilerplate stays out of strategic research, while about and practical benefits remain",()=>{
  const chunks=assembleResearchChunks([source({url:"https://example.test/terms",text:"Privacy policy: we may send marketing messages. Copyright."}),source({id:"s2",url:"https://example.test/about",pageType:"about",text:"We make spice mixes that save preparation time and make cooking easier."})]).chunks;
  assert.equal(strategicResearchChunks(chunks).length,1);
  assert.ok(assembleAtomicResearchFacts(chunks).some(f=>f.rawValue.includes("Privacy")));
});
test("strategic pain, positioning and messaging are hypotheses even when model calls them observations",()=>{
  const chunks=assembleResearchChunks([source({pageType:"about",url:"https://example.test/about",text:"Our spice mixes help people prepare dinner quickly and confidently."})]).chunks;
  for(const category of ["positioning","customer_pains_needs_desires","recurring_messaging"]){
    const item={category,classification:"observed_pattern",summary:"אפשרות לחיסכון בזמן בישול",chunkIds:[chunks[0].id],uncertainty:"",qualifiers:[],evidence:[{chunkId:chunks[0].id,quote:chunks[0].text}]};
    const result=validateResearchMap({items:[item]},chunks)[0];
    assert.equal(result.classification,"inferred_hypothesis");assert.ok(result.uncertainty.includes("אישור לקוח"));
  }
});
