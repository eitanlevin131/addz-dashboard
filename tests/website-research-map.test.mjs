import test from "node:test";
import assert from "node:assert/strict";
import { assembleResearchChunks } from "../src/lib/website-intelligence/research-chunks.ts";
import { createResearchMap, validateResearchMap, validateResearchReview, mergeResearchItems, researchClauseSpans, RESEARCH_MAP_INSTRUCTIONS } from "../src/lib/website-intelligence/research-map.ts";
const sources = [0, 1].map(n => ({id: "s" + n, url: "https://example.test/" + n, pageType: "about", status: "completed", text: (`Brand ${n} describes its products and the people who use them. `).repeat(30)}));
const chunks = assembleResearchChunks(sources).chunks;
const item = (extra = {}) => ({ category: "brand_business", classification: "observed_pattern", summary: "Brand 0 describes its products", chunkIds: [chunks[0].id], uncertainty: "טענה באתר בלבד", qualifiers: [], evidence: [{chunkId:chunks[0].id,quote:chunks[0].text.slice(0,58)}], ...extra });
test("structured map may synthesize multiple chunks without being a finding", () => {
  assert.equal(validateResearchMap({items:[item({chunkIds:chunks.slice(0,2).map(c=>c.id),evidence:chunks.slice(0,2).map(c=>({chunkId:c.id,quote:c.text.slice(0,58)}))})]}, chunks).length, 1);
});
test("unknown references reject; repeated references normalize without losing provenance", () => {
  assert.throws(()=>validateResearchMap({items:[item({chunkIds:["a".repeat(64)]})]},chunks),/invalid_research_reference/);
  assert.deepEqual(validateResearchMap({items:[item({chunkIds:[chunks[0].id,chunks[0].id]})]},chunks)[0].chunkIds,[chunks[0].id]);
});
test("short AI references resolve to exact original hashes and invalid aliases reject", () => {
  assert.equal(validateResearchMap({items:[item({chunkIds:["C001"]})]},chunks)[0].chunkIds[0],chunks[0].id);
  assert.throws(()=>validateResearchMap({items:[item({chunkIds:["C999"]})]},chunks),/invalid_research_reference/);
});
test("hypotheses require explicit uncertainty; verified classifications are forbidden", () => {
  assert.throws(()=>validateResearchMap({items:[item({classification:"inferred_hypothesis",uncertainty:""})]}, chunks), /unqualified_research_hypothesis/);
  assert.throws(()=>validateResearchMap({items:[item({classification:"verified"})]}, chunks), /invalid_research_schema/);
});
test("unknown categories and unstructured output reject", () => {
  assert.throws(()=>validateResearchMap({text:"free text"},chunks), /invalid_research_schema/);
  assert.throws(()=>validateResearchMap({items:[item({category:"strategy"})]},chunks), /invalid_research_schema/);
});
test("AI request separates untrusted chunks, preserves sources and returns nonpublishable context", async () => {
  let calls = 0;
  const transport = async (url, options) => {
    calls++;
    assert.equal(url,(process.env.OPENAI_API_BASE_URL || "https://api.openai.com").replace(/\/$/, "") + "/v1/responses");
    const body=JSON.parse(options.body), input=JSON.parse(body.input);
    assert.equal(body.store,false);
    assert.ok(body.instructions.includes("UNTRUSTED DATA"));
    assert.equal(input.chunks[0].evidenceLocations[0].sourceId,"s0");
    assert.ok(input.chunks[0].untrustedWebsiteData);
    if(input.untrustedCandidates)return Response.json({output_text:JSON.stringify({decisions:[{index:0,accept:true,reason:"supported"}]}),usage:{input_tokens:100,output_tokens:20}});
    return Response.json({output_text:JSON.stringify({items:[item({chunkIds:[input.chunks[0].chunkId],evidence:[{chunkId:input.chunks[0].chunkId,quote:input.chunks[0].untrustedWebsiteData.slice(0,58)}]})]}),usage:{input_tokens:100,output_tokens:20}});
  };
  const map=await createResearchMap(sources,{apiKey:"mock",transport});
  assert.equal(calls,2);assert.equal(map.verified,false);assert.equal(map.publishable,false);
  assert.equal(map.usage.inputTokens,200);assert.equal(map.runs[0].versions.skillVersion,"4");
  assert.equal(map.categoryCoverage.find(c=>c.category==="brand_business").items,1);
  assert.ok(!("findings" in map));
});
test("provider failures, refusal and incomplete responses are safely handled", async () => {
  for (const [transport,code] of [
    [async()=>{throw Error("secret connection details");},"research_transport_failed"],
    [async()=>new Response("private provider details",{status:429}),"research_rate_limited"],
    [async()=>Response.json({output:[{content:[{type:"refusal"}]}]}),"research_refusal"],
    [async()=>Response.json({status:"incomplete"}),"research_incomplete"],
  ]) await assert.rejects(createResearchMap(sources,{apiKey:"mock",transport}),new RegExp(code));
});
test("Research provider respects the isolated configured base URL without credential leakage", async () => {
  const previous = process.env.OPENAI_API_BASE_URL;
  process.env.OPENAI_API_BASE_URL = "http://127.0.0.1:3071/";
  try {
    await assert.rejects(createResearchMap(sources, { apiKey: "synthetic-only", transport: async (url, options) => {
      assert.equal(url, "http://127.0.0.1:3071/v1/responses");
      assert.equal(options.headers.authorization, "Bearer synthetic-only");
      assert.ok(!options.body.includes("synthetic-only"));
      return new Response("private upstream details", { status: 503 });
    } }), /research_provider_rejected/);
  } finally {
    if (previous === undefined) delete process.env.OPENAI_API_BASE_URL; else process.env.OPENAI_API_BASE_URL = previous;
  }
});
test("multi-batch processing uses all chunk IDs and preserves inference in synthesis", async () => {
  const large = Array.from({length:10},(_,n)=>({...sources[0],id:"long"+n,text:(`Brand ${n} tells a distinct story and describes its own products. `).repeat(200)}));
  const batchChunks=new Set(); let calls=0;
  const transport=async(_url, options)=>{
    calls++;const input=JSON.parse(JSON.parse(options.body).input);
    if(input.untrustedCandidates)return Response.json({output_text:JSON.stringify({decisions:[{index:0,accept:true,reason:"supported"}]})});
    const refs=[input.chunks[0].chunkId];
    if(input.chunks)input.chunks.forEach(c=>batchChunks.add(c.untrustedWebsiteData+":"+c.evidenceLocations[0].sourceId));
    return Response.json({output_text:JSON.stringify({items:[item({classification:"inferred_hypothesis",uncertainty:"השערה בלבד",chunkIds:refs,evidence:[{chunkId:refs[0],quote:input.chunks[0].untrustedWebsiteData.slice(0,58)}]})]})});
  };
  const map=await createResearchMap(large,{apiKey:"mock",transport});
  assert.ok(calls>2);assert.equal(batchChunks.size,map.corpus.chunks.length);
  assert.equal(map.runs.at(-1).task,"research_review");
  assert.equal(map.items[0].classification,"inferred_hypothesis");
});
test("deterministic merge preserves wording, qualifiers, inference and all contributing spans", () => {
  const summary="נקודת איסוף חינם מעל 150; שליח הביתה חינם מעל 300, לפי המקור ההיסטורי מ-2025";
  const a=item({summary,classification:"inferred_hypothesis",uncertainty:"historical"});
  const b={...a,chunkIds:[chunks[1].id],evidence:[{chunkId:chunks[1].id,quote:chunks[1].text.slice(0,58)}]};
  const result=mergeResearchItems([a,b]);
  assert.equal(result.length,1);assert.equal(result[0].summary,summary);
  assert.equal(result[0].classification,"inferred_hypothesis");
  assert.deepEqual(result[0].chunkIds,[chunks[0].id,chunks[1].id]);assert.equal(result[0].evidence.length,2);
});
test("prompt defines brand claims, missing information and partial commercial sections explicitly", () => {
  for(const phrase of ["Brand mission is not", "Product benefits are not", "continuation", "ONLY what it found", "not published findings", "IS allowed as inferred_hypothesis"])assert.ok(RESEARCH_MAP_INSTRUCTIONS.includes(phrase));
});

test("every reference needs an exact supporting span",()=>{
  assert.throws(()=>validateResearchMap({items:[item({evidence:[{chunkId:chunks[0].id,quote:"invented quotation not found"}]})]},chunks),/invalid_research_quote/);
  assert.throws(()=>validateResearchMap({items:[item({chunkIds:chunks.slice(0,2).map(c=>c.id)})]},chunks),/incomplete_research_provenance/);
});
test("review rejects missing decisions, contradictions and inconsistent acceptance",()=>{
  const items=[item()];
  assert.throws(()=>validateResearchReview({decisions:[]},items),/invalid_research_review/);
  assert.equal(validateResearchReview({decisions:[{index:0,accept:true,reason:"false_contradiction"}]},items)[0].accept,false);
  assert.equal(validateResearchReview({decisions:[{index:0,accept:false,reason:"supported"}]},items)[0].accept,false);
  assert.equal(validateResearchReview({decisions:[{index:0,accept:false,reason:"lost_qualifier"}]},items)[0].accept,false);
});
test("rejected notes stay research-only and cannot leak through merge",async()=>{
  const transport=async(_url,options)=>{
    const input=JSON.parse(JSON.parse(options.body).input);
    return Response.json({output_text:JSON.stringify(input.untrustedCandidates?{decisions:[{index:0,accept:false,reason:"false_contradiction"}]}:{items:[item({chunkIds:["C001"],evidence:[{chunkId:"C001",quote:input.chunks[0].untrustedWebsiteData.slice(0,58)}]})]})});
  };
  const map=await createResearchMap(sources,{apiKey:"mock",transport});
  assert.equal(map.items.length,0);assert.equal(map.rejected[0].reason,"false_contradiction");
});
test("different methods, eligibility, product scopes and periods never collapse in consolidation",()=>{
  const rules=[
    "נקודת איסוף חינם מעל 150 שקלים", "שליח לבית חינם מעל 300 שקלים",
    "מ-349 שקלים משלוח רגיל חינם, למעט אקספרס", "אקספרס 25 שקלים לאזורי המרכז בלבד",
    "מארז גיל 25 גרם בדף המוצר", "מארז גיל 35 גרם בפוסט מתאריך 2022",
    "מבצע 24–27 בדצמבר 2025 בלבד, תערובות משתתפות בלבד, לאחר הנחות ולפני משלוח",
  ];
  assert.deepEqual(mergeResearchItems(rules.map(summary=>item({summary}))).map(x=>x.summary),rules);
});
test("review sees original surrounding evidence and all quality exclusions",async()=>{
  let reviewed=false;
  const transport=async(_url,options)=>{
    const body=JSON.parse(options.body),input=JSON.parse(body.input);
    if(input.untrustedCandidates){
      reviewed=true;
      assert.ok(input.chunks[0].untrustedWebsiteData);
      for(const phrase of ["ONE subject", "ALL material conditions", "Estimated times are not guarantees", "Do not conclude contradictions", "ONLY what it found", "ORIGINAL chunks"])assert.ok(body.instructions.includes(phrase),phrase);
      return Response.json({output_text:JSON.stringify({decisions:[{index:0,accept:false,reason:"lost_qualifier"}]})});
    }
    return Response.json({output_text:JSON.stringify({items:[item({chunkIds:["C001"],evidence:[{chunkId:"C001",quote:input.chunks[0].untrustedWebsiteData.slice(0,58)}]})]})});
  };
  const map=await createResearchMap(sources,{apiKey:"mock",transport});
  assert.ok(reviewed);assert.equal(map.rejected[0].reason,"lost_qualifier");
});

test("batch contract cannot declare contradictions, candidates or global missingness",()=>{
  for(const category of ["contradictions","unknowns","candidate_findings"])
    assert.throws(()=>validateResearchMap({items:[item({category})]},chunks),/invalid_research_schema/);
});
test("operational rules require literal, source-traceable structured qualifiers",()=>{
  assert.throws(()=>validateResearchMap({items:[item({category:"shipping_returns_service"})]},chunks),/unstructured_research_rule/);
  const qualifier={kind:"condition",text:chunks[0].text.slice(0,58),chunkId:"C001"};
  const result=validateResearchMap({items:[item({category:"shipping_returns_service",qualifiers:[qualifier]})]},chunks)[0];
  assert.equal(result.qualifiers[0].chunkId,chunks[0].id);
  assert.throws(()=>validateResearchMap({items:[item({qualifiers:[{...qualifier,text:"unconditional guaranteed delivery"}]})]},chunks),/invalid_research_qualifier/);
  assert.throws(()=>validateResearchMap({items:[item({qualifiers:[{...qualifier,chunkId:chunks[1].id}]})]},chunks),/invalid_research_qualifier/);
});
test("identical summary cannot merge different method, scope, period or eligibility clauses",()=>{
  const facts=["pickup point", "home delivery", "regular only except express", "December 2025", "sealed original packaging", "estimate, remote regions excluded"];
  const rules=facts.map(text=>item({category:"shipping_returns_service",summary:"כלל משלוח",qualifiers:[{kind:"condition",text,chunkId:chunks[0].id}]}));
  assert.equal(mergeResearchItems(rules).length,facts.length);
});
test("tone defaults to inferred even when repeated language is observed",()=>{
  const tone=validateResearchMap({items:[item({category:"tone_language",uncertainty:""})]},chunks)[0];
  assert.equal(tone.classification,"inferred_hypothesis");assert.ok(tone.uncertainty);
  const explicit=assembleResearchChunks([{...sources[0],text:"Our voice is playful and informal. We make cocktail kits."}]).chunks;
  const result=validateResearchMap({items:[item({category:"tone_language",chunkIds:[explicit[0].id],evidence:[{chunkId:explicit[0].id,quote:explicit[0].text}]})]},explicit)[0];
  assert.equal(result.classification,"observed_pattern");
});
test("provider selects immutable qualifier spans, preserving estimates and full exceptions",async()=>{
  const policy="משלוח לנקודת איסוף חינם מעל 150 שקלים. משלוח לבית חינם מעל 300 שקלים. זמן משוער: 3 עד 7 ימי עסקים, למעט חגים.";
  const rows=sources.map(s=>({...s,text:policy+"\n\n"+s.text}));
  const transport=async(_url,options)=>{
    const body=JSON.parse(options.body),input=JSON.parse(body.input);
    if(input.untrustedCandidates)return Response.json({output_text:JSON.stringify({decisions:[{index:0,accept:true,reason:"supported"}]})});
    const chunk=input.chunks.find(c=>c.untrustedWebsiteData.includes("זמן משוער"));
    const span=chunk.clauseSpans.find(s=>s.text.includes("זמן משוער"));
    assert.ok(!("text" in body.text.format.schema.properties.items.items.properties.qualifiers.items.properties));
    return Response.json({output_text:JSON.stringify({items:[item({category:"shipping_returns_service",summary:span.text,chunkIds:[chunk.chunkId],qualifiers:[{kind:"timeframe",spanId:span.id}]})]})});
  };
  const result=await createResearchMap(rows,{apiKey:"mock",transport});
  assert.equal(result.items.length,0);
  assert.equal(result.rejected[0].reason,"deterministic_fact_only");
  assert.ok(result.deterministicFacts.some(f=>f.rawValue.includes("זמן משוער: 3 עד 7 ימי עסקים, למעט חגים.")));
  for(const span of researchClauseSpans(result.corpus.chunks)){
    const chunk=result.corpus.chunks.find(c=>c.id===span.chunkId);
    assert.equal(chunk.text.slice(span.start,span.end).trim(),span.text);
  }
  assert.equal(result.absenceAnalysis,"deferred");assert.equal(result.conflictResolution,"deferred");
});
test("selected qualifier references cannot disappear from an item's parent provenance",async()=>{
  const transport=async(_url,options)=>{
    const input=JSON.parse(JSON.parse(options.body).input);
    if(input.untrustedCandidates)return Response.json({output_text:JSON.stringify({decisions:[{index:0,accept:true,reason:"supported"}]})});
    return Response.json({output_text:JSON.stringify({items:[item({chunkIds:[input.chunks[0].chunkId],qualifiers:[{kind:"scope",spanId:input.chunks[1].clauseSpans[0].id}]})]})});
  };
  const result=await createResearchMap(sources,{apiKey:"mock",transport});
  assert.equal(result.items[0].chunkIds.length,2);
  assert.equal(result.items[0].evidence.length,2);
  assert.ok(result.items[0].chunkIds.includes(result.items[0].qualifiers[0].chunkId));
});
test("one-call checkpoints resume generation/review without repeating providers or publishing partial maps",async()=>{
  let calls=0;const stored=[];
  const transport=async(_url,options)=>{
    calls++;const input=JSON.parse(JSON.parse(options.body).input);
    return Response.json({output_text:JSON.stringify(input.untrustedCandidates?{decisions:[{index:0,accept:true,reason:"supported"}]}:{items:[item({chunkIds:["C001"],evidence:[{chunkId:"C001",quote:input.chunks[0].untrustedWebsiteData.slice(0,58)}]})]})});
  };
  const options={apiKey:"mock",transport,requestBudget:1,priorRuns:stored,onRun:async run=>stored.push(run)};
  const first=await createResearchMap(sources,options);assert.equal(first.complete,false);assert.equal(calls,1);
  const resumed=await createResearchMap(sources,options);assert.equal(resumed.complete,true);assert.equal(calls,2);assert.equal(resumed.items.length,1);
  const cached=await createResearchMap(sources,options);assert.equal(cached.complete,true);assert.equal(calls,2);
});
