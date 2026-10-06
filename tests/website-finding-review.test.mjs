import test from "node:test";
import assert from "node:assert/strict";
import { applyFindingReview, findingReviewInput, reviewWebsiteFindings } from "../src/lib/website-intelligence/finding-review.ts";
const row={category:"products",key:"variants",value:{summary:"Tastes great",details:[]},evidence:"Tastes great",sourceId:"s",sourceType:"ai",observationStatus:"observed",confidence:"high"};
test("review only filters immutable findings; source proof remains authority",()=>{
  const good={...row,key:"benefits"};
  const result=applyFindingReview([row,good],{decisions:[{index:0,approved:false,reason:"unsupported_semantic_type"},{index:1,approved:true,reason:"supported"}]});
  assert.equal(result.findings[0],good);assert.equal(result.rejected[0].finding,row);
  assert.ok(!findingReviewInput([good]).includes("Research Map"));
});
test("incomplete, duplicate, mismatched or invented review decisions fail closed",()=>{
  for(const decisions of [[],[{index:1,approved:true,reason:"supported"}],[{index:0,approved:false,reason:"supported"}],
    [{index:0,approved:true,reason:"supported"},{index:0,approved:true,reason:"supported"}]]){
    assert.throws(()=>applyFindingReview([row],{decisions}),/invalid_finding_review/);
  }
  assert.throws(()=>applyFindingReview([row],{decisions:[{index:0,approved:false,reason:"unsupported_semantic_type",replacement:"new claim"}]}),/invalid_finding_review/);
});
test("provider refusal/incomplete review cannot publish findings",async()=>{
  const fetch=globalThis.fetch,key=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY="synthetic-test-key";
  try{
    for(const body of [{status:"incomplete"},{output:[{content:[{type:"refusal"}]}]},{output_text:JSON.stringify({decisions:[]})}]){
      globalThis.fetch=async()=>new Response(JSON.stringify(body),{status:200});
      await assert.rejects(reviewWebsiteFindings([row],"gpt-5-mini"),/invalid_finding_review/);
    }
  }finally{globalThis.fetch=fetch;if(key===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=key;}
});
