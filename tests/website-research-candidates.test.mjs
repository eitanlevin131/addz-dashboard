import test from "node:test";
import assert from "node:assert/strict";
import { assembleResearchChunks } from "../src/lib/website-intelligence/research-chunks.ts";
import { prepareResearchCandidates } from "../src/lib/website-intelligence/research-candidates.ts";
import { aiInput, findingEvidenceChoices, materializeFindingEvidence, validateAiFindings } from "../src/lib/website-intelligence/ai.ts";
const source={id:"source",url:"https://example.test/about",pageType:"about",text:"Our spice mixes make cooking faster and easier.\n\nCustomers can prepare meals without long preparation.",status:"completed"};
const chunks=assembleResearchChunks([source],{chunkCharacters:70}).chunks;
const context={contextType:"unverified_candidate_guidance",evidenceAuthority:"original_chunks_only",items:[{category:"customer_pains_needs_desires",classification:"inferred_hypothesis",summary:"Desire for easy meals",chunkIds:chunks.map(c=>c.id),uncertainty:"Client confirmation required"}]};
test("research guides candidates but cannot be cited; full original chunk required",()=>{
  const prepared=prepareResearchCandidates("audience_problems",chunks,context.items);
  assert.equal(prepared.sources[0].evidenceChunks.length,2);
  assert.ok(aiInput("audience_problems",prepared.sources,prepared.context).includes("original_chunks_only"));
  const row={category:"problems",key:"desired_outcomes",value:{summary:"רצון לבישול קל ומהיר",details:[]},sourceId:"source",evidence:chunks[0].text,observationStatus:"inferred",confidence:"high"};
  const finding=validateAiFindings({findings:[row]},prepared.sources,"audience_problems",prepared.context)[0];
  assert.equal(finding.observationStatus,"inferred");assert.equal(finding.confidence,"medium");assert.ok(finding.locator.includes(chunks[0].id));
  assert.throws(()=>validateAiFindings({findings:[{...row,evidence:"Desire for easy meals"}]},prepared.sources,"audience_problems",prepared.context),/invalid_ai_evidence/);
  assert.throws(()=>validateAiFindings({findings:[{...row,key:"stated_problems",observationStatus:"observed",value:{summary:chunks[0].text,details:[]}}]},prepared.sources,"audience_problems",prepared.context),/unsupported_semantic_type/);
});
test("provider-selected evidence is materialized verbatim, never model rewritten",()=>{
  const prepared=prepareResearchCandidates("audience_problems",chunks,context.items);
  const choices=findingEvidenceChoices(prepared.sources);
  const result=materializeFindingEvidence({findings:[{evidenceRef:choices[0].id,category:"problems",key:"desired_outcomes"}]},prepared.sources);
  assert.equal(result.findings[0].evidence,choices[0].text);
  assert.equal(result.findings[0].sourceId,"source");
  assert.throws(()=>materializeFindingEvidence({findings:[{evidenceRef:"fake"}]},prepared.sources),/invalid_ai_evidence_reference/);
  for(const choice of choices)assert.ok(chunks.find(c=>c.id===choice.chunkId).text.includes(choice.text));
});
test("bounded evidence menu includes late sections rather than only first sentences",()=>{
  const text=Array.from({length:40},(_,n)=>`Useful complete sentence number ${n}.`).join(" ")+" We invite you to experiment with warm family cooking.";
  const choices=findingEvidenceChoices([{...source,contentHash:"hash",evidenceChunks:[{id:"long",text}]}]);
  assert.equal(choices.length,15);
  assert.ok(choices.some(c=>c.text.includes("warm family cooking")));
  assert.ok(choices.some(c=>c.text.includes("number 0")));
});
test("inferred keys retain interpretation even when provider marks them observed",()=>{
  const prepared=prepareResearchCandidates("audience_problems",chunks,context.items);
  const choices=findingEvidenceChoices(prepared.sources);
  const result=materializeFindingEvidence({findings:[{evidenceRef:choices[0].id,category:"voice",key:"tone",observationStatus:"observed",interpretation:"An approachable explanatory tone",confidence:"medium"}]},prepared.sources);
  assert.equal(result.findings[0].observationStatus,"inferred");
  assert.equal(result.findings[0].value.summary,"An approachable explanatory tone");
});
test("exact quote alone does not prove product taxonomy or a strategic interpretation",()=>{
  const text="ניתן לבחור את האפשרויות בעמוד המוצר";
  const sources=[{id:"s",url:"https://example.test/collections",pageType:"category",text,contentHash:"hash",evidenceChunks:[{id:"c",text}]}];
  const row={category:"products",key:"categories",value:{summary:text,details:[]},sourceId:"s",evidence:text,observationStatus:"observed",confidence:"high"};
  assert.throws(()=>validateAiFindings({findings:[row]},sources,"products_commercial",context),/unsupported_category_taxonomy/);
  assert.throws(()=>validateAiFindings({findings:[{...row,key:"variants"}]},sources,"products_commercial",context),/generic_variant_selector/);
  assert.throws(()=>validateAiFindings({findings:[{...row,category:"voice",key:"tone"}]},sources,"brand_voice",context),/missing_strategic_interpretation/);
});
test("navigation is not a business description and gifting does not prove willingness to pay",()=>{
  const text="Behind The Drinks: כתבות ומתכונים קרא עוד.";
  const sources=[{id:"s",url:"https://example.test/blog",pageType:"blog",text,contentHash:"hash",evidenceChunks:[{id:"c",text}]}];
  const row={category:"brand",key:"brand_description",value:{summary:text,details:[]},sourceId:"s",evidence:text,observationStatus:"observed",confidence:"high"};
  assert.throws(()=>validateAiFindings({findings:[row]},sources,"brand_voice",context),/unsupported_semantic_type/);
  const quote="The kit makes a lovely gift for home hosting.";
  const gift=[{...sources[0],text:quote,evidenceChunks:[{id:"c",text:quote}]}];
  const audience={...row,category:"audience",key:"audience_likely",observationStatus:"inferred",evidence:quote,value:{summary:"Customers are willing to pay for premium hosting.",details:[]}};
  assert.throws(()=>validateAiFindings({findings:[audience]},gift,"audience_problems",context),/unsupported_customer_behavior/);
  assert.equal(validateAiFindings({findings:[{...audience,value:{summary:"Likely gift buyers and home hosts",details:[]}}]},gift,"audience_problems",context).length,1);
});
test("a claim cannot combine source chunks into artificial evidence",()=>{
  const prepared=prepareResearchCandidates("audience_problems",chunks,context.items);
  const row={category:"brand",key:"brand_description",value:{summary:prepared.sources[0].text,details:[]},sourceId:"source",evidence:prepared.sources[0].text,observationStatus:"observed",confidence:"high"};
  assert.throws(()=>validateAiFindings({findings:[row]},prepared.sources,"brand_voice",prepared.context),/cross_chunk_ai_evidence/);
});
test("operational rules cannot become AI observations even with research context",()=>{
  const prepared=prepareResearchCandidates("audience_problems",chunks,context.items);
  const row={category:"commercial",key:"shipping_threshold_claim",value:{summary:"Free shipping from ₪150",details:[]},sourceId:"source",evidence:chunks[0].text,observationStatus:"inferred",confidence:"medium"};
  assert.throws(()=>validateAiFindings({findings:[row]},prepared.sources,"products_commercial",prepared.context),/deterministic_fact_only/);
});
test("candidate input is bounded and preserves late relevant content, excluding legal sources",()=>{
  const rows=Array.from({length:20},(_,n)=>({...source,id:"s"+n,text:("Preparation is simple. ").repeat(600)}));
  rows.push({...source,id:"legal",pageType:"returns",text:"Terms of use. Copyright protects these texts."});
  const corpus=assembleResearchChunks(rows).chunks;
  const late=corpus.at(-1);
  const prepared=prepareResearchCandidates("brand_voice",corpus,[{...context.items[0],category:"brand_business",chunkIds:[late.id]}]);
  assert.ok(prepared.coverage.characters<=32000);assert.ok(prepared.sources.length<=8);
  assert.ok(prepared.sources.every(s=>s.id!=="legal"));
});
