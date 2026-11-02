import { catalogImportSchema, type DecisionRule, type SupportTemplate } from '@/lib/decision-catalog';
import { CONSTRUCTION_METHODS, DEFAULT_GEO_PARAMS_IV, DEFAULT_GEO_PARAMS_V } from './decision';

export const D1_TEST_BATCH = 'd1_synthetic_v1';
const provenance = { source:'simulation' as const,testBatchId:D1_TEST_BATCH };
const condition = (grade: string,section?: string) => ({ all:[{ field:'grade' as const,op:'eq' as const,value:grade },
  ...(section ? [{ field:'section' as const,op:'eq' as const,value:section }] : [])],excludeAny:[] });
function template(code: string,grade: 'IV'|'V',n: number): SupportTemplate {
  return { code,version:1,name:`临时测试 ${grade} 支护 ${n}`,enabled:true,...provenance,
    parameters:{ steel:{ model:grade === 'IV' ? 'TEST-I16':'TEST-I20',spacingCm:grade === 'IV' ? 80:60 },
      shot:{ strength:'TEST-C25',thicknessCm:grade === 'IV' ? 22:26 },
      anchor:{ type:'测试系统锚杆',diameterMm:22,lengthM:grade === 'IV' ? 3:3.5,longitudinalSpacingCm:120,circumferentialSpacingCm:80 },
      advance:{ type:'测试超前锚杆',diameterMm:22,lengthM:4.5,ringSpacingCm:40,scope:'测试拱部布置范围' } } };
}
const templates = [template('test_iv_main','IV',1),template('test_v_main','V',1),template('test_iv_pilot','IV',2),
  template('test_iv_deep','IV',3),template('test_v_alternative','V',2),template('test_disabled','IV',4)];
templates[5].enabled = false;
const rules: DecisionRule[] = [
  { code:'test_method_full',version:1,name:'测试全断面条件',kind:'method',methodKey:'full',priority:100,enabled:true,
    conditions:{ all:[{ field:'grade',op:'in',values:['I','II','III'] }],excludeAny:[{ field:'water',op:'eq',value:'涌水' }] },reason:'测试 I—III 级条件，不是工程选型依据',templateCode:null,templateVersion:null,...provenance },
  ...(['IV','V'] as const).map((grade): DecisionRule => ({ code:`test_method_${grade.toLowerCase()}`,version:1,name:`测试 ${grade} 工法`,kind:'method',methodKey:grade === 'IV' ? 'bench':'core',priority:100,enabled:true,
    conditions:{ ...condition(grade),excludeAny:[{ field:'water',op:'eq',value:'涌水' }] },reason:'按测试围岩条件匹配；非工程规则',templateCode:null,templateVersion:null,...provenance })),
  { code:'test_method_tie',version:1,name:'测试深埋并列',kind:'method',methodKey:'core',priority:100,enabled:true,
    conditions:{ all:[...condition('IV').all,{ field:'depth',op:'range',min:800,minInclusive:true,maxInclusive:false }],excludeAny:[] },reason:'用于验证同优先级并列，不代表工程适用性',templateCode:null,templateVersion:null,...provenance },
];
for (const [code,grade,section,methodKey] of [
  ['test_iv_main','IV','主洞标准断面','bench'],['test_v_main','V','主洞标准断面','core'],
  ['test_iv_pilot','IV','平导标准断面','bench'],['test_iv_deep','IV','主洞紧急停车带','core'],
] as const) {
  rules.push({ code:`rule_${code}`,version:1,name:`模板映射 ${code}`,kind:'support',methodKey,priority:100,enabled:true,
    conditions:condition(grade,section),reason:'测试完整模板引用',templateCode:code,templateVersion:1,...provenance });
}
export const D1_FIXTURES = catalogImportSchema.parse({ formatVersion:1,rules,templates,observations:[
  { id:'10000000-0000-4000-8000-000000000001',workface:'test_face_a',mileage:'K3601+200',observedAt:'2026-11-01T00:00:00Z',params:DEFAULT_GEO_PARAMS_IV,...provenance },
  { id:'10000000-0000-4000-8000-000000000002',workface:'test_face_a',mileage:'K3600+450',observedAt:'2026-11-01T00:00:00Z',params:DEFAULT_GEO_PARAMS_V,...provenance },
  { id:'10000000-0000-4000-8000-000000000003',workface:'test_face_b',mileage:'K3601+200',observedAt:'2026-11-01T00:00:00Z',params:{ ...DEFAULT_GEO_PARAMS_IV,section:'平导标准断面' },...provenance },
  ...[4,5].map((i) => ({ id:`10000000-0000-4000-8000-${String(i).padStart(12,'0')}`,workface:'test_face_a',mileage:'K3601+900',observedAt:'2026-11-01T00:00:00Z',params:{ ...DEFAULT_GEO_PARAMS_IV,depth:600+i },...provenance })),
  { id:'10000000-0000-4000-8000-000000000006',workface:'test_face_b',mileage:'K3600+450',observedAt:'2026-11-01T00:00:00Z',params:{ grade:'IV',depth:620 },...provenance },
  { id:'10000000-0000-4000-8000-000000000007',workface:'test_face_a',mileage:'K3601+200',observedAt:'2026-10-01T00:00:00Z',params:{ ...DEFAULT_GEO_PARAMS_IV,depth:500 },...provenance },
  { id:'10000000-0000-4000-8000-000000000008',workface:'test_face_a',mileage:'K3601+200',observedAt:'2099-01-01T00:00:00Z',params:{ ...DEFAULT_GEO_PARAMS_IV,depth:999 },...provenance },
] });
export const D1_CATALOG_FIXTURE = { methods:CONSTRUCTION_METHODS,supportByGrade:{},...D1_FIXTURES,formatVersion:undefined,
  dataSource:'local-test',meta:{ workfaces:[{ value:'test_face_a',label:'临时测试主洞工作面',grade:'IV' },{ value:'test_face_b',label:'临时测试平导工作面',grade:'IV' }],
    mileages:['K3601+200','K3600+450','K3601+900','K3599+050'].map((mile) => ({ value:mile,label:mile,mile })) } };
